/**
 * Offline validation of the seed mechanics + corpus — no key, no Atlas.
 *
 * Runs the FULL corpus through the real pipeline against an in-memory Mongo with
 * Gemma in `mock` mode. Mock can't reason, so it can't prove SEMANTIC dedupe
 * (api-smoke.js and the live run cover that) — but it DOES prove:
 *   - every corpus entry parses and processes without throwing,
 *   - all coordinates are valid GeoJSON the 2dsphere index accepts,
 *   - geographic clustering works: co-located reports merge, far ones don't.
 * With mock dedupe always answering "duplicate", the surviving issue count
 * equals the number of distinct locations, and the Tongi cluster (10 co-located
 * reports) must collapse into one high-count issue.
 *
 * Run: npm run seed:smoke
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { connectDb } from '../src/lib/db.js';
import { createStore } from '../src/lib/store.js';
import { publish } from '../src/lib/events.js';
import { createPipeline } from '../src/services/pipeline.js';
import { setCallLogger, setMockFixture } from '../src/gemma/index.js';
import { Report } from '../src/models/Report.js';
import { Issue } from '../src/models/Issue.js';
import { GemmaCall } from '../src/models/GemmaCall.js';
import { CORPUS } from './seed-corpus.js';

const jitter = ([lng, lat], m = 40) => [
  lng + (Math.random() - 0.5) * (m / 111_320),
  lat + (Math.random() - 0.5) * (m / 110_540),
];

let passed = 0;
const failures = [];
const check = (label, cond) => (cond ? (passed += 1, console.log(`  ok   ${label}`)) : (failures.push(label), console.log(`  FAIL ${label}`)));

setMockFixture('triage', {
  category: 'hazard', severity: 5, urgency_reason: 'Mock triage for the seed smoke test.',
  summary_bn: 'পরীক্ষা সারাংশ', summary_en: 'Mock summary', inferred_location: 'Gazipur',
  landmark_confidence: 0.7, department: 'Fire Service', action_required: 'immediate_dispatch',
  is_life_threatening: true, estimated_affected_people: 100, language_detected: 'bn', pii_present: false,
});
setMockFixture('dedupe', { is_duplicate: true, candidate_index: 0, confidence: 0.9, reason: 'Mock: same location.' });
setMockFixture('dispatch', {
  department: 'Fire Service', priority: 'P1', sla_hours: 2, crew: 'mock crew', equipment: ['mock'],
  brief_en: 'Mock brief.', brief_bn: 'পরীক্ষা নির্দেশ।', citizen_sms_bn: 'পরীক্ষা বার্তা।', priority_justification: 'Mock.',
});

let mongod;
try {
  console.log(`Seed smoke — ${CORPUS.length} corpus reports through in-memory Mongo + mock Gemma\n`);
  process.env.GEMMA_PROVIDER = 'mock';

  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri('nagorik-setu'));
  setCallLogger(async (r) => { try { await GemmaCall.create(r); } catch { /* ignore */ } });

  const store = createStore();
  const { processReport } = createPipeline({ ...store, publish });

  let failedRuns = 0;
  for (const entry of CORPUS) {
    const doc = await Report.create({ rawText: entry.text, location: { type: 'Point', coordinates: jitter(entry.at) }, status: 'received' });
    const res = await processReport({ _id: doc._id, rawText: doc.rawText, location: doc.location });
    if (res.error) failedRuns += 1;
  }

  const issues = await Issue.find().sort({ reportCount: -1 }).lean();
  const reports = await Report.find().lean();
  const linked = reports.filter((r) => r.status === 'linked').length;
  const distinctLocations = new Set(CORPUS.map((c) => c.at.join(','))).size;

  check('no report threw during processing', failedRuns === 0);
  check('every report reached status "linked"', linked === CORPUS.length);
  check('dedupe collapsed the queue (fewer issues than reports)', issues.length < CORPUS.length);
  check('issue count tracks distinct locations (mock merges co-located)', issues.length <= distinctLocations + 1);
  check('the 10-report Tongi cluster collapsed into one high-count issue', issues[0].reportCount >= 8);
  check('severe issues got a dispatch brief', issues.some((i) => i.dispatchBrief));
  check('gemma_calls were logged', (await GemmaCall.countDocuments()) > 0);

  console.log(`\n${CORPUS.length} reports -> ${issues.length} issues (${distinctLocations} distinct locations). Top cluster reportCount=${issues[0].reportCount}.`);
  console.log('='.repeat(56));
  console.log(failures.length ? `${passed} passed, ${failures.length} FAILED: ${failures.join(', ')}` : `ALL ${passed} CHECKS PASSED`);
} catch (err) {
  console.error('\nSEED SMOKE THREW:', err);
  failures.push('exception');
} finally {
  await mongoose.disconnect().catch(() => {});
  if (mongod) await mongod.stop();
  process.exit(failures.length === 0 ? 0 : 1);
}
