/**
 * The backend half of AI-assisted status tracking (docs/plan.md).
 *
 * Gemma suggests a next status (gemma/index.js:suggestStatus); this module is
 * the only thing that decides whether a suggestion is actually applied. Gemma
 * never writes the database directly — every caller in services/pipeline.js
 * and routes/issues.js must go through decideStatusTransition() and act on its
 * verdict, never on the raw Gemma output.
 */
import { STATUSES } from '../gemma/schemas.js';

export const STATUS_ORDER = STATUSES;

// Matches the worked example in the design doc almost exactly ("confidence >
// 0.90"). A status change is visible to residents and can trigger real
// dispatch work, so the bar is deliberately higher than the 0.5 default a
// generic classifier might use.
export const MIN_CONFIDENCE = 0.9;

/** Is `next` exactly the one status immediately after `current` in the flow? */
export function isSingleForwardStep(current, next) {
  const from = STATUS_ORDER.indexOf(current);
  const to = STATUS_ORDER.indexOf(next);
  return from !== -1 && to === from + 1;
}

/**
 * The gate. Returns the status to apply, or null if the suggestion is rejected
 * — never throws, since "reject and log why" is itself the correct outcome for
 * a low-confidence or out-of-order suggestion, not an error.
 *
 * @param {object} input
 * @param {string} input.currentStatus
 * @param {{next_status:string, confidence:number}} input.suggestion
 * @returns {{ accepted: boolean, nextStatus: string|null, rejectReason: string|null }}
 */
export function decideStatusTransition({ currentStatus, suggestion }) {
  if (!suggestion) {
    return { accepted: false, nextStatus: null, rejectReason: 'no suggestion' };
  }
  if (suggestion.next_status === currentStatus) {
    return { accepted: false, nextStatus: null, rejectReason: 'no change suggested' };
  }
  if (suggestion.confidence < MIN_CONFIDENCE) {
    return { accepted: false, nextStatus: null, rejectReason: `confidence ${suggestion.confidence} below ${MIN_CONFIDENCE}` };
  }
  if (!isSingleForwardStep(currentStatus, suggestion.next_status)) {
    return { accepted: false, nextStatus: null, rejectReason: `${currentStatus} -> ${suggestion.next_status} is not the next step` };
  }
  return { accepted: true, nextStatus: suggestion.next_status, rejectReason: null };
}
