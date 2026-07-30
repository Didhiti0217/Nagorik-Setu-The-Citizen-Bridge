/**
 * A fixed-window rate limiter, in process memory.
 *
 * WHY NOT express-rate-limit: the deploy is a single always-on Render instance —
 * that is the documented reason the API is not serverless (render.yaml), because
 * it holds SSE connections and processes reports after responding 202. On one
 * instance an in-process Map is a *correct* store, not a compromise; it is the
 * same trade lib/events.js already makes for the event bus. The dependency would
 * still need trust-proxy configuration and a custom key function for the
 * per-phone and per-email buckets, and would still be memory-backed by default.
 *
 * KNOWN LIMITS, both accepted: counters reset on every restart and cold start,
 * and a multi-instance deploy would need Redis to be meaningful. Neither is
 * load-bearing here — the OTP attempt cap and the challenge TTL are the real
 * defences on the login path; this is what stops someone burning through them
 * ten thousand times an hour.
 */

const buckets = new Map();

// Lazy sweeping alone leaks: a key hit once and never again is never revisited,
// so nothing ever removes it. unref() so this timer never holds the process open
// — without it `node --watch` and the smoke test would both hang on exit.
const SWEEP_MS = 5 * 60 * 1000;
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
}, SWEEP_MS);
sweeper.unref();

/**
 * @param {object}   opts
 * @param {number}   opts.windowMs
 * @param {number}   opts.max        requests allowed per window
 * @param {Function} [opts.key]      (req) => string — MUST run after validateBody
 *                                   when keying on a body field, or the key is
 *                                   the un-normalised user input
 * @param {string}   [opts.message]
 * @param {string}   [opts.scope]    namespace, so two limiters on one route do
 *                                   not share a bucket
 */
export function rateLimit({ windowMs, max, key = (req) => req.ip, message, scope = '' }) {
  return (req, res, next) => {
    const id = key(req);
    // A limiter whose key cannot be computed (no phone in the body, no ip) must
    // not silently let everyone through under one shared bucket.
    if (id === null || id === undefined || id === '') return next();

    const bucketKey = `${scope}|${id}`;
    const now = Date.now();
    const entry = buckets.get(bucketKey);

    if (!entry || entry.resetAt <= now) {
      buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      // The Retry-After header is set centrally in middleware/errors.js, off
      // err.retryAfterSec, so it is identical however a 429 is raised.
      const err = new Error(message || 'too many requests, please wait');
      err.status = 429;
      err.retryAfterSec = retryAfterSec;
      return next(err);
    }

    return next();
  };
}

/** Test seam — the smoke test asserts a limit, then clears it for later checks. */
export function resetRateLimits() {
  buckets.clear();
}
