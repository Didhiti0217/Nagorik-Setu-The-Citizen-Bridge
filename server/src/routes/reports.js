/**
 * POST /api/reports      — the citizen intake endpoint (signed-in residents)
 * GET  /api/reports/mine — the caller's own reports, for My Complaints
 * GET  /api/reports/:id  — one report, if it is yours (or you are an admin)
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

import { requireAuth, requireRole } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { Citizen } from '../models/Citizen.js';
import { Report } from '../models/Report.js';

const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// What My Complaints needs to know about the issue a report was folded into, and
// nothing more. Selecting explicitly keeps the councilor-only fields — merge
// reasons, the dispatch brief's internal notes — out of a citizen's response.
const ISSUE_FIELDS = 'status category severity summaryBn summaryEn slaDueAt dispatchBrief.priority';

export function reportsRouter({ processReport, uploadsDir }) {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 },
  });

  router.post(
    '/',
    // ORDER IS LOAD-BEARING: multer buffers the whole upload into memory before
    // the handler runs, so a guard placed after it would let an unauthenticated
    // caller make the server absorb 8MB before receiving its 401.
    requireAuth,
    rateLimit({
      scope: 'report-submit',
      key: (req) => req.auth?.id ?? null,
      windowMs: 60 * 60 * 1000,
      max: 10,
      message: 'you have submitted a lot of reports — please wait a while',
    }),
    upload.single('photo'),
    async (req, res, next) => {
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
          // An admin filing from the console is allowed (it keeps the smoke test
          // simple), but the report belongs to a citizen or to nobody.
          submittedBy: req.auth.role === 'citizen' ? req.auth.id : null,
          status: 'received',
        });

        if (req.auth.role === 'citizen') {
          // A counter is not worth failing a submission over.
          Citizen.updateOne({ _id: req.auth.id }, { $inc: { reportCount: 1 } }).catch((err) =>
            console.error('[reports] reportCount bump failed:', err.message),
          );
        }

        // Fire-and-forget: the pipeline never throws (index.js), but guard anyway
        // so an unexpected rejection cannot become an unhandled promise.
        processReport({
          _id: doc._id,
          rawText: doc.rawText,
          photo, // transient — never persisted
          location: doc.location,
          areaHint: doc.areaHint,
        }).catch((err) => console.error(`[reports] pipeline crashed on ${doc._id}:`, err));

        return res.status(202).json({ id: doc._id, status: 'received' });
      } catch (err) {
        return next(err);
      }
    },
  );

  /**
   * The caller's own reports, newest first.
   *
   * MUST be declared before '/:id' — Express matches in declaration order, so
   * '/:id' would otherwise swallow 'mine' and fail with "invalid id".
   *
   * Returns the linked issue inline so My Complaints never has to call
   * /api/issues, which is admin-only.
   */
  router.get('/mine', requireAuth, requireRole('citizen'), async (req, res, next) => {
    try {
      const docs = await Report.find({ submittedBy: req.auth.id })
        .sort({ createdAt: -1 })
        .limit(50)
        .populate('issueId', ISSUE_FIELDS)
        .lean();
      res.json({ reports: docs });
    } catch (err) {
      next(err);
    }
  });

  // Lets the citizen app poll for the triage outcome after submitting.
  router.get('/:id', requireAuth, async (req, res, next) => {
    try {
      const doc = await Report.findById(req.params.id).populate('issueId', ISSUE_FIELDS).lean();

      // A citizen who does not own this gets 404, never 403. A 403 would confirm
      // the id exists, turning the endpoint into an enumeration oracle for other
      // people's complaints — which include free text and a precise location.
      // Reports seeded before authentication existed have no owner, so they are
      // console-only by the same rule.
      const mine = doc && String(doc.submittedBy) === req.auth.id;
      if (!doc || (req.auth.role !== 'admin' && !mine)) {
        return res.status(404).json({ error: 'not found' });
      }
      return res.json(doc);
    } catch (err) {
      // An unparseable ObjectId is a bad request, not a server error.
      if (err?.name === 'CastError') return res.status(400).json({ error: 'invalid id' });
      return next(err);
    }
  });

  return router;
}
