/**
 * End-to-end pipeline demo with in-memory storage — no MongoDB required.
 *
 * Feeds a realistic burst of Gazipur complaints in which SIX of nine reports
 * describe only TWO physical problems, and shows the pipeline collapsing them.
 * This is the core impact claim of the project, verified rather than asserted.
 *
 * Run: node scripts/pipeline-demo.js
 */
import 'dotenv/config';
import { createPipeline } from '../src/services/pipeline.js';
import { activeConfig } from '../src/gemma/index.js';

/* ---------- in-memory stores standing in for Dev B's Mongo layer ---------- */
const issues = new Map();
const reports = new Map();
let nextId = 1;

/** Haversine — MongoDB does this with $near in the real implementation. */
function distanceM(a, b) {
  const R = 6_371_000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const deps = {
  async findNearbyIssues({ lng, lat, radiusM, sinceHours }) {
    const cutoff = Date.now() - sinceHours * 3_600_000;
    return [...issues.values()]
      .map((i) => ({ ...i, distanceM: distanceM(i.centroid.coordinates, [lng, lat]) }))
      .filter((i) => i.distanceM <= radiusM && new Date(i.createdAt).getTime() >= cutoff)
      .sort((a, b) => a.distanceM - b.distanceM);
  },
  async createIssue(issue) {
    const _id = `issue_${nextId++}`;
    const doc = { ...issue, _id, mergeReasons: [] };
    issues.set(_id, doc);
    return doc;
  },
  async updateIssue(id, patch) {
    const doc = issues.get(id);
    const { $inc, $push, ...set } = patch;
    Object.assign(doc, set);
    for (const [k, v] of Object.entries($inc || {})) doc[k] = (doc[k] || 0) + v;
    for (const [k, v] of Object.entries($push || {})) (doc[k] ||= []).push(v);
    issues.set(id, doc);
    return doc;
  },
  async updateReport(id, patch) {
    reports.set(id, { ...(reports.get(id) || {}), ...patch });
  },
  publish(event, payload) {
    const i = payload.issue;
    if (i) console.log(`    [SSE] ${event}  ${i._id}  reportCount=${i.reportCount}  weight=${i.priorityWeight}`);
  },
};

const { processReport } = createPipeline(deps);

/* ---------- the burst ----------------------------------------------------
 * Reports 1,2,5,8 = ONE sparking transformer at Tongi Bazar
 * Reports 3,7     = ONE flooded road in Konabari
 * Reports 4,6,9   = three genuinely separate problems
 * ------------------------------------------------------------------------ */
const TONGI = [90.4012, 23.8918];
const KONABARI = [90.3702, 23.9705];
const jitter = ([lng, lat], m = 60) => [
  lng + (Math.random() - 0.5) * (m / 111_320),
  lat + (Math.random() - 0.5) * (m / 110_540),
];

const BURST = [
  ['টঙ্গী বাজারের সামনে বিদ্যুতের ট্রান্সফরমার থেকে আগুনের ফুলকি বের হচ্ছে', TONGI],
  ['Transformer sparking badly at Tongi Bazar, people are scared to walk past', TONGI],
  ['কোনাবাড়ীতে রাস্তা পুরো পানির নিচে, রিকশা চলতে পারছে না', KONABARI],
  ['Chandana intersection street light has been off for two weeks', [90.4155, 23.9321]],
  ['tongi bazar er transformer theke ekhono spark hocche, keu ase nai', TONGI],
  ['ময়লার স্তূপ জমে আছে বোর্ড বাজারের পাশে, দুর্গন্ধে টেকা যায় না', [90.3989, 23.9412]],
  ['Konabari main road is flooded again, water is knee deep near the factory', KONABARI],
  ['ট্রান্সফরমারে আগুন লাগবে মনে হচ্ছে, টঙ্গী বাজার, দ্রুত ব্যবস্থা নিন', TONGI],
  ['Drain cover missing near Shibbari Road, a child could fall in', [90.4201, 23.9105]],
];

console.log('Nagorik Setu — pipeline demo (in-memory storage)');
console.log('config:', JSON.stringify(activeConfig()));
console.log(`${BURST.length} citizen reports describing ${new Set(['tongi', 'konabari', 'a', 'b', 'c']).size} distinct problems\n`);

const t0 = Date.now();
for (const [i, [text, base]] of BURST.entries()) {
  const report = {
    _id: `report_${i + 1}`,
    rawText: text,
    location: { type: 'Point', coordinates: jitter(base) },
  };
  reports.set(report._id, report);

  console.log(`[${i + 1}/${BURST.length}] "${text.slice(0, 62)}${text.length > 62 ? '…' : ''}"`);
  const res = await processReport(report);
  if (res.error) { console.log(`    ERROR: ${res.error}\n`); continue; }
  console.log(
    `    ${res.merged ? 'MERGED  ->' : 'NEW     ->'} ${res.issue._id}  ` +
    `${res.triage.category} sev=${res.triage.severity}  (${res.timings.totalMs}ms)`,
  );
  if (res.merged) console.log(`    why: ${res.dupe.reason}`);
  console.log('');
}

/* ---------- the result ---------------------------------------------------- */
console.log('='.repeat(78));
console.log(`\n${BURST.length} reports  ->  ${issues.size} issues\n`);

const ranked = [...issues.values()].sort((a, b) => b.priorityWeight - a.priorityWeight);
for (const i of ranked) {
  console.log(
    `  [w=${String(i.priorityWeight).padStart(3)}] ${i._id}  ${i.category.padEnd(14)} ` +
    `sev=${i.severity}  reports=${i.reportCount}  ${i.dispatchBrief ? i.dispatchBrief.priority : '--'}`,
  );
  console.log(`          ${i.summaryEn}`);
  if (i.reportCount > 1) console.log(`          ${i.reportCount} citizens reported this as one problem`);
  if (i.dispatchBrief) console.log(`          -> ${i.dispatchBrief.department}, SLA ${i.dispatchBrief.sla_hours}h, ${i.dispatchBrief.crew}`);
}

const dupesCollapsed = BURST.length - issues.size;
console.log(`\nDeduplication collapsed ${dupesCollapsed} redundant tickets ` +
            `(${Math.round((dupesCollapsed / BURST.length) * 100)}% of the queue).`);
console.log(`Total wall time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
