/**
 * Server entrypoint. Connects Mongo, wires the Gemma audit logger to the
 * gemma_calls collection, builds the pipeline on the real store + SSE bus, and
 * starts listening.
 *
 * Gemma access still goes through exactly one module (gemma/client.js). This
 * file only injects a logger and storage into it — it never calls a model.
 */
import 'dotenv/config';

import { assertAuthConfig } from './lib/authConfig.js';
import { connectDb } from './lib/db.js';
import { createStore } from './lib/store.js';
import { publish } from './lib/events.js';
import { createPipeline } from './services/pipeline.js';
import { setCallLogger, activeConfig } from './gemma/index.js';
import { GemmaCall } from './models/GemmaCall.js';
import { AdminUser } from './models/AdminUser.js';
import { createApp } from './app.js';

async function main() {
  // Before anything else: an unsafe auth environment must stop the boot, not
  // produce a warning in a log nobody reads (lib/authConfig.js explains both).
  const auth = assertAuthConfig();
  if (auth.demoMode) {
    console.log('[auth] DEMO MODE — OTPs are returned in the API response and shown on screen.');
  }

  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nagorik-setu';
  await connectDb(uri);
  console.log(`[db] connected: ${uri.replace(/\/\/[^@]*@/, '//***@')}`);

  // A database with no console accounts cannot be signed into at all, and the only
  // symptom is "wrong email or password" for every credential someone tries —
  // including the one the README publishes. Admin accounts are never
  // self-registered (models/AdminUser.js), so an empty table means seed:admins has
  // not been run against THIS database. Say it once, at boot, instead of letting a
  // login screen imply the password is wrong.
  //
  // A warning and not a boot failure: the citizen app and the public transparency
  // page work perfectly well with no admins, so this is a valid state — unlike a
  // missing JWT_SECRET, which is why that one refuses to start.
  if ((await AdminUser.countDocuments()) === 0) {
    console.warn('[auth] no console accounts exist in this database — run `npm run seed:admins`');
  }

  // Persist every model call for the Transparency page. A logging failure must
  // never break a pipeline run, so it is swallowed with a warning.
  setCallLogger(async (record) => {
    try {
      await GemmaCall.create(record);
    } catch (err) {
      console.error('[gemma_calls] log write failed:', err.message);
    }
  });

  const store = createStore();
  const { processReport } = createPipeline({ ...store, publish });

  const app = createApp({ processReport });
  const port = Number(process.env.PORT) || 4000;
  app.listen(port, () => {
    console.log(`[api] Nagorik Setu on :${port}  ${JSON.stringify(activeConfig())}`);
  });
}

main().catch((err) => {
  console.error('[fatal] server failed to start:', err);
  process.exit(1);
});
