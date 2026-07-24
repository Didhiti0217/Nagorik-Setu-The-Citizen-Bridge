/**
 * Stage 6 checks — tool planning and answer narration.
 *
 * Two things this exists to catch:
 *  1. Category mapping. The councilor says "dangerous electrical faults";
 *     the model must pick `hazard`, not `utility`. An earlier version got
 *     this wrong, which is why the category glossary was added to the prompt.
 *  2. Narration grounding. Given query results, the model must report ONLY
 *     what is in them. A copilot that invents plausible-sounding civic
 *     statistics for a councilor is worse than no copilot, so the last case
 *     feeds it an EMPTY result set and checks it says so rather than
 *     inventing numbers.
 */
import 'dotenv/config';
import { planCopilotQuery, narrateCopilotAnswer, activeConfig } from '../src/gemma/index.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (ok, label, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `\n        ${detail}` : ''}`);
  ok ? (pass += 1) : (fail += 1);
};

console.log('Copilot checks · config:', JSON.stringify(activeConfig()), '\n');

/* ---------- Part 1: tool planning ---------- */
console.log('--- tool planning ---');

const PLAN_CASES = [
  { q: 'Show me all life-threatening electrical issues still open',
    tool: 'query_issues', wantCategory: 'hazard',
    note: 'danger + electrical must map to hazard, not utility' },
  { q: 'গত সাত দিনে টঙ্গীতে কোন সমস্যা সবচেয়ে বেশি?',
    tool: 'aggregate_by_category', wantDays: 7 },
  { q: 'কোন এলাকায় সবচেয়ে বেশি অভিযোগ আসছে?',
    tool: 'find_hotspots' },
  { q: 'List the garbage complaints from the last three days',
    tool: 'query_issues', wantCategory: 'waste', wantDays: 3 },
];

for (const c of PLAN_CASES) {
  try {
    const { data, meta } = await planCopilotQuery({ question: c.q });
    const bits = [];
    let ok = true;
    if (data.tool !== c.tool) { ok = false; bits.push(`tool=${data.tool} want=${c.tool}`); }
    if (c.wantCategory && data.args.category !== c.wantCategory) {
      ok = false; bits.push(`category=${data.args.category} want=${c.wantCategory}`);
    }
    if (c.wantDays && data.args.days !== c.wantDays) {
      ok = false; bits.push(`days=${data.args.days} want=${c.wantDays}`);
    }
    check(ok, `"${c.q.slice(0, 52)}${c.q.length > 52 ? '…' : ''}"`,
      ok ? `${data.tool} ${JSON.stringify(data.args)} (${meta.latencyMs}ms)`
         : `${bits.join(' · ')}${c.note ? `\n        note: ${c.note}` : ''}`);
  } catch (err) {
    check(false, c.q.slice(0, 52), `THREW ${err.message}`);
  }
  await sleep(1500);
}

/* ---------- Part 2: answer narration ---------- */
console.log('\n--- answer narration ---');

const RESULTS = [
  { _id: 'i1', category: 'hazard', severity: 5, reportCount: 4, summaryEn: 'Transformer sparking at Tongi Bazar', area: 'Tongi' },
  { _id: 'i2', category: 'water',  severity: 4, reportCount: 2, summaryEn: 'Contaminated supply water in Konabari', area: 'Konabari' },
  { _id: 'i3', category: 'waste',  severity: 2, reportCount: 1, summaryEn: 'Garbage pile beside Board Bazar', area: 'Board Bazar' },
];

try {
  const { data, meta } = await narrateCopilotAnswer({
    question: 'টঙ্গীতে সবচেয়ে জরুরি সমস্যা কোনটি?',
    tool: 'query_issues',
    results: RESULTS,
  });
  console.log(`  bn: ${data.answer_bn}`);
  console.log(`  en: ${data.answer_en}`);
  console.log(`  highlights: ${JSON.stringify(data.highlight_issue_ids)}  (${meta.latencyMs}ms)`);

  const hasBangla = /[ঀ-৿]/.test(data.answer_bn);
  check(hasBangla, 'answer_bn is actually in Bangla script');
  // Grounding: it must not name a place absent from the results.
  const invented = ['Chandana', 'Joydebpur', 'Shibbari'].filter((p) => data.answer_en.includes(p));
  check(invented.length === 0, 'no invented locations',
    invented.length ? `mentioned ${invented.join(', ')} — not in the result set` : '');
  check(data.highlight_issue_ids.every((id) => RESULTS.some((r) => r._id === id)),
    'highlighted ids all exist in the results');
} catch (err) {
  check(false, 'narration', `THREW ${err.message}`);
}

await sleep(1500);

/* ---------- Part 3: the honesty case ---------- */
console.log('\n--- narration on an EMPTY result set (must not invent) ---');
try {
  const { data } = await narrateCopilotAnswer({
    question: 'How many fire incidents were reported in Konabari this week?',
    tool: 'query_issues',
    results: [],
  });
  console.log(`  bn: ${data.answer_bn}`);
  console.log(`  en: ${data.answer_en}`);
  const claimsData = /\b([1-9]\d*)\s*(issues?|reports?|incidents?|complaints?)/i.test(data.answer_en);
  check(!claimsData, 'reports "no data" instead of inventing a count',
    claimsData ? 'INVENTED a non-zero count from an empty result set' : '');
} catch (err) {
  check(false, 'empty-set narration', `THREW ${err.message}`);
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
