/**
 * The Express app, as a pure factory.
 *
 * Kept free of DB-connect and listen() so the smoke test (scripts/api-smoke.js)
 * can mount the exact same app against an in-memory Mongo and a mock Gemma. The
 * only thing it needs from the outside is a `processReport` — the wired
 * pipeline — which index.js builds from the real store and index.js's mock.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import cors from 'cors';

import { dbState } from './lib/db.js';
import { activeConfig } from './gemma/index.js';

import { notFound, errorHandler } from './middleware/errors.js';

import { authRouter } from './routes/auth.js';
import { reportsRouter } from './routes/reports.js';
import { issuesRouter } from './routes/issues.js';
import { streamRouter } from './routes/stream.js';
import { transparencyRouter } from './routes/transparency.js';
import { copilotRouter } from './routes/copilot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp({ processReport }) {
  const app = express();

  // Render terminates TLS at a proxy, so without this every request reports the
  // proxy's address as req.ip — and the per-IP rate limiters would throttle the
  // entire internet as if it were one client.
  app.set('trust proxy', 1);

  // CLIENT_ORIGIN="*" must be passed to cors() as the STRING '*', never as
  // ['*']. Given an array, cors treats it as a whitelist of exact origins, so
  // ['*'] matches only a literal origin of "*" — i.e. nothing — and the
  // response carries no Access-Control-Allow-Origin at all. The API then looks
  // healthy to curl while every browser request fails with "Failed to fetch".
  // render.yaml sets CLIENT_ORIGIN="*", so this path is the deployed one.
  const raw = (process.env.CLIENT_ORIGIN || '').trim();
  const origins = !raw || raw === '*' ? '*' : raw.split(',').map((s) => s.trim());
  app.use(cors({ origin: origins }));
  app.use(express.json({ limit: '2mb' }));

  // Evidence photos, served for the dashboard. Ephemeral on most hosts — fine
  // for a demo, and the DB does not depend on them existing.
  //
  // Left public, knowingly. Filenames are random UUIDs and there is no directory
  // listing, so a photo is unguessable, but anyone holding a URL can fetch it.
  // Closing this properly needs signed URLs or a streaming proxy route; it is
  // recorded as an accepted risk rather than half-solved.
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir));

  // Public, and it must stay that way: render.yaml points healthCheckPath here,
  // so guarding it would make Render consider every deploy unhealthy.
  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      service: 'nagorik-setu-api',
      db: dbState(),
      gemma: activeConfig(),
      time: new Date().toISOString(),
    });
  });

  app.use('/api/auth', authRouter());
  app.use('/api/reports', reportsRouter({ processReport, uploadsDir }));
  app.use('/api/issues', issuesRouter());
  app.use('/api/stream', streamRouter());
  app.use('/api/transparency', transparencyRouter());
  app.use('/api/copilot', copilotRouter());

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
