/**
 * POST /api/reports — the citizen intake endpoint.
 *
 * WHY 202, NOT 200: Gemma triage takes 15-25s and that latency is irreducible
 * (thinking is 75-80% of tokens and cannot be disabled — pipeline.js header).
 * So we persist the raw report, return 202 in ~100ms, and process it in the
 * background. The dashboard learns the outcome over SSE when the pin drops.
 *
 * The uploaded photo is base64'd and handed to Gemma transiently; the bytes are
 * also written to disk (optional) so the dashboard can show the evidence photo,
 * but they are never stored in MongoDB.
 */
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Router } from 'express';
import multer from 'multer';

import { Report } from '../models/Report.js';

const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export function reportsRouter({ processReport, uploadsDir }) {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 },
  });

  router.post('/', upload.single('photo'), async (req, res) => {
    try {
      const rawText = (req.body.rawText ?? req.body.text ?? '').toString();
      const lng = Number(req.body.lng);
      const lat = Number(req.body.lat);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        return res.status(400).json({ error: 'lng and lat are required numbers' });
      }
      if (!rawText.trim() && !req.file) {
        return res.status(400).json({ error: 'a report needs text or a photo' });
      }

      // Transient base64 for Gemma; optional file on disk for the dashboard.
      let photo = null;
      let photoPath = null;
      if (req.file) {
        photo = { data: req.file.buffer.toString('base64'), mimeType: req.file.mimetype };
        const ext = MIME_EXT[req.file.mimetype] || 'bin';
        const name = `${randomUUID()}.${ext}`;
        try {
          await writeFile(path.join(uploadsDir, name), req.file.buffer);
          photoPath = `/uploads/${name}`;
        } catch (e) {
          // A failed disk write must not fail the submission — the citizen's
          // report and its Gemma analysis do not depend on the file existing.
          console.error('[reports] could not persist photo:', e.message);
        }
      }

      const doc = await Report.create({
        rawText,
        hasPhoto: Boolean(photo),
        photoPath,
        location: { type: 'Point', coordinates: [lng, lat] },
        areaHint: req.body.areaHint ? req.body.areaHint.toString() : null,
        status: 'received',
      });

      // Fire-and-forget: the pipeline never throws (index.js), but guard anyway
      // so an unexpected rejection cannot become an unhandled promise.
      processReport({
        _id: doc._id,
        rawText: doc.rawText,
        photo, // transient — never persisted
        location: doc.location,
        areaHint: doc.areaHint,
      }).catch((err) => console.error(`[reports] pipeline crashed on ${doc._id}:`, err));

      res.status(202).json({ id: doc._id, status: 'received' });
    } catch (err) {
      console.error('[reports] intake failed:', err);
      res.status(500).json({ error: 'failed to accept report' });
    }
  });

  // Lets the citizen app poll for the triage outcome after submitting.
  router.get('/:id', async (req, res) => {
    try {
      const doc = await Report.findById(req.params.id).lean();
      if (!doc) return res.status(404).json({ error: 'not found' });
      res.json(doc);
    } catch {
      res.status(400).json({ error: 'invalid id' });
    }
  });

  return router;
}
