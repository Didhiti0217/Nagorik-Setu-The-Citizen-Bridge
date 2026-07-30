/**
 * GET /api/transparency — the last 100 Gemma calls, raw.
 *
 * Answers the judge's unspoken question — "is this real, or faked for the
 * demo?" — with stage, modalities, latency and the actual model output for
 * every call (plan.md §5). Also the source of the benchmark table's latency
 * numbers. ~45 minutes of work for points that are otherwise hard to earn.
 *
 * DELIBERATELY PUBLIC — do not add a guard here. Reporting now requires a
 * sign-in, and this page (with /api/health) is what keeps the promise that the
 * demo is inspectable without an account: a judge who never logs in can still
 * watch real Gemma calls, their latencies and their raw output. Locking it down
 * would remove the only evidence-of-realness reachable from outside the app.
 */
import { Router } from 'express';

import { GemmaCall } from '../models/GemmaCall.js';

export function transparencyRouter() {
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 100, 500);
      const calls = await GemmaCall.find().sort({ createdAt: -1 }).limit(limit).lean();

      // Cheap aggregate stats for the header of the Transparency page.
      const latencies = calls.map((c) => c.latencyMs).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
      const pct = (p) => (latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))] : null);

      res.json({
        count: calls.length,
        stats: {
          p50Ms: pct(50),
          p95Ms: pct(95),
          byStage: calls.reduce((acc, c) => ((acc[c.stage] = (acc[c.stage] || 0) + 1), acc), {}),
        },
        calls,
      });
    } catch (err) {
      console.error('[transparency] failed:', err);
      res.status(500).json({ error: 'failed to load calls' });
    }
  });

  return router;
}
