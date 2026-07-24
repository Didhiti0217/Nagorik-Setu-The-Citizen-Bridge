/**
 * Stage 3 validation on REAL photos — the feature that was never tested on a
 * real photograph until now.
 *
 * Drop civic photos into server/eval/photos/ and run:
 *     node scripts/evidence-test.js
 *
 * For each photo it does two real Gemma-4 vision calls:
 *   1. VISION TRIAGE — given only the image, what civic problem is this?
 *      (category, severity, what it sees) — tests the model reading a real
 *      street scene cold.
 *   2. EVIDENCE VERIFICATION (Stage 3) — pair the photo with a claim and ask
 *      whether the image supports it. If a sidecar `<name>.txt` exists it is
 *      used as the claim; otherwise the vision-triage summary is reused, and
 *      we ALSO run one deliberate mismatch (the photo vs an unrelated claim)
 *      so the "does not support" path is exercised too.
 *
 * Writes eval/evidence-results.md. Nothing here is committed — the photos are
 * gitignored (many are stock/news images with their own licenses).
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { triageReport, verifyEvidence, activeConfig } from '../src/gemma/index.js';

const evalDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'eval');
const photoDir = path.join(evalDir, 'photos');
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// An unrelated claim, to force the mismatch path when no sidecar claim is given.
const DECOY_CLAIM = 'The street lights on this road have not worked for two weeks at night.';

if (!fs.existsSync(photoDir)) {
  console.error(`No photo folder. Create ${photoDir} and add images.`);
  process.exit(1);
}

const photos = fs.readdirSync(photoDir).filter((f) => MIME[path.extname(f).toLowerCase()]);
if (photos.length === 0) {
  console.error(`No images in ${photoDir}. Add .jpg/.png/.webp files and re-run.`);
  process.exit(1);
}

console.log('Stage 3 validation on real photos');
console.log('config:', JSON.stringify(activeConfig()));
console.log(`${photos.length} photo(s)\n${'='.repeat(72)}`);

const rows = [];

for (const [i, file] of photos.entries()) {
  const buf = fs.readFileSync(path.join(photoDir, file));
  const photo = { data: buf.toString('base64'), mimeType: MIME[path.extname(file).toLowerCase()] };
  const sizeKb = Math.round(buf.length / 1024);

  console.log(`\n[${i + 1}/${photos.length}] ${file} (${sizeKb} KB)`);

  // 1. Vision triage — image only, no text.
  let triage;
  try {
    const t0 = Date.now();
    const res = await triageReport({ text: '', photo });
    triage = res.data;
    console.log(
      `  VISION → ${triage.category} sev=${triage.severity}  (${Date.now() - t0} ms)\n` +
      `          en: ${triage.summary_en}`,
    );
  } catch (err) {
    console.log(`  VISION threw: ${err.message}`);
    rows.push({ file, error: err.message });
    continue;
  }
  await sleep(1200);

  // Claim: sidecar .txt if present, else the model's own reading.
  const base = file.replace(/\.[^.]+$/, '');
  const sidecar = path.join(photoDir, `${base}.txt`);
  const claim = fs.existsSync(sidecar) ? fs.readFileSync(sidecar, 'utf8').trim() : triage.summary_en;

  // 2a. Evidence verification against the matching claim → expect supports_claim=true.
  let match;
  try {
    const res = await verifyEvidence({ photo, claimText: claim, summaryEn: triage.summary_en });
    match = res.data;
    console.log(
      `  MATCH  → supports=${match.supports_claim} conf=${match.evidence_confidence} ` +
      `quality=${match.image_quality}`,
    );
    if (match.visible_elements?.length) console.log(`          sees: ${match.visible_elements.join(', ')}`);
  } catch (err) {
    console.log(`  MATCH threw: ${err.message}`);
  }
  await sleep(1200);

  // 2b. Deliberate mismatch → expect supports_claim=false (unless the decoy
  //     happens to fit, e.g. an actual streetlight photo).
  let mismatch;
  try {
    const res = await verifyEvidence({ photo, claimText: DECOY_CLAIM, summaryEn: 'streetlight outage' });
    mismatch = res.data;
    console.log(`  DECOY  → supports=${mismatch.supports_claim} conf=${mismatch.evidence_confidence}` +
      (mismatch.mismatch_reason ? ` — ${mismatch.mismatch_reason}` : ''));
  } catch (err) {
    console.log(`  DECOY threw: ${err.message}`);
  }
  await sleep(1200);

  rows.push({
    file, triage, claim,
    matchSupports: match?.supports_claim, matchConf: match?.evidence_confidence,
    decoySupports: mismatch?.supports_claim,
  });
}

/* ---- report ---- */
const ok = rows.filter((r) => !r.error);
const matchTrue = ok.filter((r) => r.matchSupports === true).length;
const decoyFalse = ok.filter((r) => r.decoySupports === false).length;

const md = `# Stage 3 — real-photo validation

Generated \`${new Date().toISOString()}\` · model \`${activeConfig().model}\` · ${photos.length} photos.

> Photos are gitignored (many are stock/news images with their own licenses). This page
> reports only the model's behaviour, not the images. Vision triage is image-only: the
> model is given the photo and no text, and must identify the civic problem cold.

| Metric | Result |
|---|---|
| Photos where evidence matched the claim | ${matchTrue}/${ok.length} |
| Photos where an unrelated decoy claim was rejected | ${decoyFalse}/${ok.length} |

## Per-photo

| Photo | Vision category | Sev | Supports matching claim | Rejects decoy |
|---|---|---|---|---|
${rows.map((r) => r.error
  ? `| ${r.file} | ERROR | — | — | — |`
  : `| ${r.file} | ${r.triage.category} | ${r.triage.severity} | ${r.matchSupports ? '✅' : '❌'} ${r.matchConf ?? ''} | ${r.decoySupports === false ? '✅' : '❌'} |`,
).join('\n')}

**Reading it.** "Supports matching claim" should be ✅ — the photo backs its own description.
"Rejects decoy" should be ✅ for most photos — an unrelated streetlight claim should not be
supported by a photo of garbage or a wrecked auto. A photo that genuinely shows a streetlight
issue may legitimately accept the decoy.
`;

fs.writeFileSync(path.join(evalDir, 'evidence-results.md'), md);
console.log(`\n${'='.repeat(72)}`);
console.log(`matched claim: ${matchTrue}/${ok.length}   ·   rejected decoy: ${decoyFalse}/${ok.length}`);
console.log(`wrote ${path.join(evalDir, 'evidence-results.md')}`);
