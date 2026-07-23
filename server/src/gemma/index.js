/**
 * The Gemma 4 engine — public surface.
 *
 * Five cognitive stages, one model. Routes and services import ONLY from
 * here; nothing outside server/src/gemma/ should touch client.js directly.
 *
 * Every stage returns { data, meta } where meta carries latency, provider,
 * model and whether a repair pass was needed — that is what feeds the
 * Transparency page and the benchmark table in the writeup.
 *
 * Token budgets are set per stage because Gemma 4 always reasons first and
 * those thought tokens are billed against the output budget. Measured triage
 * reasoning alone runs 450+ tokens, so budgets here are deliberately roomy.
 */
import { generateJson, GemmaParseError } from './client.js';
import {
  TriageSchema,
  EvidenceSchema,
  DedupeSchema,
  DispatchSchema,
  CopilotCallSchema,
  CopilotAnswerSchema,
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

export { setCallLogger, setMockFixture, activeConfig, GemmaParseError } from './client.js';
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
      maxTokens: 2048,
    });
    return { data, meta, manualReview: false };
  } catch (err) {
    if (err instanceof GemmaParseError) {
      return {
        data: manualReviewFallback(err.message),
        meta: { repaired: false, failed: true },
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
    return { data, meta };
  } catch (err) {
    if (err instanceof GemmaParseError) {
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
    if (err instanceof GemmaParseError) {
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

export const PROMPT_VERSIONS = {
  triage: triageVersion,
  evidence: evidenceVersion,
  dedupe: dedupeVersion,
  dispatch: dispatchVersion,
  copilot: copilotVersion,
};
