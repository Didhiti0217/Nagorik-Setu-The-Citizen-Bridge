/**
 * POST /api/copilot { question } — the Councilor's Copilot (Gemma Stage 6).
 *
 * Two Gemma turns around one safe DB query:
 *   1. planCopilotQuery()   -> picks a whitelisted tool + typed args
 *   2. runCopilotTool()     -> executes the parameterised Mongo query
 *   3. narrateCopilotAnswer()-> explains the results back in Bangla
 *
 * The model never touches the database directly (lib/copilotTools.js). Both
 * Gemma stages CAN throw (index.js), so the whole thing is wrapped.
 *
 * Console-only AND rate limited, because this is the most expensive endpoint in
 * the app: every request spends two Gemma calls against a metered API key, and
 * it answers questions about the municipal work queue. Left open it is a way to
 * bill someone else's quota at will.
 */
import { Router } from 'express';

import { planCopilotQuery, narrateCopilotAnswer } from '../gemma/index.js';
import { runCopilotTool } from '../lib/copilotTools.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

export function copilotRouter() {
  const router = Router();

  const limit = rateLimit({
    scope: 'copilot',
    key: (req) => req.auth?.id ?? null,
    windowMs: 60 * 60 * 1000,
    max: 30,
    message: 'the copilot is busy — please wait a little',
  });

  router.post('/', requireAuth, requireRole('admin'), limit, async (req, res) => {
    const question = (req.body?.question ?? '').toString().trim();
    if (!question) return res.status(400).json({ error: 'question is required' });

    try {
      const plan = await planCopilotQuery({ question });
      const results = await runCopilotTool(plan.data.tool, plan.data.args);
      const narration = await narrateCopilotAnswer({
        question,
        tool: plan.data.tool,
        results,
      });

      res.json({
        tool: plan.data.tool,
        args: plan.data.args,
        results,
        answer: narration.data,
        meta: { plan: plan.meta, narrate: narration.meta },
      });
    } catch (err) {
      console.error('[copilot] failed:', err);
      res.status(502).json({ error: 'copilot failed', detail: err.message });
    }
  });

  return router;
}
