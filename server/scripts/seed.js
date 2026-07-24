/**
 * Seed the database by running the corpus through the REAL Gemma pipeline.
 *
 * This makes live Gemma calls — there is no faked data (CLAUDE.md §1.7). Expect
 * it to take a while: each report is one triage call (~20s) plus a dedupe call
 * when there are nearby candidates, plus a dispatch brief for severe issues.
 *
 *   node scripts/seed.js            append to whatever is already there
 *   node scripts/seed.js --fresh    wipe issues/reports/gemma_calls first
 *
 * Requires MONGODB_URI and (for GEMMA_PROVIDER=aistudio) GOOGLE_API_KEY in the
 * environment or server/.env. See DEPLOY.md.
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import { connectDb } from '../src/lib/db.js';
import { createStore } from '../src/lib/store.js';
import { publish } from '../src/lib/events.js';
import { createPipeline } from '../src/services/pipeline.js';
import { setCallLogger, activeConfig } from '../src/gemma/index.js';
import { Report } from '../src/models/Report.js';
import { Issue } from '../src/models/Issue.js';
import { GemmaCall } from '../src/models/GemmaCall.js';
import { CORPUS } from './seed-corpus.js';

const FRESH = process.argv.includes('--fresh');

const jitter = ([lng, lat], m = 40) => [
  lng + (Math.random() - 0.5) * (m / 111_320),
  lat + (Math.random() - 0.5) * (m / 110_540),
];

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set. Point it at your Atlas cluster (see DEPLOY.md).');
    process.exit(1);
  }
  const cfg = activeConfig();
  if (cfg.provider === 'aistudio' && !cfg.hasApiKey) {
    console.error('GEMMA_PROVIDER=aistudio but GOOGLE_API_KEY is not set. Aborting.');
    process.exit(1);
  }
  if (cfg.provider === 'mock') {
    console.error('GEMMA_PROVIDER=mock would write fake triage into the DB. Use aistudio or ollama for a real seed.');
    process.exit(1);
  }

  await connectDb(uri);
  setCallLogger(async (r) => { try { await GemmaCall.create(r); } catch (e) { console.error('[gemma_calls]', e.message); } });
  console.log(`DB: ${mongoose.connection.name} | Gemma: ${JSON.stringify(cfg)}`);

  const existing = { issues: await Issue.countDocuments(), reports: await Report.countDocuments() };
  console.log('existing docs:', existing);
  if (FRESH) {
    console.log('--fresh: wiping issues, reports and gemma_calls…');
    await Promise.all([Issue.deleteMany({}), Report.deleteMany({}), GemmaCall.deleteMany({})]);
  } else if (existing.issues || existing.reports) {
    console.log('(appending — pass --fresh to start from a clean database)');
  }

  const store = createStore();
  const { processReport } = createPipeline({ ...store, publish });

  console.log(`\nSeeding ${CORPUS.length} reports through real Gemma. This is slow by design — grab a coffee.\n`);
  const t0 = Date.now();
  let ok = 0;
  let failed = 0;

  for (const [idx, entry] of CORPUS.entries()) {
    const doc = await Report.create({
      rawText: entry.text,
      location: { type: 'Point', coordinates: jitter(entry.at) },
      status: 'received',
    });
    const res = await processReport({ _id: doc._id, rawText: doc.rawText, location: doc.location });
    const n = `[${String(idx + 1).padStart(2)}/${CORPUS.length}]`;
    if (res.error) {
      failed += 1;
      console.log(`${n} ERROR  ${res.error}  :: ${entry.text.slice(0, 40)}`);
    } else {
      ok += 1;
      const tag = res.merged ? 'MERGED' : 'NEW   ';
      console.log(`${n} ${tag} ${res.triage.category.padEnd(14)} sev=${res.triage.severity} ${res.timings.totalMs}ms :: ${entry.text.slice(0, 40)}`);
    }
  }

  const issues = await Issue.find().sort({ priorityWeight: -1 }).lean();
  const collapse = Math.round((1 - issues.length / CORPUS.length) * 100);
  console.log('\n' + '='.repeat(72));
  console.log(`${CORPUS.length} reports  ->  ${issues.length} issues   (${collapse}% of the queue collapsed by dedupe)\n`);
  for (const i of issues) {
    const disp = i.dispatchBrief ? `${i.dispatchBrief.priority} ${i.dispatchBrief.department}` : '--';
    console.log(`  [w=${String(i.priorityWeight).padStart(3)}] ${i.category.padEnd(14)} sev=${i.severity} reports=${String(i.reportCount).padStart(2)} ${disp.padEnd(16)} ${i.summaryEn}`);
  }
  console.log(`\nwall time: ${((Date.now() - t0) / 60_000).toFixed(1)} min | ok=${ok} failed=${failed}`);
  console.log('Done. Open the dashboard / GET /api/issues to see the populated map.');

  await mongoose.disconnect();
}

main().catch((err) => { console.error('[seed] fatal:', err); process.exit(1); });
