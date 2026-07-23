/**
 * Stage 3 — Photo-evidence verification.  ⭐ the innovation hook
 *
 * Asks a vision-language model the question every civic complaint system
 * currently answers with human labour: does this photo actually support this
 * claim? Returns a confidence score plus what it can see, so the councilor
 * can triage unverifiable and malicious reports without opening every one.
 *
 * Design decision: the model is explicitly told that a mismatch is NOT an
 * accusation. Photos get taken from odd angles, in the dark, at a distance.
 * We want low confidence on ambiguous evidence, not a fraud verdict — an
 * over-eager fraud detector would suppress real complaints from the exact
 * low-literacy citizens this product exists to serve.
 */
import { textPart, imagePart } from '../client.js';

export const version = 'evidence@2';

const SYSTEM = `You verify photographic evidence for civic complaints in Gazipur, Bangladesh.

You are given a photo and the complaint text a citizen submitted with it.
Decide whether the photo is consistent with the complaint.

Output ONLY a single valid JSON object, no markdown, no commentary:
- "supports_claim": true if the photo is consistent with the complaint.
- "evidence_confidence": 0.0-1.0. How strongly the photo supports the claim.
  A dark, blurry, or distant photo of the right thing should score LOW
  confidence but still supports_claim=true.
- "visible_elements": array of short phrases for what you actually see.
- "mismatch_reason": if supports_claim is false, one short sentence on why.
  Otherwise null.
- "image_quality": "clear" | "usable" | "poor".

Important judgement rules:
- Ambiguity is not fraud. If you cannot tell, set supports_claim true with a
  low confidence rather than false.
- Set supports_claim false only when the photo clearly shows something
  unrelated to the complaint (for example: a selfie, a screenshot, an indoor
  scene for a road complaint, or a blank wall).
- Never identify or describe individual people. If people are visible, say
  only "people present".`;

/**
 * @param {object} input
 * @param {{data:string,mimeType:string}} input.photo
 * @param {string} input.claimText   the citizen's own words
 * @param {string} [input.summaryEn] Stage-2 summary, gives the model the gist
 */
export function buildEvidencePrompt({ photo, claimText, summaryEn }) {
  return [
    imagePart(photo.data, photo.mimeType),
    textPart(
      [
        SYSTEM,
        '',
        'Complaint text:',
        JSON.stringify(claimText || '(none)'),
        summaryEn ? `Triaged summary: ${summaryEn}` : null,
        '',
        'Output:',
      ]
        .filter(Boolean)
        .join('\n'),
    ),
  ];
}
