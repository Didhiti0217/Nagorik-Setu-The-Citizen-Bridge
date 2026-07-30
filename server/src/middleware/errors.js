/**
 * The 404 and the error handler — a new pattern for this repo.
 *
 * Until now every route try/caught itself and shaped its own response. That was
 * fine for five endpoints, but auth adds a dozen more, all of which need to fail
 * as `{ error: '<message>' }` with an accurate status. Centralising it means a
 * service can just `throw new AuthError('that code is not right', 401)` and a
 * route becomes `catch (err) { next(err) }`.
 *
 * It also finally gives multer's "file too large" a real 413. Today an 8MB+
 * upload falls through to Express's default handler and the citizen gets an HTML
 * error page from a JSON API.
 */
import multer from 'multer';

export function notFound(req, res) {
  res.status(404).json({ error: 'not found' });
}

/* eslint-disable-next-line no-unused-vars -- Express identifies an error handler by arity; `next` must stay. */
export function errorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? 'photo is too large (max 8MB)' : 'could not read the upload';
    return res.status(status).json({ error: message });
  }

  const status = Number(err?.status) || 500;

  if (status >= 500) {
    // Only 5xx is a bug worth a stack trace. Logging 4xx too would bury the
    // real failures under every mistyped OTP.
    console.error('[api] unhandled:', err);
  }

  // Any 429 carries the wait in the header too, not just the body. It is the
  // standard clients and proxies already understand, and it belongs here rather
  // than in the rate limiter because the OTP resend cooldown is thrown by
  // services/auth.js and never passes through that middleware.
  if (err?.retryAfterSec) res.set('Retry-After', String(err.retryAfterSec));

  // A 500's message is ours, not the caller's — it can carry a Mongo error, a
  // connection string fragment, or a stack frame.
  return res.status(status).json({
    error: status >= 500 ? 'something went wrong' : err.message,
    ...(err?.detail ? { detail: err.detail } : {}),
    ...(err?.retryAfterSec ? { retryAfterSec: err.retryAfterSec } : {}),
  });
}
