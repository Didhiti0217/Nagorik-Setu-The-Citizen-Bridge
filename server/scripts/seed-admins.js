/**
 * Provision the console accounts. Run once per environment:  npm run seed:admins
 *
 * Admin accounts are never self-registered (models/AdminUser.js), so without this
 * script a freshly deployed API has no way into the councilor console at all.
 * Every other admin arrives by invitation from someone seeded here.
 *
 * Configured entirely from the environment, because the deploy target is Render's
 * dashboard and not a shell:
 *
 *   ADMIN_SEED=gazipur:gcc@nagoriksetu.demo;dhaka-north:dncc@example.gov.bd:s3cret
 *   ADMIN_SEED_PASSWORD=one-password-for-every-entry-without-its-own
 *
 * Each entry is <corporationId>:<email>[:<password>]. A missing password falls
 * back to ADMIN_SEED_PASSWORD; if that is empty too, one is generated and printed
 * ONCE — it is never stored in plaintext and cannot be recovered afterwards.
 *
 * Idempotent: an existing account is left alone (its password is NOT reset) unless
 * --reset-password is passed, so re-running after adding one corporation cannot
 * lock the others' officers out mid-demo.
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';

import mongoose from 'mongoose';

import { connectDb } from '../src/lib/db.js';
import { isCorporationId, CORPORATION_IDS } from '../src/lib/corporations.js';
import { AdminUser } from '../src/models/AdminUser.js';
import { hashPassword } from '../src/services/auth.js';

const RESET = process.argv.includes('--reset-password');

// base64url so a generated password can be pasted into a form or a URL without
// escaping, and read aloud over a phone call without "was that a slash?".
const generatePassword = () => randomBytes(12).toString('base64url');

/**
 * Parse ADMIN_SEED into entries, collecting every problem instead of dying on
 * the first one — a typo in the third entry should not hide a typo in the fourth.
 *
 * @returns {{entries: Array<{corporation, email, password: string|null}>, errors: string[]}}
 */
export function parseAdminSeed(raw) {
  const entries = [];
  const errors = [];
  const seen = new Set();

  for (const chunk of String(raw || '').split(';')) {
    const spec = chunk.trim();
    if (!spec) continue;

    // Split from the left on the first two colons only: a password may itself
    // contain a colon, and it is the last field.
    const first = spec.indexOf(':');
    if (first === -1) {
      errors.push(`"${spec}" is not <corporationId>:<email>[:<password>]`);
      continue;
    }
    const corporation = spec.slice(0, first).trim();
    const rest = spec.slice(first + 1);
    const second = rest.indexOf(':');
    const email = (second === -1 ? rest : rest.slice(0, second)).trim().toLowerCase();
    const password = second === -1 ? null : rest.slice(second + 1);

    if (!isCorporationId(corporation)) {
      errors.push(`"${corporation}" is not a known corporation (${CORPORATION_IDS.join(', ')})`);
      continue;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push(`"${email}" does not look like an email address`);
      continue;
    }
    if (password !== null && password.length < 8) {
      errors.push(`the password for ${email} is shorter than 8 characters`);
      continue;
    }
    if (seen.has(email)) {
      errors.push(`${email} appears twice`);
      continue;
    }
    seen.add(email);
    entries.push({ corporation, email, password });
  }

  return { entries, errors };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set. Point it at your Atlas cluster (see DEPLOY.md).');
    process.exit(1);
  }

  const { entries, errors } = parseAdminSeed(process.env.ADMIN_SEED);
  if (errors.length) {
    console.error('ADMIN_SEED could not be parsed:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  if (!entries.length) {
    console.error(
      'ADMIN_SEED is empty. Set it to at least one <corporationId>:<email> pair — see .env.example.',
    );
    process.exit(1);
  }

  const fallback = process.env.ADMIN_SEED_PASSWORD || '';
  if (fallback && fallback.length < 8) {
    console.error('ADMIN_SEED_PASSWORD is shorter than 8 characters.');
    process.exit(1);
  }

  await connectDb(uri);
  console.log(`DB: ${mongoose.connection.name}\n`);

  const generated = [];
  let created = 0;
  let reset = 0;
  let skipped = 0;

  for (const entry of entries) {
    const existing = await AdminUser.findOne({ email: entry.email });

    if (existing && !RESET) {
      skipped += 1;
      const note =
        existing.corporation === entry.corporation
          ? ''
          : `  ⚠ exists under "${existing.corporation}", NOT "${entry.corporation}"`;
      console.log(`  exists   ${entry.email.padEnd(34)} ${existing.corporation}${note}`);
      continue;
    }

    let plain = entry.password || fallback;
    if (!plain) {
      plain = generatePassword();
      generated.push({ email: entry.email, password: plain });
    }
    const passwordHash = await hashPassword(plain);

    if (existing) {
      // Deliberately does not touch `corporation`: moving an officer between
      // jurisdictions is an authorization change, not a password reset.
      existing.passwordHash = passwordHash;
      existing.disabledAt = null;
      await existing.save();
      reset += 1;
      console.log(`  reset    ${entry.email.padEnd(34)} ${existing.corporation}`);
    } else {
      await AdminUser.create({
        email: entry.email,
        passwordHash,
        name: '',
        corporation: entry.corporation,
        isSeed: true,
      });
      created += 1;
      console.log(`  created  ${entry.email.padEnd(34)} ${entry.corporation}`);
    }
  }

  if (generated.length) {
    console.log(`\n${'='.repeat(72)}`);
    console.log('GENERATED PASSWORDS — copy them now, they are not stored anywhere:\n');
    for (const g of generated) console.log(`  ${g.email.padEnd(34)} ${g.password}`);
    console.log(`${'='.repeat(72)}`);
  }

  console.log(`\ncreated=${created} reset=${reset} untouched=${skipped}`);
  if (skipped && !RESET) {
    console.log('(pass --reset-password to set a new password on the accounts that already exist)');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[seed-admins] fatal:', err);
  process.exit(1);
});
