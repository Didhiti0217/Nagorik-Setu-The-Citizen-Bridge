#!/usr/bin/env node
/**
 * Sync the working docs from the parent folder into this repo's docs/.
 *
 * WHY THIS EXISTS
 * ---------------
 * The editable originals live one level up, OUTSIDE this repository, because
 * that folder also holds `secrets.env` (a live Kaggle token and Gemma API key)
 * and must never become a git repo itself.
 *
 * But the parent CLAUDE.md is also what Claude Code auto-loads as project
 * instructions, and the team's `@plan.md` references point there — so the
 * parent stays the source of truth and docs/ is generated from it.
 *
 * Run from the repo root before committing doc changes:
 *     node scripts/sync-docs.mjs
 *
 * Safety: refuses to copy any file whose contents look like a credential.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.resolve(repoRoot, '..');
const docsDir = path.join(repoRoot, 'docs');

const FILES = ['CLAUDE.md', 'plan.md', 'progress_participant_1.md', 'Competition-Link.txt'];

/** Credential shapes. A doc that trips these is a bug, not something to publish. */
const SECRET_PATTERNS = [
  /AIza[0-9A-Za-z_-]{20,}/,        // Google API key
  /\bAQ\.[A-Za-z0-9_-]{20,}/,      // AI Studio key
  /\bKGAT_[a-f0-9]{16,}/i,         // Kaggle token
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

fs.mkdirSync(docsDir, { recursive: true });

let copied = 0;
let unchanged = 0;
let failed = 0;

for (const name of FILES) {
  const src = path.join(sourceDir, name);
  const dst = path.join(docsDir, name);

  if (!fs.existsSync(src)) {
    console.error(`  MISSING   ${name}  (expected at ${src})`);
    failed += 1;
    continue;
  }

  const content = fs.readFileSync(src, 'utf8');

  const tripped = SECRET_PATTERNS.find((re) => re.test(content));
  if (tripped) {
    console.error(`  BLOCKED   ${name}  — contains something matching ${tripped}`);
    console.error('            Refusing to copy a credential into a public repo.');
    failed += 1;
    continue;
  }

  const current = fs.existsSync(dst) ? fs.readFileSync(dst, 'utf8') : null;
  if (current === content) {
    console.log(`  unchanged ${name}`);
    unchanged += 1;
    continue;
  }

  fs.writeFileSync(dst, content);
  console.log(`  SYNCED    ${name}`);
  copied += 1;
}

console.log(`\n${copied} synced, ${unchanged} unchanged, ${failed} failed.`);
if (failed > 0) process.exit(1);
if (copied > 0) console.log('Review with `git diff docs/`, then commit.');
