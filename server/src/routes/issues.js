/**
 * GET  /api/issues         — ranked list for the work queue (priorityWeight desc)
 * GET  /api/issues?format=geojson — FeatureCollection for the Mapbox layer
 * GET  /api/issues/:id     — one issue with its merge history and status timeline
 * POST /api/issues/:id/updates — an officer posts a free-text status update
 *
 * Read routes are read-only. Filters (status, category, min_severity) are
 * typed and clamped so the dashboard can slice the map without any free-form
 * query reaching Mongo.
 *
 * Console-only. An issue aggregates citizens' free text and precise locations
 * into a municipal work queue; that is not public data. Jurisdiction filtering
 * stays where it already is — client-side and geographic, by whether an issue's
 * centroid falls inside the corporation's bounds (client/src/lib/corporations.js)
 * — so there is still no `corporation` column and no chance of a report and its
 * own map pin disagreeing about which city they are in.
 */
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { Issue } from '../models/Issue.js';
import { StatusHistory } from '../models/StatusHistory.js';
import { suggestStatus } from '../gemma/index.js';
import { decideStatusTransition } from '../services/statusEngine.js';
import { publish } from '../lib/events.js';

function toFeature(issue) {
  const { centroid, ...properties } = issue;
  return {
    type: 'Feature',
    geometry: centroid, // already GeoJSON Point
    properties: { ...properties, id: String(issue._id) },
  };
}

const updateBody = z.object({
  text: z.string().trim().min(1).max(500),
});

export function issuesRouter() {
  const router = Router();

  router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const filter = {};
      if (req.query.status) filter.status = req.query.status.toString();
      if (req.query.category) filter.category = req.query.category.toString();
      const minSev = Number(req.query.min_severity);
      if (Number.isFinite(minSev)) filter.severity = { $gte: minSev };

      const issues = await Issue.find(filter).sort({ priorityWeight: -1 }).limit(500).lean();

      if (req.query.format === 'geojson') {
        return res.json({ type: 'FeatureCollection', features: issues.map(toFeature) });
      }
      res.json(issues);
    } catch (err) {
      console.error('[issues] list failed:', err);
      res.status(500).json({ error: 'failed to load issues' });
    }
  });

  router.get('/:id', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const doc = await Issue.findById(req.params.id).lean();
      if (!doc) return res.status(404).json({ error: 'not found' });
      const statusHistory = await StatusHistory.find({ issueId: doc._id }).sort({ createdAt: 1 }).lean();
      res.json({ ...doc, statusHistory });
    } catch {
      res.status(400).json({ error: 'invalid id' });
    }
  });

  /**
   * An officer describes what happened ("crew arrived and started digging");
   * Gemma reads it against the issue's current status and suggests where the
   * civic-complaint lifecycle should move next (docs/plan.md). The backend gate
   * (services/statusEngine.js) decides whether that suggestion is applied —
   * this route never writes `status` from the raw Gemma output.
   */
  router.post('/:id/updates', requireAuth, requireRole('admin'), validateBody(updateBody), async (req, res, next) => {
    try {
      const issue = await Issue.findById(req.params.id);
      if (!issue) return res.status(404).json({ error: 'not found' });

      let suggestion = null;
      let decision = { accepted: false, nextStatus: null, rejectReason: 'suggestion failed' };
      try {
        const result = await suggestStatus({ currentStatus: issue.status, updateText: req.body.text, evidence: null });
        suggestion = result.data;
        decision = decideStatusTransition({ currentStatus: issue.status, suggestion });
      } catch (err) {
        console.error('[issues] status suggestion failed:', err.message);
      }

      const oldStatus = issue.status;
      if (decision.accepted) {
        issue.status = decision.nextStatus;
        issue.updatedAt = new Date();
        await issue.save();
      }

      await StatusHistory.create({
        issueId: issue._id,
        oldStatus,
        newStatus: decision.accepted ? decision.nextStatus : oldStatus,
        source: 'admin_update',
        suggestedStatus: suggestion?.next_status ?? null,
        confidence: suggestion?.confidence ?? null,
        reason: suggestion?.reason ?? decision.rejectReason,
        applied: decision.accepted,
      });

      // Same broadcast the pipeline uses, so a status change lands on every
      // connected dashboard live rather than waiting for a manual refresh.
      // Nothing was merged here — this event is just "the issue changed".
      if (decision.accepted) publish('issue:updated', { issue: issue.toObject(), merged: false });

      res.status(201).json({
        issue: issue.toObject(),
        suggestion,
        applied: decision.accepted,
        rejectReason: decision.rejectReason,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
