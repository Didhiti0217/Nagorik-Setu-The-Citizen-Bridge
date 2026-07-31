/**
 * POST /api/reports               — the citizen intake endpoint (signed-in residents)
 * GET  /api/reports/mine          — the caller's own reports, for My Complaints
 * GET  /api/reports/:id           — one report, if it is yours (or you are an admin)
 * POST /api/reports/:id/revoke    — withdraw your own complaint
 * GET  /api/reports/:id/status-history — a citizen-safe progress timeline
 *
 * WHY 202, NOT 200: Gemma triage takes 15-25s and that latency is irreducible
 * (thinking is 75-80% of tokens and cannot be disabled — pipeline.js header).
 * So we persist the raw report, return 202 in ~100ms, and process it in the
 * background. The dashboard learns the outcome over SSE when the pin drops.
 *
 * The uploaded photo is base64'd and handed to Gemma transiently, best-effort
 * written to disk as a fast path, AND kept as Report.photoData in MongoDB — the
 * durable copy. Render's disk is wiped on every deploy; Mongo isn't. See the
 * models/Report.js and app.js /uploads fallback route for the other half of this.
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
import { Issue } from '../models/Issue.js';
import { StatusHistory } from '../models/StatusHistory.js';
import { publish } from '../lib/events.js';
import { computePriorityWeight } from '../services/pipeline.js';

const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// What My Complaints needs to know about the issue a report was folded into, and
// nothing more. Selecting explicitly keeps the councilor-only fields — merge
// reasons, the dispatch brief's internal notes — out of a citizen's response.
// reportCount is included deliberately: "your report was one of 4 about this" is
// the single most reassuring thing the app can tell a resident, and it is the
// product's whole argument stated from the citizen's side.
const ISSUE_FIELDS =
  'status category severity summaryBn summaryEn slaDueAt reportCount dispatchBrief.priority';

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

        // Transient base64 for Gemma. Disk is a FAST PATH only, not the source of
        // truth — Render's filesystem is ephemeral and is wiped on every deploy,
        // so photoData (below) going into MongoDB is what actually keeps a photo
        // alive across one. photoPath is assigned regardless of whether the disk
        // write succeeds: the /uploads fallback route (app.js) can serve the same
        // URL straight from photoData, so a citizen's photo must not depend on a
        // disk write that this process cannot guarantee will outlive the hour.
        let photo = null;
        let photoPath = null;
        let photoData = null;
        if (req.file) {
          photo = { data: req.file.buffer.toString('base64'), mimeType: req.file.mimetype };
          const ext = MIME_EXT[req.file.mimetype] || 'bin';
          const name = `${randomUUID()}.${ext}`;
          photoPath = `/uploads/${name}`;
          photoData = { data: req.file.buffer, mimeType: req.file.mimetype };
          try {
            await writeFile(path.join(uploadsDir, name), req.file.buffer);
          } catch (e) {
            // Logged, not fatal — the durable copy in Mongo is unaffected.
            console.error('[reports] could not write photo to disk (non-fatal):', e.message);
          }
        }

        const doc = await Report.create({
          rawText,
          hasPhoto: Boolean(photo),
          photoPath,
          photoData,
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
          photoPath: doc.photoPath, // persisted — lets the pipeline attach it to the issue
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

  /**
   * A citizen withdraws their own complaint. Never a hard delete — the report
   * stays, flagged 'revoked', for the same reason a report is never dropped on
   * pipeline failure: a citizen's history of what they filed should not vanish.
   *
   * If this report had merged into an issue, its contribution is unwound: the
   * issue's reportCount drops, its own merge-reason and evidence-photo entries
   * (if any) are pulled, and — only if that was the LAST active report behind
   * the issue — the issue itself closes. This is a deterministic business rule,
   * not a Gemma suggestion, so it bypasses services/statusEngine.js entirely;
   * that gate exists for AI suggestions, not for "the complainant withdrew".
   */
  router.post('/:id/revoke', requireAuth, requireRole('citizen'), async (req, res, next) => {
    try {
      const report = await Report.findById(req.params.id);
      if (!report || String(report.submittedBy) !== req.auth.id) {
        return res.status(404).json({ error: 'not found' });
      }
      if (report.status === 'revoked') {
        return res.status(409).json({ error: 'already revoked' });
      }

      report.status = 'revoked';
      report.revokedAt = new Date();
      await report.save();

      if (report.issueId) {
        const issue = await Issue.findById(report.issueId);
        if (issue) {
          const nextCount = Math.max(0, issue.reportCount - 1);
          issue.reportCount = nextCount;
          issue.priorityWeight = computePriorityWeight({
            severity: issue.severity,
            reportCount: Math.max(1, nextCount),
            isLifeThreatening: issue.isLifeThreatening,
          });
          // Retract exactly this report's own contribution, not anyone else's.
          issue.mergeReasons = issue.mergeReasons.filter((m) => String(m.reportId) !== String(report._id));
          issue.evidencePhotos = issue.evidencePhotos.filter((p) => String(p.reportId) !== String(report._id));

          if (nextCount === 0 && issue.status !== 'closed') {
            const oldStatus = issue.status;
            issue.status = 'closed';
            await StatusHistory.create({
              issueId: issue._id,
              oldStatus,
              newStatus: 'closed',
              source: 'system',
              suggestedStatus: null,
              confidence: null,
              reason: 'All citizen reports behind this issue were withdrawn.',
              applied: true,
            });
          }

          issue.updatedAt = new Date();
          await issue.save();
          publish('issue:updated', { issue: issue.toObject(), merged: false });
        }
      }

      res.json({ id: report._id, status: 'revoked' });
    } catch (err) {
      if (err?.name === 'CastError') return res.status(400).json({ error: 'invalid id' });
      next(err);
    }
  });

  /**
   * A citizen-safe read of their complaint's progress. Deliberately thinner than
   * the admin timeline (routes/issues.js): only ACCEPTED transitions, and none
   * of the AI-mechanics fields (confidence, what was suggested but rejected) —
   * a resident wants to know what happened to their complaint, not watch the
   * backend gate work.
   */
  router.get('/:id/status-history', requireAuth, async (req, res, next) => {
    try {
      const report = await Report.findById(req.params.id).lean();
      const mine = report && String(report.submittedBy) === req.auth.id;
      if (!report || (req.auth.role !== 'admin' && !mine)) {
        return res.status(404).json({ error: 'not found' });
      }
      if (!report.issueId) return res.json({ history: [] });

      const events = await StatusHistory.find({ issueId: report.issueId, applied: true })
        .sort({ createdAt: 1 })
        .select('oldStatus newStatus reason createdAt')
        .lean();
      res.json({ history: events });
    } catch (err) {
      if (err?.name === 'CastError') return res.status(400).json({ error: 'invalid id' });
      next(err);
    }
  });

  return router;
}
