/**
 * Stage 7 — Status-transition suggestion.
 *
 * Gemma never moves an issue's status by itself (services/statusEngine.js
 * gates every transition); this stage only reads one new piece of evidence —
 * a merged citizen report, or an officer's note — against the issue's current
 * status and says where the civic-complaint lifecycle should go next.
 */
import { textPart } from '../client.js';

export const version = 'status@1';

const FLOW = 'reported -> under_review -> verified -> assigned -> in_progress -> resolved -> closed';

const SYSTEM = `You track the lifecycle of a civic complaint filed with a Bangladeshi city
corporation. The lifecycle is strictly linear:

  ${FLOW}

You will see the issue's CURRENT status and one new UPDATE about it (a citizen's
follow-up report, or a note an official posted). Decide whether this update is
evidence that the issue has moved to the very NEXT stage in the list above —
never further.

Output ONLY a single valid JSON object, no markdown:
- "evidence_type": a short label for what kind of update this is, e.g.
  "repair_started", "duplicate_confirmation", "no_change", "official_dispatch".
- "next_status": the stage the issue should move to. If the update does not
  clearly justify advancing past the CURRENT status, return the CURRENT status
  unchanged — do not guess forward.
- "confidence": 0.0-1.0, how sure you are this update actually describes that
  transition (not how sure you are about the civic problem itself).
- "reason": one short English sentence an officer will read, explaining why.

Rules:
- NEVER suggest skipping a stage, even if the update sounds decisive ("it's
  completely fixed" from "reported" still only justifies "under_review" — you
  do not have independent confirmation of everything in between).
- NEVER suggest moving backward. If the update contradicts the current status,
  say so in "reason" but still return the current status with low confidence.
- A vague or unrelated update is not evidence. When unsure, return the current
  status and a low confidence rather than forcing a transition.`;

/**
 * @param {object} input
 * @param {string} input.currentStatus
 * @param {string} input.updateText
 * @param {{supports_claim?:boolean, evidence_confidence?:number}|null} [input.evidence]
 */
export function buildStatusPrompt({ currentStatus, updateText, evidence }) {
  const evidenceLine = evidence
    ? `A photo came with this update: ${evidence.supports_claim ? 'supports' : 'does NOT clearly support'} ` +
      `the claim (${Math.round((evidence.evidence_confidence ?? 0) * 100)}% confidence).`
    : 'No photo came with this update.';

  return [
    textPart(
      [
        SYSTEM,
        '',
        `CURRENT STATUS: ${currentStatus}`,
        '',
        'NEW UPDATE:',
        `  "${updateText}"`,
        '',
        evidenceLine,
        '',
        'Output:',
      ].join('\n'),
    ),
  ];
}
