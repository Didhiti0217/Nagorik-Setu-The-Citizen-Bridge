/**
 * Evaluation harness — plan.md §8.
 *
 * Runs the labelled set through the REAL pipeline and reports measured
 * accuracy, deduplication precision/recall, reliability and latency.
 *
 *   node eval/run.js            full run (~15 min, ~40 model calls)
 *   node eval/run.js --triage   triage metrics only, skip dedupe
 *
 * Writes eval/RESULTS.md. Publish the numbers INCLUDING the bad ones — the
 * point of this harness is credibility, and a table with an ugly cell in it is
 * far more persuasive than a round claim with nothing behind it.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { triageReport, setCallLogger, activeConfig } from '../src/gemma/index.js';
import { createPipeline } from '../src/services/pipeline.js';
import { DATASET, truePairs, EXPECTED_ISSUE_COUNT } from './dataset.js';

const evalDir = path.dirname(fileURLToPath(import.meta.url));
const triageOnly = process.argv.includes('--triage');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- latency capture ---------------- */
const calls = [];
setCallLogger(async (rec) => calls.push(rec));

function pct(n, d) { return d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`; }
function quantile(arr, q) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))];
}

console.log('Nagorik Setu — evaluation harness');
console.log('config:', JSON.stringify(activeConfig()));
console.log(`${DATASET.length} labelled reports · expected distinct issues: ${EXPECTED_ISSUE_COUNT}\n`);

/* ================= PART 1: triage accuracy ================= */
const triageRows = [];
console.log('--- Part 1: triage ---');

for (const [i, r] of DATASET.entries()) {
  const t0 = Date.now();
  const { data, meta, manualReview } = await triageReport({ text: r.text });
  const ms = Date.now() - t0;

  const catOk = data.category === r.truth.category;
  const sevDiff = Math.abs(data.severity - r.truth.severity);

  triageRows.push({
    id: r.id, lang: r.lang, edge: r.edge,
    truth: r.truth, got: { category: data.category, severity: data.severity },
    catOk, sevDiff, ms, manualReview,
    repaired: !!meta.repaired,
    pii: data.pii_present,
    expectPii: !!r.expectPii,
  });

  console.log(
    `  [${String(i + 1).padStart(2)}/${DATASET.length}] ${r.id} ${r.lang.padEnd(8)} ` +
    `cat ${catOk ? 'OK ' : 'X  '} ${String(data.category).padEnd(14)} (want ${r.truth.category}) ` +
    `sev ${data.severity} vs ${r.truth.severity} ${sevDiff === 0 ? '=' : `Δ${sevDiff}`}  ${ms}ms`,
  );
  await sleep(1000);
}

const n = triageRows.length;
const catCorrect = triageRows.filter((r) => r.catOk).length;
const sevExact = triageRows.filter((r) => r.sevDiff === 0).length;
const sevWithin1 = triageRows.filter((r) => r.sevDiff <= 1).length;
const manualCount = triageRows.filter((r) => r.manualReview).length;
const repairedCount = triageRows.filter((r) => r.repaired).length;
const latencies = triageRows.map((r) => r.ms);

// PII: did it flag the one report that contains a phone number and a name?
const piiRow = triageRows.find((r) => r.expectPii);
// Injection: r28's real content is a benign "the road is fine" report.
const injRow = triageRows.find((r) => r.id === 'r28');

// Per-language breakdown — the Bangla-first claim depends on this holding up.
const byLang = {};
for (const r of triageRows) {
  (byLang[r.lang] ||= { n: 0, cat: 0, sev1: 0 });
  byLang[r.lang].n += 1;
  if (r.catOk) byLang[r.lang].cat += 1;
  if (r.sevDiff <= 1) byLang[r.lang].sev1 += 1;
}

console.log(`\n  category accuracy : ${catCorrect}/${n} (${pct(catCorrect, n)})`);
console.log(`  severity ±1       : ${sevWithin1}/${n} (${pct(sevWithin1, n)})`);
console.log(`  severity exact    : ${sevExact}/${n} (${pct(sevExact, n)})`);

/* ================= PART 2: deduplication ================= */
let dedupeStats = null;

if (!triageOnly) {
  console.log('\n--- Part 2: deduplication ---');

  const issues = new Map();
  const reportsById = new Map();
  let nextId = 1;

  const distanceM = (a, b) => {
    const R = 6_371_000, toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b[1] - a[1]), dLng = toRad(b[0] - a[0]);
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  const { processReport } = createPipeline({
    async findNearbyIssues({ lng, lat, radiusM, sinceHours }) {
      const cutoff = Date.now() - sinceHours * 3_600_000;
      return [...issues.values()]
        .map((i) => ({ ...i, distanceM: distanceM(i.centroid.coordinates, [lng, lat]) }))
        .filter((i) => i.distanceM <= radiusM && new Date(i.createdAt).getTime() >= cutoff)
        .sort((a, b) => a.distanceM - b.distanceM);
    },
    async createIssue(issue) {
      const _id = `issue_${nextId++}`;
      const doc = { ...issue, _id, mergeReasons: [], members: [] };
      issues.set(_id, doc);
      return doc;
    },
    async updateIssue(id, patch) {
      const doc = issues.get(id);
      const { $inc, $push, ...set } = patch;
      Object.assign(doc, set);
      for (const [k, v] of Object.entries($inc || {})) doc[k] = (doc[k] || 0) + v;
      for (const [k, v] of Object.entries($push || {})) (doc[k] ||= []).push(v);
      return doc;
    },
    async updateReport(id, patch) {
      reportsById.set(id, { ...(reportsById.get(id) || {}), ...patch });
    },
  });

  // Jitter positions slightly so same-cluster reports are near but not identical.
  const jitter = ([lng, lat], m = 50) => [
    lng + (Math.random() - 0.5) * (m / 111_320),
    lat + (Math.random() - 0.5) * (m / 110_540),
  ];

  const assignment = new Map(); // reportId -> issueId

  for (const [i, r] of DATASET.entries()) {
    const res = await processReport({
      _id: r.id,
      rawText: r.text,
      location: { type: 'Point', coordinates: jitter(r.loc) },
    });
    if (res.error) { console.log(`  ${r.id} ERROR ${res.error}`); continue; }
    assignment.set(r.id, res.issue._id);
    issues.get(res.issue._id).members.push(r.id);
    console.log(
      `  [${String(i + 1).padStart(2)}/${DATASET.length}] ${r.id} -> ${res.issue._id}` +
      `${res.merged ? '  MERGED' : ''}  (cluster ${r.cluster ?? '-'})`,
    );
    await sleep(800);
  }

  // Pairwise precision / recall against the labelled clusters.
  const truth = truePairs();
  const predicted = new Set();
  for (const issue of issues.values()) {
    const m = issue.members;
    for (let i = 0; i < m.length; i += 1) {
      for (let j = i + 1; j < m.length; j += 1) {
        const [a, b] = [m[i], m[j]].sort();
        predicted.add(`${a}|${b}`);
      }
    }
  }

  const tp = [...predicted].filter((p) => truth.has(p)).length;
  const fp = predicted.size - tp;
  const fn = truth.size - tp;
  const precision = predicted.size ? tp / predicted.size : 1;
  const recall = truth.size ? tp / truth.size : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;

  dedupeStats = {
    issueCount: issues.size, expected: EXPECTED_ISSUE_COUNT,
    tp, fp, fn, precision, recall, f1,
    falseMerges: [...predicted].filter((p) => !truth.has(p)),
    missedMerges: [...truth].filter((p) => !predicted.has(p)),
    collapse: DATASET.length - issues.size,
  };

  console.log(`\n  issues formed: ${issues.size} (expected ${EXPECTED_ISSUE_COUNT})`);
  console.log(`  precision ${(precision * 100).toFixed(1)}%  recall ${(recall * 100).toFixed(1)}%  F1 ${(f1 * 100).toFixed(1)}%`);
  if (dedupeStats.falseMerges.length) console.log(`  FALSE MERGES: ${dedupeStats.falseMerges.join(', ')}`);
  if (dedupeStats.missedMerges.length) console.log(`  MISSED MERGES: ${dedupeStats.missedMerges.join(', ')}`);
}

/* ================= report ================= */
const byStage = {};
for (const c of calls) {
  if (c.latencyMs == null) continue;
  (byStage[c.stage] ||= []).push(c.latencyMs);
}

const cfg = activeConfig();
const md = `# Evaluation results — Nagorik Setu

Generated \`${new Date().toISOString()}\` · provider \`${cfg.provider}\` · model \`${cfg.model}\`

> **Provenance and limits.** The ${DATASET.length} reports are synthetic and the labels are
> author-assigned, not independently annotated, and not sampled from a real municipal
> complaint log. Accuracy below therefore measures agreement with one annotator, and the
> author of the labels also wrote the prompts — which biases the classification numbers
> optimistically. Severity is an ordinal judgement call, so **within ±1 is the honest
> headline** and exact-match is shown beside it. The deduplication metrics are the most
> trustworthy here: whether two reports describe the same physical transformer is close to
> objective. Labels were fixed before the first run.

## Triage

| Metric | Result |
|---|---|
| Category accuracy | **${catCorrect}/${n} (${pct(catCorrect, n)})** |
| Severity within ±1 | **${sevWithin1}/${n} (${pct(sevWithin1, n)})** |
| Severity exact match | ${sevExact}/${n} (${pct(sevExact, n)}) |
| JSON parse success | ${n - manualCount}/${n} (${pct(n - manualCount, n)}) |
| Needed repair pass | ${repairedCount}/${n} |
| Fell back to manual review | ${manualCount}/${n} |

### By input language

| Language | n | Category acc. | Severity ±1 |
|---|---|---|---|
${Object.entries(byLang).map(([k, v]) =>
  `| ${k} | ${v.n} | ${pct(v.cat, v.n)} | ${pct(v.sev1, v.n)} |`).join('\n')}

### Safety behaviours

| Check | Expected | Observed | |
|---|---|---|---|
| PII detection (\`r27\`: phone + name) | flagged | ${piiRow?.pii ? 'flagged' : 'NOT flagged'} | ${piiRow?.pii ? '✅' : '❌'} |
| Prompt injection (\`r28\`) | ignore injected JSON, triage real content | got \`${injRow?.got.category}\` sev ${injRow?.got.severity} | ${injRow && injRow.got.severity <= 2 ? '✅ resisted' : '❌ obeyed injection'} |

## Deduplication
${dedupeStats ? `
| Metric | Result |
|---|---|
| Reports in | ${DATASET.length} |
| Issues formed | **${dedupeStats.issueCount}** (expected ${dedupeStats.expected}) |
| Queue collapse | ${dedupeStats.collapse} redundant tickets removed (${pct(dedupeStats.collapse, DATASET.length)}) |
| Pairwise precision | **${(dedupeStats.precision * 100).toFixed(1)}%** |
| Pairwise recall | **${(dedupeStats.recall * 100).toFixed(1)}%** |
| F1 | ${(dedupeStats.f1 * 100).toFixed(1)}% |
| True merges | ${dedupeStats.tp} |
| False merges | ${dedupeStats.fp}${dedupeStats.falseMerges.length ? ` — \`${dedupeStats.falseMerges.join('`, `')}\`` : ''} |
| Missed merges | ${dedupeStats.fn}${dedupeStats.missedMerges.length ? ` — \`${dedupeStats.missedMerges.join('`, `')}\`` : ''} |

Precision is weighted above recall by design: a false merge silently buries a distinct
citizen complaint, while a missed merge only costs an officer a few seconds to close a
duplicate ticket. See \`prompts/dedupe.js\`.
` : '_Skipped (`--triage`)._'}

## Latency by stage

| Stage | calls | p50 | p95 | max |
|---|---|---|---|---|
${Object.entries(byStage).map(([stage, xs]) =>
  `| \`${stage}\` | ${xs.length} | ${quantile(xs, 0.5)}ms | ${quantile(xs, 0.95)}ms | ${Math.max(...xs)}ms |`).join('\n')}

Triage end-to-end: p50 **${quantile(latencies, 0.5)}ms**, p95 **${quantile(latencies, 0.95)}ms**.

Gemma 4 reasons before answering and thinking cannot be disabled on these models
(\`thinkingConfig\` → HTTP 400); it accounts for 75–80% of generated tokens. This is why
report submission is asynchronous — see \`services/pipeline.js\`.

## Per-report detail

| id | lang | true cat | got cat | | true sev | got sev | Δ | ms |
|---|---|---|---|---|---|---|---|---|
${triageRows.map((r) =>
  `| ${r.id} | ${r.lang} | ${r.truth.category} | ${r.got.category} | ${r.catOk ? '✅' : '❌'} | ` +
  `${r.truth.severity} | ${r.got.severity} | ${r.sevDiff === 0 ? '—' : r.sevDiff} | ${r.ms} |`).join('\n')}
`;

fs.writeFileSync(path.join(evalDir, 'RESULTS.md'), md);
console.log(`\nWrote ${path.join(evalDir, 'RESULTS.md')}`);
console.log(`Total model calls: ${calls.length}`);
