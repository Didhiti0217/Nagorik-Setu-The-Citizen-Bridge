/**
 * /api/auth — sign in, sign out, and provision console accounts.
 *
 * Thin by design (CLAUDE.md §3): validate the body, call services/auth.js, shape
 * the response. Every failure is handed to next(err) so middleware/errors.js
 * produces the same { error } body the rest of the API already returns.
 *
 * Middleware ORDER on the login routes is load-bearing. validateBody runs first
 * so the rate limiters key on a NORMALISED phone or a lowercased email —
 * otherwise 01712345678 and +8801712345678 get separate buckets and the limit is
 * bypassed by typing the number differently.
 */
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, requireRole } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validate.js';
import * as auth from '../services/auth.js';

const FIFTEEN_MIN = 15 * 60 * 1000;

/* ---------- body schemas ---------------------------------------------------- */

const phoneBody = z.object({
  phone: z.string().min(1, 'enter your mobile number').max(24),
});

const verifyBody = z.object({
  phone: z.string().min(1, 'enter your mobile number').max(24),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'enter the 6-digit code'),
});

const adminLoginBody = z.object({
  email: z.string().trim().toLowerCase().email('enter a valid email address').max(160),
  password: z.string().min(1, 'enter your password').max(200),
});

const inviteBody = z.object({
  email: z.string().trim().toLowerCase().email('enter a valid email address').max(160),
  name: z.string().trim().max(120).optional(),
});

const acceptBody = z.object({
  token: z.string().min(10, 'this invitation link is not valid').max(200),
  name: z.string().trim().max(120).optional(),
  password: z.string().min(8, 'use at least 8 characters').max(200),
});

/* ---------- limiter keys ---------------------------------------------------- */
// These read req.body, so they MUST be mounted after validateBody.
const byPhone = (req) => req.body?.phone ?? null;
const byEmail = (req) => req.body?.email ?? null;
const byIp = (req) => req.ip ?? null;

export function authRouter() {
  const router = Router();

  /* ---------- resident: phone + one-time code ------------------------------- */

  router.post(
    '/otp/request',
    validateBody(phoneBody),
    rateLimit({
      scope: 'otp-req-phone',
      key: byPhone,
      windowMs: FIFTEEN_MIN,
      max: 5,
      message: 'too many codes requested for this number — please wait',
    }),
    rateLimit({ scope: 'otp-req-ip', key: byIp, windowMs: FIFTEEN_MIN, max: 20 }),
    async (req, res, next) => {
      try {
        res.json(await auth.requestOtp(req.body));
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/otp/verify',
    validateBody(verifyBody),
    // The five-attempt counter on the challenge itself is the real defence here;
    // this only stops someone cycling challenges to brute-force in bulk.
    rateLimit({ scope: 'otp-verify-ip', key: byIp, windowMs: FIFTEEN_MIN, max: 15 }),
    async (req, res, next) => {
      try {
        res.json(await auth.verifyOtp(req.body));
      } catch (err) {
        next(err);
      }
    },
  );

  /* ---------- admin: email + password --------------------------------------- */

  router.post(
    '/admin/login',
    validateBody(adminLoginBody),
    rateLimit({
      scope: 'admin-login-email',
      key: byEmail,
      windowMs: FIFTEEN_MIN,
      max: 5,
      message: 'too many attempts for this account — please wait',
    }),
    rateLimit({ scope: 'admin-login-ip', key: byIp, windowMs: FIFTEEN_MIN, max: 20 }),
    async (req, res, next) => {
      try {
        res.json(await auth.adminLogin(req.body));
      } catch (err) {
        next(err);
      }
    },
  );

  /* ---------- session ------------------------------------------------------- */

  router.get('/me', requireAuth, async (req, res, next) => {
    try {
      res.json(await auth.getMe(req.auth));
    } catch (err) {
      next(err);
    }
  });

  // A no-op server-side: the token is stateless, so signing out is the client
  // discarding it. It exists so the client has a symmetric call, and so a future
  // revocation list has an obvious home.
  router.post('/logout', requireAuth, (req, res) => res.status(204).end());

  // EventSource cannot send an Authorization header, so the console trades its
  // session token for a stream-audience ticket (middleware/auth.js explains).
  router.post('/stream-ticket', requireAuth, requireRole('admin'), (req, res) => {
    res.json(auth.createStreamTicket(req.auth));
  });

  /* ---------- invites: admin side ------------------------------------------- */

  router.post(
    '/admin/invites',
    requireAuth,
    requireRole('admin'),
    validateBody(inviteBody),
    async (req, res, next) => {
      try {
        // `token` is dropped here — the raw value reaches the inviter only
        // inside acceptUrl, and is never stored or logged.
        const { invite, acceptUrl } = await auth.createInvite(req.auth, req.body);
        res.status(201).json({ invite, acceptUrl });
      } catch (err) {
        next(err);
      }
    },
  );

  router.get('/admin/invites', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      res.json(await auth.listInvites(req.auth));
    } catch (err) {
      next(err);
    }
  });

  router.delete('/admin/invites/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      await auth.revokeInvite(req.auth, req.params.id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.get('/admin/team', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      res.json(await auth.listTeam(req.auth));
    } catch (err) {
      next(err);
    }
  });

  /* ---------- invites: recipient side (public, they have no account yet) ---- */

  router.get('/invites/:token', async (req, res, next) => {
    try {
      res.json(await auth.peekInvite(req.params.token));
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/invites/accept',
    validateBody(acceptBody),
    rateLimit({ scope: 'invite-accept-ip', key: byIp, windowMs: FIFTEEN_MIN, max: 10 }),
    async (req, res, next) => {
      try {
        res.status(201).json(await auth.acceptInvite(req.body));
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
