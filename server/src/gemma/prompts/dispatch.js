/**
 * Stage 5 — Agentic dispatch brief.
 *
 * Converts a triaged, deduplicated issue into the artifact a municipality
 * actually runs on: a work order. Crew, equipment, priority, SLA, and a
 * Bangla message for the citizens who reported it.
 *
 * We GENERATE the citizen SMS; we do not send it. No SMS integration ships
 * (plan.md §12) and the writeup says so plainly.
 */
import { textPart } from '../client.js';
import { DEPARTMENTS } from '../schemas.js';

export const version = 'dispatch@2';

const SYSTEM = `You are a dispatch coordinator for Gazipur City Corporation, Bangladesh.
Given a verified civic issue, produce the work order a field crew can act on.

Output ONLY a single valid JSON object, no markdown:
- "department": one of ${DEPARTMENTS.join(' | ')}
- "priority": "P1" | "P2" | "P3" | "P4".
  P1 = danger to life, dispatch now. P2 = same day. P3 = this week.
  P4 = routine backlog.
- "sla_hours": integer target hours to resolution, consistent with priority.
- "crew": short description of who should go, e.g. "2-person electrical team
  with bucket truck".
- "equipment": array of short item names.
- "brief_en": 2-4 sentence operational brief in English. State what is wrong,
  where, what the crew will find, and the first action on arrival.
- "brief_bn": the same brief in natural Bangla — a translation for the crew,
  not a transliteration.
- "citizen_sms_bn": under 300 characters, polite Bangla, confirming the
  complaint is received and routed. Do NOT promise a specific fix time.
- "priority_justification": one sentence explaining the priority, citing the
  report count and severity.

Weigh the report count: many citizens reporting one problem means wide impact
and should raise priority, even at moderate severity.`;

/**
 * @param {object} issue
 * @param {number} issue.reportCount how many citizens reported this
 */
export function buildDispatchPrompt({ issue }) {
  return [
    textPart(
      [
        SYSTEM,
        '',
        'ISSUE:',
        `  category:        ${issue.category}`,
        `  severity:        ${issue.severity}/5`,
        `  life threatening: ${issue.isLifeThreatening ? 'YES' : 'no'}`,
        `  location:        ${issue.inferredLocation || '(GPS only)'}`,
        `  reported by:     ${issue.reportCount} citizen(s)`,
        `  people affected: ~${issue.estimatedAffectedPeople ?? 'unknown'}`,
        `  summary:         "${issue.summaryEn}"`,
        `  why urgent:      ${issue.urgencyReason || '(not stated)'}`,
        issue.evidenceConfidence != null
          ? `  photo evidence:  confidence ${issue.evidenceConfidence.toFixed(2)}`
          : null,
        '',
        'Output:',
      ]
        .filter(Boolean)
        .join('\n'),
    ),
  ];
}
