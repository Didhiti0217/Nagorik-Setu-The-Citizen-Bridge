/**
 * The Gemma 4 engine — public surface.
 *
 * Several cognitive stages, one model. Routes and services import ONLY from
 * here; nothing outside server/src/gemma/ should touch client.js directly.
 * (The README's "five distinct cognitive roles" figure predates Stage 7 below
 * — update it there if that count is meant to stay in sync.)
 *
 * Every stage returns { data, meta } where meta carries latency, provider,
 * model and whether a repair pass was needed — that is what `npm run eval`
 * scores into the benchmark table in the README and the writeup.
 *
 * Token budgets are set per stage because Gemma 4 always reasons first and
 * those thought tokens are billed against the output budget. Measured triage
 * reasoning alone runs 450+ tokens, so budgets here are deliberately roomy.
 */
import { generateJson, GemmaError, GemmaParseError } from './client.js';
import {
  TriageSchema,
  EvidenceSchema,
  DedupeSchema,
  DispatchSchema,
  CopilotCallSchema,
  CopilotAnswerSchema,
  StatusSuggestionSchema,
  manualReviewFallback,
} from './schemas.js';

import { buildTriagePrompt, version as triageVersion } from './prompts/triage.js';
import { buildEvidencePrompt, version as evidenceVersion } from './prompts/evidence.js';
import { buildDedupePrompt, version as dedupeVersion } from './prompts/dedupe.js';
import { buildDispatchPrompt, version as dispatchVersion } from './prompts/dispatch.js';
import {
  buildToolCallPrompt,
  buildAnswerPrompt,
  version as copilotVersion,
} from './prompts/copilot.js';
import { buildStatusPrompt, version as statusVersion } from './prompts/status.js';

export { setCallLogger, setMockFixture, activeConfig, GemmaError, GemmaParseError } from './client.js';
export * from './schemas.js';

/* ---------------------------------------------------------------- *
 * Stage 2 — Triage
 *
 * Never throws. A citizen's complaint must not vanish because the model had
 * a bad day, so an unparseable response becomes a manual_review record that
 * still lands on the councilor's queue.
 * ---------------------------------------------------------------- */
export async function triageReport({ text, photo, audio, areaHint }) {
  try {
    const { data, meta } = await generateJson({
      stage: 'triage',
      promptVersion: triageVersion,
      parts: buildTriagePrompt({ text, photo, audio, areaHint }),
      schema: TriageSchema,
      temperature: 0.1,
      // Measured: reasoning alone has hit 2045 tokens on a routine report.
      // generate() doubles this on budget exhaustion, so this is a starting
      // point rather than a ceiling.
      maxTokens: 3072,
    });
    return { data, meta, manualReview: false };
  } catch (err) {
    // Catches every GemmaError, not just parse failures. An earlier version
    // caught only GemmaParseError, so a budget-exhaustion or transport error
    // escaped and broke the documented "never throws" contract that Dev B's
    // routes are built on. The evaluation harness found this on report 6 of 30.
    if (err instanceof GemmaError) {
      return {
        data: manualReviewFallback(err.message),
        meta: { repaired: false, failed: true, reason: err.message },
        manualReview: true,
      };
    }
    throw err;
  }
}

/* ---------------------------------------------------------------- *
 * Stage 3 — Photo-evidence verification
 *
 * Degrades to "unverified" rather than failing the submission. A citizen
 * with a bad camera should still get their pothole fixed.
 * ---------------------------------------------------------------- */
export async function verifyEvidence({ photo, claimText, summaryEn }) {
  if (!photo) return { data: null, meta: { skipped: 'no photo' } };

  try {
    const { data, meta } = await generateJson({
      stage: 'evidence',
      promptVersion: evidenceVersion,
      parts: buildEvidencePrompt({ photo, claimText, summaryEn }),
      schema: EvidenceSchema,
      temperature: 0.1,
      maxTokens: 1536,
    });

    // Guard: the model sometimes reads `evidence_confidence` as "confidence in
    // my verdict" rather than "confidence the photo supports the claim", and
    // returns supports_claim=false with confidence 1.0. The prompt now says so
    // explicitly, but a contradictory pair would render as a mismatched issue
    // showing 100% evidence in the UI, so normalise it here as well.
    if (!data.supports_claim && data.evidence_confidence > 0) {
      data.evidence_confidence = 0;
    }
    return { data, meta };
  } catch (err) {
    if (err instanceof GemmaError) {
      return {
        data: {
          supports_claim: true,
          evidence_confidence: 0,
          visible_elements: [],
          mismatch_reason: null,
          image_quality: 'poor',
        },
        meta: { failed: true, reason: err.message },
      };
    }
    throw err;
  }
}

/* ---------------------------------------------------------------- *
 * Stage 4 — Duplicate clustering
 *
 * On any failure we answer "not a duplicate". A missed merge shows up as a
 * redundant ticket an officer closes in seconds; a wrong merge silently
 * buries a real problem. Fail toward the recoverable error.
 * ---------------------------------------------------------------- */
export async function findDuplicate({ report, candidates }) {
  if (!candidates?.length) {
    return { data: { is_duplicate: false, candidate_index: null, confidence: 1, reason: 'No nearby issues on file.' }, meta: { skipped: 'no candidates' } };
  }

  try {
    const { data, meta } = await generateJson({
      stage: 'dedupe',
      promptVersion: dedupeVersion,
      parts: buildDedupePrompt({ report, candidates }),
      schema: DedupeSchema,
      temperature: 0,
      maxTokens: 1024,
    });

    // Guard against an out-of-range index even when the shape validates.
    if (data.is_duplicate && (data.candidate_index == null || !candidates[data.candidate_index])) {
      return {
        data: { ...data, is_duplicate: false, candidate_index: null, reason: `${data.reason} (rejected: candidate index out of range)` },
        meta,
      };
    }
    return { data, meta };
  } catch (err) {
    if (err instanceof GemmaError) {
      return {
        data: { is_duplicate: false, candidate_index: null, confidence: 0, reason: 'Duplicate check failed; treated as a new issue.' },
        meta: { failed: true, reason: err.message },
      };
    }
    throw err;
  }
}

/* ---------------------------------------------------------------- *
 * Stage 5 — Dispatch brief
 * ---------------------------------------------------------------- */
export async function generateDispatchBrief({ issue }) {
  const { data, meta } = await generateJson({
    stage: 'dispatch',
    promptVersion: dispatchVersion,
    parts: buildDispatchPrompt({ issue }),
    schema: DispatchSchema,
    temperature: 0.3,
    maxTokens: 3072,
  });
  return { data, meta };
}

/* ---------------------------------------------------------------- *
 * Stage 6 — Copilot
 * ---------------------------------------------------------------- */
export async function planCopilotQuery({ question }) {
  const { data, meta } = await generateJson({
    stage: 'copilot:plan',
    promptVersion: copilotVersion,
    parts: buildToolCallPrompt({ question }),
    schema: CopilotCallSchema,
    temperature: 0,
    maxTokens: 1024,
  });
  return { data, meta };
}

export async function narrateCopilotAnswer({ question, tool, results }) {
  const { data, meta } = await generateJson({
    stage: 'copilot:answer',
    promptVersion: copilotVersion,
    parts: buildAnswerPrompt({ question, tool, results }),
    schema: CopilotAnswerSchema,
    temperature: 0.3,
    maxTokens: 2048,
  });
  return { data, meta };
}

/* ---------------------------------------------------------------- *
 * Stage 7 — Status-transition suggestion
 *
 * Fails toward "no transition" — a Gemma error here must never move an
 * issue's status, so the caller sees confidence 0 and treats it exactly like
 * any other suggestion the backend gate rejects (services/statusEngine.js).
 * ---------------------------------------------------------------- */
export async function suggestStatus({ currentStatus, updateText, evidence }) {
  try {
    const { data, meta } = await generateJson({
      stage: 'status',
      promptVersion: statusVersion,
      parts: buildStatusPrompt({ currentStatus, updateText, evidence }),
      schema: StatusSuggestionSchema,
      temperature: 0,
      maxTokens: 1024,
    });
    return { data, meta };
  } catch (err) {
    if (err instanceof GemmaError) {
      return {
        data: {
          evidence_type: 'error',
          next_status: currentStatus,
          confidence: 0,
          reason: 'Status suggestion failed; no transition applied.',
        },
        meta: { failed: true, reason: err.message },
      };
    }
    throw err;
  }
}

export const PROMPT_VERSIONS = {
  triage: triageVersion,
  evidence: evidenceVersion,
  dedupe: dedupeVersion,
  dispatch: dispatchVersion,
  copilot: copilotVersion,
  status: statusVersion,
};
