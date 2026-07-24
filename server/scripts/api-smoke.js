/**
 * End-to-end smoke test for the Dev B backend — no cloud account, no API key.
 *
 * Spins up an in-memory MongoDB and the REAL Express app, with Gemma set to the
 * `mock` provider so the five stages return fixtures instead of calling a model.
 * Everything else is real: geospatial dedupe, the async 202 pipeline, SSE, the
 * gemma_calls audit log, and the copilot tool boundary.
 *
 * This proves the whole storage + routing layer wires correctly against the
 * frozen pipeline before we point it at Atlas. Run: npm run api:smoke
 */
import { MongoMemoryServer } from 'mongodb-memory-server';

import { connectDb } from '../src/lib/db.js';
import { createStore } from '../src/lib/store.js';
import { publish, subscribe } from '../src/lib/events.js';
import { createPipeline } from '../src/services/pipeline.js';
import { setCallLogger, setMockFixture } from '../src/gemma/index.js';
import { GemmaCall } from '../src/models/GemmaCall.js';
import { createApp } from '../src/app.js';

/* ---------- assertions ---------------------------------------------------- */
let passed = 0;
const failures = [];
function check(label, cond) {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL ${label}`);
  }
}

/* ---------- mock Gemma fixtures (valid against schemas.js) ---------------- */
const FIXTURES = {
  triage: {
    category: 'hazard', severity: 5,
    urgency_reason: 'Live sparking power line in a crowded market.',
    summary_bn: 'টঙ্গী বাজারে বিদ্যুতের তার স্পার্ক করছে',
    summary_en: 'Live power line sparking at Tongi market',
    inferred_location: 'Tongi Bazar', landmark_confidence: 0.9,
    department: 'Fire Service', action_required: 'immediate_dispatch',
    is_life_threatening: true, estimated_affected_people: 500,
    language_detected: 'bn', pii_present: false,
  },
  evidence: {
    supports_claim: true, evidence_confidence: 0.8,
    visible_elements: ['power line', 'sparks'], mismatch_reason: null,
    image_quality: 'clear',
  },
  // Always "duplicate of candidate 0" — the 2nd nearby report merges into the 1st.
  dedupe: {
    is_duplicate: true, candidate_index: 0, confidence: 0.92,
    reason: 'Same sparking transformer at Tongi Bazar, reported again.',
  },
  dispatch: {
    department: 'Fire Service', priority: 'P1', sla_hours: 1,
    crew: '4-person emergency electrical crew', equipment: ['insulated gloves', 'cordon tape'],
    brief_en: 'Isolate and make safe the sparking line at Tongi Bazar entrance.',
    brief_bn: 'টঙ্গী বাজারে বিদ্যুতের লাইন বিচ্ছিন্ন করে নিরাপদ করুন।',
    citizen_sms_bn: 'আপনার অভিযোগ পেয়েছি। দ্রুত ব্যবস্থা নেওয়া হচ্ছে।',
    priority_justification: 'Immediate electrocution risk in a crowded market.',
  },
  'copilot:plan': {
    tool: 'aggregate_by_category',
    args: { category: null, min_severity: null, days: 7, area: null, status: null, limit: null },
    intent_bn: 'গত সাত দিনের সমস্যা',
  },
  'copilot:answer': {
    answer_bn: 'গত সাত দিনে বিপজ্জনক সমস্যা সবচেয়ে বেশি রিপোর্ট হয়েছে।',
    answer_en: 'Hazard issues were reported most in the last seven days.',
    highlight_issue_ids: [],
  },
};

const TONGI = { lng: 90.4012, lat: 23.8918 };

/* ---------- helpers ------------------------------------------------------- */
async function waitFor(fn, { tries = 40, gapMs = 250 } = {}) {
  for (let i = 0; i < tries; i += 1) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, gapMs));
  }
  return false;
}

/* ---------- run ----------------------------------------------------------- */
let mongod;
let server;
try {
  console.log('Nagorik Setu — API smoke test (in-memory Mongo + mock Gemma)\n');

  process.env.GEMMA_PROVIDER = 'mock';
  for (const [stage, value] of Object.entries(FIXTURES)) setMockFixture(stage, value);

  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri('nagorik-setu'));
  setCallLogger(async (rec) => { try { await GemmaCall.create(rec); } catch (e) { console.error(e.message); } });

  const store = createStore();
  const { processReport } = createPipeline({ ...store, publish });
  const app = createApp({ processReport });

  // Capture SSE broadcasts to prove the pipeline publishes live events.
  const sseEvents = [];
  subscribe((e) => sseEvents.push(e.event));

  server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  // 1. health
  const health = await (await fetch(`${base}/api/health`)).json();
  check('GET /api/health ok', health.ok === true);
  check('health reports mock provider', health.gemma.provider === 'mock');

  // 2. first report -> 202 + new issue
  const r1 = await fetch(`${base}/api/reports`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawText: 'টঙ্গী বাজারে ট্রান্সফরমার স্পার্ক করছে', ...TONGI }),
  });
  check('POST /api/reports returns 202', r1.status === 202);
  const r1body = await r1.json();
  check('202 body carries a report id', Boolean(r1body.id));

  const gotIssue = await waitFor(async () => {
    const issues = await (await fetch(`${base}/api/issues`)).json();
    return issues.length === 1;
  });
  check('pipeline created one issue from the first report', gotIssue);

  // 3. second nearby report -> merges, does NOT create a new issue
  await fetch(`${base}/api/reports`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawText: 'transformer sparking again at tongi bazar', ...TONGI }),
  });
  const merged = await waitFor(async () => {
    const issues = await (await fetch(`${base}/api/issues`)).json();
    return issues.length === 1 && issues[0].reportCount === 2;
  });
  check('second nearby report merged (1 issue, reportCount=2)', merged);

  const issues = await (await fetch(`${base}/api/issues`)).json();
  const issue = issues[0];
  check('merged issue has a dispatch brief (severity 5)', Boolean(issue.dispatchBrief));
  check('priorityWeight computed', issue.priorityWeight > 0);
  check('merge reason recorded', issue.mergeReasons.length === 1);

  // 4. GeoJSON shape for the map layer
  const geo = await (await fetch(`${base}/api/issues?format=geojson`)).json();
  check('GeoJSON FeatureCollection returned', geo.type === 'FeatureCollection' && geo.features.length === 1);
  check('feature geometry is a Point', geo.features[0].geometry.type === 'Point');

  // 5. SSE fired for both create and update
  check('SSE published issue:created', sseEvents.includes('issue:created'));
  check('SSE published issue:updated', sseEvents.includes('issue:updated'));

  // 6. transparency audit log populated
  const trans = await (await fetch(`${base}/api/transparency`)).json();
  check('gemma_calls logged to transparency', trans.count > 0);

  // 7. copilot round-trip through the whitelisted tool boundary
  const cop = await fetch(`${base}/api/copilot`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'গত সাত দিনে সবচেয়ে বেশি কোন সমস্যা?' }),
  });
  check('POST /api/copilot returns 200', cop.status === 200);
  const copBody = await cop.json();
  check('copilot used a whitelisted tool', copBody.tool === 'aggregate_by_category');
  check('copilot answered in Bangla', Boolean(copBody.answer?.answer_bn));

  // 8. bad input is rejected, not crashed
  const bad = await fetch(`${base}/api/reports`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawText: 'no coordinates here' }),
  });
  check('report without coordinates is a 400', bad.status === 400);

  console.log(`\n${'='.repeat(60)}`);
  if (failures.length === 0) {
    console.log(`ALL ${passed} CHECKS PASSED`);
  } else {
    console.log(`${passed} passed, ${failures.length} FAILED:`);
    for (const f of failures) console.log(`  - ${f}`);
  }
} catch (err) {
  console.error('\nSMOKE TEST THREW:', err);
  failures.push('unexpected exception');
} finally {
  if (server) server.close();
  const mongoose = (await import('mongoose')).default;
  await mongoose.disconnect().catch(() => {});
  if (mongod) await mongod.stop();
  process.exit(failures.length === 0 ? 0 : 1);
}
