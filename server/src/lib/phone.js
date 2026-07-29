/**
 * Bangladeshi mobile numbers, canonicalised to one shape.
 *
 * This matters more than it looks. `phone` is the unique key on Citizen, so if
 * 01712345678, +8801712345678 and 8801712345678 normalise differently, one
 * person ends up with three accounts and a "my complaints" list that is missing
 * two thirds of their reports. It also matters for rate limiting: an
 * unnormalised limiter key is bypassed by simply typing the number differently.
 *
 * Operator prefixes in use are 013-019 (Grameenphone, Robi, Banglalink, Teletalk,
 * Airtel), so the national number is 1[3-9] followed by eight digits.
 */

const NATIONAL = /^1[3-9]\d{8}$/;

/**
 * @param {string} raw  any of: 01712345678 · +8801712345678 · 8801712345678 ·
 *                      01712-345678 · "017 1234 5678"
 * @returns {string|null} '+8801712345678', or null if it is not a valid BD mobile
 */
export function normalizePhone(raw) {
  if (typeof raw !== 'string') return null;

  let s = raw.replace(/[\s\-().]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('880')) s = s.slice(3);
  if (s.startsWith('0')) s = s.slice(1);

  return NATIONAL.test(s) ? `+880${s}` : null;
}

/**
 * '+8801712345678' -> '+8801•••••678'.
 *
 * Shown on the OTP screen so the user can confirm they typed the right number
 * without the full number sitting in a screenshot or a shared screen.
 */
export function maskPhone(e164) {
  if (typeof e164 !== 'string' || e164.length < 8) return '';
  return `${e164.slice(0, 5)}•••••${e164.slice(-3)}`;
}
