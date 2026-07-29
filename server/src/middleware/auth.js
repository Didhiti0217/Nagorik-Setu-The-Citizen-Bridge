/**
 * Who is calling, and are they allowed to.
 *
 * Every guard sets `req.auth = { id, role, corp }` and nothing else — route
 * handlers that need the full record load it themselves. Keeping the request
 * object thin means a handler cannot accidentally serialise a user document
 * (and its passwordHash) into a response.
 *
 * Errors go through next(err) with a `status`, so middleware/errors.js owns the
 * response shape and every failure reads the same as the rest of the API.
 */
import { verifyToken, STREAM_AUDIENCE } from '../lib/jwt.js';

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

function bearer(req) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (!token || scheme.toLowerCase() !== 'bearer') return null;
  return token.trim() || null;
}

const toAuth = (claims) => ({ id: claims.sub, role: claims.role, corp: claims.corp ?? null });

/**
 * Turn a jsonwebtoken failure into a message the client can act on.
 *
 * The expired/invalid distinction is the whole point: an expired session should
 * tell the user their session expired, while a malformed or forged token should
 * just bounce them. Collapsing both into "unauthorized" makes a normal
 * seven-day expiry look like a bug.
 */
function asAuthError(err) {
  if (err?.name === 'TokenExpiredError') return new AuthError('session expired', 401);
  return new AuthError('sign in required', 401);
}

/** Sets req.auth when a valid token is present. Never fails. */
export function optionalAuth(req, res, next) {
  const token = bearer(req);
  if (!token) return next();
  try {
    req.auth = toAuth(verifyToken(token));
  } catch {
    /* an unusable token on an optional route is simply anonymous */
  }
  return next();
}

/** 401 unless a valid session token is present. */
export function requireAuth(req, res, next) {
  const token = bearer(req);
  if (!token) return next(new AuthError('sign in required', 401));
  try {
    req.auth = toAuth(verifyToken(token));
    return next();
  } catch (err) {
    return next(asAuthError(err));
  }
}

/**
 * 403 unless the caller holds one of these roles. Must run AFTER requireAuth.
 *
 * The missing-req.auth branch is a developer error, not a client error: a
 * mis-ordered chain would otherwise ship an endpoint that looks guarded in the
 * route table and is wide open at runtime. Better a 500 in dev than that.
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth) {
      return next(
        new Error(`requireRole(${roles.join(',')}) ran without requireAuth — fix the middleware order`),
      );
    }
    if (!roles.includes(req.auth.role)) {
      return next(new AuthError('not allowed for this account', 403));
    }
    return next();
  };
}

/**
 * Guard for GET /api/stream.
 *
 * The browser's EventSource cannot set an Authorization header, so the console
 * trades its session token for a short-lived, stream-audience ticket
 * (POST /api/auth/stream-ticket) and passes it in the query string. A separate
 * audience means a ticket that lands in a proxy access log cannot be replayed
 * against /api/issues.
 *
 * A normal Bearer token is accepted as a fallback so curl and the smoke test can
 * hit the stream without the ticket dance.
 *
 * This must reject BEFORE the route writes any SSE headers — once
 * `text/event-stream` is on the wire the status line is already sent and the
 * failure would arrive as a silent, empty stream.
 */
export function requireStreamTicket(req, res, next) {
  const ticket = typeof req.query.ticket === 'string' ? req.query.ticket : null;
  const fallback = bearer(req);
  if (!ticket && !fallback) return next(new AuthError('sign in required', 401));

  try {
    const claims = ticket
      ? verifyToken(ticket, { audience: STREAM_AUDIENCE })
      : verifyToken(fallback);
    req.auth = toAuth(claims);
  } catch (err) {
    return next(asAuthError(err));
  }

  if (req.auth.role !== 'admin') return next(new AuthError('not allowed for this account', 403));
  return next();
}
