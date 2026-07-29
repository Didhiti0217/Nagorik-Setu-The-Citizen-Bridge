/**
 * Request body validation, using the zod already in the tree for Gemma's
 * response schemas (gemma/schemas.js).
 *
 * The parsed result REPLACES req.body, which is what makes the rate limiters
 * downstream safe: they key on req.body.phone / req.body.email, and if those
 * were still the raw strings then 01712345678 and +8801712345678 would get
 * separate buckets — a limiter you bypass by typing your number differently.
 * Normalise once, here, and everything after it agrees.
 */

export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const issue = result.error.issues[0];
      const err = new Error(issue?.message || 'invalid request');
      err.status = 400;
      err.detail = issue?.path?.length ? issue.path.join('.') : undefined;
      return next(err);
    }
    req.body = result.data;
    return next();
  };
}
