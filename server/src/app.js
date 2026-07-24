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

import { reportsRouter } from './routes/reports.js';
import { issuesRouter } from './routes/issues.js';
import { streamRouter } from './routes/stream.js';
import { transparencyRouter } from './routes/transparency.js';
import { copilotRouter } from './routes/copilot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp({ processReport }) {
  const app = express();

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
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir));

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      service: 'nagorik-setu-api',
      db: dbState(),
      gemma: activeConfig(),
      time: new Date().toISOString(),
    });
  });

  app.use('/api/reports', reportsRouter({ processReport, uploadsDir }));
  app.use('/api/issues', issuesRouter());
  app.use('/api/stream', streamRouter());
  app.use('/api/transparency', transparencyRouter());
  app.use('/api/copilot', copilotRouter());

  app.use((req, res) => res.status(404).json({ error: 'not found' }));

  return app;
}
