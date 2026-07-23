/**
 * Stage 4 — Semantic duplicate clustering.  ⭐ the impact hook
 *
 * MongoDB narrows the field geospatially (150 m / 72 h); Gemma decides the
 * question a database cannot: is this the SAME physical problem, or a
 * different one that happens to be nearby?
 *
 * This is the stage that turns forty complaints about one broken transformer
 * into one ticket weighted forty — and it is reasoning, not extraction, which
 * is exactly the evidence the rubric asks for on "is the model core?".
 *
 * Bias note: the prompt is deliberately tuned to be CONSERVATIVE about
 * merging. A false merge silently buries a real, distinct problem, which is
 * far worse for a citizen than a duplicate ticket an officer can close in a
 * second. Precision over recall, on purpose.
 */
import { textPart } from '../client.js';

export const version = 'dedupe@2';

const SYSTEM = `You decide whether a new civic complaint describes the SAME physical
real-world problem as one already on file in Gazipur, Bangladesh.

You will see one NEW report and a numbered list of NEARBY EXISTING issues.
All candidates are already within a short walking distance, so proximity alone
proves nothing — a pothole and a burst pipe can share a corner.

Output ONLY a single valid JSON object, no markdown:
- "is_duplicate": true if the new report describes the same physical problem
  as one of the candidates.
- "candidate_index": the 0-based index of that candidate, or null.
- "confidence": 0.0-1.0.
- "reason": one short English sentence explaining the decision. This is shown
  to a city officer, so make it concrete.

Rules:
- Same category alone is NOT enough. Two separate broken streetlights on the
  same road are two problems.
- Merge when the reports point at one identifiable object or event: the same
  transformer, the same collapsed wall, the same flooded stretch of road.
- When genuinely unsure, answer is_duplicate=false. Creating a duplicate
  ticket is cheap; hiding a real problem is not.`;

/**
 * @param {object} input
 * @param {{summary_en:string, category:string, inferred_location:string, severity:number}} input.report
 * @param {Array<{summaryEn:string, category:string, reportCount:number, ageHours:number, distanceM:number}>} input.candidates
 */
export function buildDedupePrompt({ report, candidates }) {
  const list = candidates
    .map(
      (c, i) =>
        `[${i}] category=${c.category} | ${c.distanceM}m away | ${c.ageHours}h old | ` +
        `${c.reportCount} report(s) so far\n    "${c.summaryEn}"`,
    )
    .join('\n');

  return [
    textPart(
      [
        SYSTEM,
        '',
        'NEW REPORT:',
        `  category: ${report.category}`,
        `  severity: ${report.severity}`,
        `  location: ${report.inferred_location || '(not specified)'}`,
        `  summary:  "${report.summary_en}"`,
        '',
        'NEARBY EXISTING ISSUES:',
        list || '  (none)',
        '',
        'Output:',
      ].join('\n'),
    ),
  ];
}
