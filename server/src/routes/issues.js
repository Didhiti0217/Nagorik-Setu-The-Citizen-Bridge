/**
 * GET /api/issues        — ranked list for the work queue (priorityWeight desc)
 * GET /api/issues?format=geojson — FeatureCollection for the Mapbox layer
 * GET /api/issues/:id    — one issue with its merge history
 *
 * Read-only. Filters (status, category, min_severity) are typed and clamped so
 * the dashboard can slice the map without any free-form query reaching Mongo.
 *
 * Console-only. An issue aggregates citizens' free text and precise locations
 * into a municipal work queue; that is not public data. Jurisdiction filtering
 * stays where it already is — client-side and geographic, by whether an issue's
 * centroid falls inside the corporation's bounds (client/src/lib/corporations.js)
 * — so there is still no `corporation` column and no chance of a report and its
 * own map pin disagreeing about which city they are in.
 */
import { Router } from 'express';

import { requireAuth, requireRole } from '../middleware/auth.js';
import { Issue } from '../models/Issue.js';

function toFeature(issue) {
  const { centroid, ...properties } = issue;
  return {
    type: 'Feature',
    geometry: centroid, // already GeoJSON Point
    properties: { ...properties, id: String(issue._id) },
  };
}

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
      res.json(doc);
    } catch {
      res.status(400).json({ error: 'invalid id' });
    }
  });

  return router;
}
