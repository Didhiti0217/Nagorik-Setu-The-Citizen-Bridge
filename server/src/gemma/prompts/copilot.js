/**
 * Stage 6 — The Councilor's Copilot.  ⭐ the demo moment
 *
 * Two turns:
 *   1. buildToolCallPrompt  — Bangla/English question  ->  one whitelisted tool
 *                             call with typed arguments.
 *   2. buildAnswerPrompt    — query results  ->  a spoken-language answer.
 *
 * SECURITY BOUNDARY. The model never writes a query. It selects one tool from
 * a fixed list and fills typed parameters that zod validates before anything
 * touches MongoDB. A prompt-injected report body therefore cannot reach the
 * database layer — the worst it can do is cause a differently-shaped SELECT.
 * Treat any change to this file as a security change.
 */
import { textPart } from '../client.js';
import { CATEGORIES } from '../schemas.js';

export const version = 'copilot@3';

const TOOL_SPEC = `Available tools:

1. "query_issues" — list individual issues matching filters.
   args: { category, min_severity, days, area, status, limit }

2. "aggregate_by_category" — count issues grouped by category.
   args: { days, area, min_severity }

3. "find_hotspots" — locate geographic clusters with the most reports.
   args: { days, category, limit }

Argument types (use null when the user did not specify):
  category      : ${CATEGORIES.join(' | ')} | null
  min_severity  : integer 1-5 | null

Category meanings — map the councilor's everyday words onto these exactly:
  hazard         : anything that can injure or kill someone soon — live or fallen
                   electric wires, sparking transformers, gas leaks, fire risk,
                   open manholes, missing drain covers, collapsing structures.
                   "electrical" + "dangerous"/"life-threatening" is ALWAYS hazard.
  utility        : services that are out but not dangerous — streetlights,
                   routine power outages, cable faults.
  water          : supply outages, low pressure, contaminated drinking water.
  sanitation     : drains, sewerage, overflowing drainage, mosquitoes, health risk.
  waste          : uncollected rubbish, illegal dumping, garbage piles.
  infrastructure : roads, footpaths, bridges, potholes, flooding of roads.
  traffic        : congestion, signals, illegal parking, road obstruction.

When a question mixes a domain with danger ("dangerous electrical faults"),
danger wins: choose hazard, not the domain category.
  days          : integer 1-365 | null   (how far back to look)
  area          : string | null          (ward, road, market or area name)
  status        : "open" | "dispatched" | "resolved" | null
  limit         : integer 1-100 | null`;

const SYSTEM = `You are the data copilot for a ward councilor at Gazipur City Corporation.
The councilor asks questions in Bangla or English about civic issues in their ward.
Translate the question into exactly ONE tool call.

${TOOL_SPEC}

Output ONLY a single valid JSON object, no markdown:
- "tool": the tool name.
- "args": the argument object. Omitted arguments must be null, not missing.
- "intent_bn": one short Bangla sentence restating what you understood, shown
  back to the councilor so they can tell if you misread them.

Rules:
- Choose exactly one tool. Never invent a tool name.
- "সবচেয়ে বেশি সমস্যা কোথায়" / "where are the worst areas" -> find_hotspots.
- "কোন ধরনের সমস্যা বেশি" / "what kind of problems" -> aggregate_by_category.
- Anything asking to see or list specific complaints -> query_issues.
- If no time window is stated, default days to 30.`;

export function buildToolCallPrompt({ question }) {
  return [
    textPart([SYSTEM, '', `Councilor's question: ${JSON.stringify(question)}`, '', 'Output:'].join('\n')),
  ];
}

const ANSWER_SYSTEM = `You are the data copilot for a ward councilor at Gazipur City Corporation.
You asked the database a question and received results. Report them back.

Output ONLY a single valid JSON object, no markdown:
- "answer_bn": the answer in natural Bangla, 1-3 sentences. Lead with the
  number that matters most.
- "answer_en": the same answer in English.
- "highlight_issue_ids": array of issue ids worth highlighting on the map,
  most important first. Empty array if not applicable.

Rules:
- Use ONLY the data provided. Never invent counts, places, or trends.
- If the result set is empty, say so plainly — do not speculate about why.
- Be specific: name areas and give numbers rather than saying "several".`;

export function buildAnswerPrompt({ question, tool, results }) {
  return [
    textPart(
      [
        ANSWER_SYSTEM,
        '',
        `Councilor asked: ${JSON.stringify(question)}`,
        `Tool used: ${tool}`,
        '',
        'Results (JSON):',
        JSON.stringify(results, null, 2).slice(0, 6000),
        '',
        'Output:',
      ].join('\n'),
    ),
  ];
}
