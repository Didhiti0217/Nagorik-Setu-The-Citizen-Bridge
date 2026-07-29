/**
 * Session tokens. One place, so the claim shape and the audiences cannot drift.
 *
 * Two audiences share one secret:
 *
 *   nagorik-setu-client — the session token the client sends as a Bearer header.
 *   nagorik-setu-stream — a short-lived ticket for GET /api/stream, which the
 *                         browser's EventSource can only authenticate through
 *                         the query string (middleware/auth.js explains).
 *
 * The audience split is what stops a ticket leaked into a proxy access log from
 * being replayed against /api/issues, and stops a full session token being used
 * as a ticket.
 *
 * The claims are deliberately minimal — no email, no phone, no name. The token
 * lives in localStorage and is readable by anyone with the device, so identity
 * comes from GET /api/auth/me instead.
 */
import jwt from 'jsonwebtoken';

import { authConfig } from './authConfig.js';

export const ISSUER = 'nagorik-setu';
export const CLIENT_AUDIENCE = 'nagorik-setu-client';
export const STREAM_AUDIENCE = 'nagorik-setu-stream';

/** Signing key, read at call time so tests can swap the env between cases. */
const secret = () => authConfig().jwtSecret;

/**
 * @param {object} payload  { sub, role, corp? } — keep it small and non-PII.
 * @param {object} [opts]   { expiresIn, audience }
 */
export function signToken(payload, opts = {}) {
  const cfg = authConfig();
  return jwt.sign(payload, secret(), {
    issuer: ISSUER,
    audience: opts.audience || CLIENT_AUDIENCE,
    expiresIn: opts.expiresIn || cfg.jwtExpiresIn,
  });
}

/**
 * Verify and decode. Throws jsonwebtoken's TokenExpiredError / JsonWebTokenError
 * — callers distinguish them so an expired session can say so instead of
 * silently bouncing the user to a login screen.
 */
export function verifyToken(token, opts = {}) {
  return jwt.verify(token, secret(), {
    issuer: ISSUER,
    audience: opts.audience || CLIENT_AUDIENCE,
    algorithms: ['HS256'],
  });
}

/** A session token for a signed-in account. */
export function signSession({ id, role, corporation }) {
  const claims = { sub: String(id), role };
  if (corporation) claims.corp = corporation;
  return signToken(claims);
}

/** A stream-only ticket, valid for STREAM_TICKET_TTL_SECONDS. */
export function signStreamTicket({ id, role, corporation }) {
  const cfg = authConfig();
  const claims = { sub: String(id), role };
  if (corporation) claims.corp = corporation;
  return {
    ticket: signToken(claims, {
      audience: STREAM_AUDIENCE,
      expiresIn: cfg.streamTicketTtlSec,
    }),
    expiresInSec: cfg.streamTicketTtlSec,
  };
}
