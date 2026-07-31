/**
 * The city corporations an admin can sign in to.
 *
 * A city corporation is a geographic jurisdiction, so that is exactly how an
 * issue is assigned to one: by where it physically is. No `corporation` column,
 * no backfill of already-seeded issues, and no chance of a report and its own
 * map pin disagreeing about which city they are in.
 *
 * `bbox` is [west, south, east, north] in degrees. The bounds are approximate —
 * good enough to route a pin to the right console, not a cadastral boundary.
 * Tongi (23.89 N) sits on the real Dhaka/Gazipur line and is deliberately inside
 * Gazipur here, because the seed corpus treats it as Gazipur.
 *
 * The ids below are mirrored in server/src/lib/corporations.js, which validates
 * that an admin account can only ever carry a jurisdiction this file can
 * resolve. If you add a corporation, edit BOTH files.
 */

export const CORPORATIONS = [
  {
    id: 'gazipur',
    nameEn: 'Gazipur City Corporation',
    nameBn: 'গাজীপুর সিটি কর্পোরেশন',
    shortEn: 'Gazipur',
    shortBn: 'গাজীপুর',
    abbr: 'GCC',
    center: [90.4203, 23.9999],
    zoom: 11,
    bbox: [90.20, 23.86, 90.58, 24.15],
    // Demo hotline — not a real published number. See EmergencyContact.jsx.
    emergencyPhone: '01712345001',
  },
  {
    id: 'dhaka-north',
    nameEn: 'Dhaka North City Corporation',
    nameBn: 'ঢাকা উত্তর সিটি কর্পোরেশন',
    shortEn: 'Dhaka North',
    shortBn: 'ঢাকা উত্তর',
    abbr: 'DNCC',
    center: [90.3654, 23.8223],
    zoom: 12,
    bbox: [90.30, 23.76, 90.46, 23.86],
    emergencyPhone: '01812345002',
  },
  {
    id: 'dhaka-south',
    nameEn: 'Dhaka South City Corporation',
    nameBn: 'ঢাকা দক্ষিণ সিটি কর্পোরেশন',
    shortEn: 'Dhaka South',
    shortBn: 'ঢাকা দক্ষিণ',
    abbr: 'DSCC',
    center: [90.4074, 23.7104],
    zoom: 12,
    bbox: [90.34, 23.66, 90.48, 23.76],
    emergencyPhone: '01912345003',
  },
  {
    id: 'narayanganj',
    nameEn: 'Narayanganj City Corporation',
    nameBn: 'নারায়ণগঞ্জ সিটি কর্পোরেশন',
    shortEn: 'Narayanganj',
    shortBn: 'নারায়ণগঞ্জ',
    abbr: 'NCC',
    center: [90.4990, 23.6238],
    zoom: 12,
    bbox: [90.44, 23.57, 90.60, 23.72],
    emergencyPhone: '01612345004',
  },
  {
    id: 'chattogram',
    nameEn: 'Chattogram City Corporation',
    nameBn: 'চট্টগ্রাম সিটি কর্পোরেশন',
    shortEn: 'Chattogram',
    shortBn: 'চট্টগ্রাম',
    abbr: 'CCC',
    center: [91.7832, 22.3569],
    zoom: 12,
    bbox: [91.70, 22.25, 91.90, 22.45],
    emergencyPhone: '01512345005',
  },
];

export const getCorporation = (id) => CORPORATIONS.find((c) => c.id === id) || null;

/** Name in the active UI language. */
export const corpName = (corp, lang) => (lang === 'bn' ? corp?.nameBn : corp?.nameEn) ?? '';
export const corpShort = (corp, lang) => (lang === 'bn' ? corp?.shortBn : corp?.shortEn) ?? '';

/** Is [lng, lat] inside this corporation's bounds? */
export function containsPoint(corp, coordinates) {
  if (!corp || !Array.isArray(coordinates) || coordinates.length < 2) return false;
  const [lng, lat] = coordinates;
  const [w, s, e, n] = corp.bbox;
  return lng >= w && lng <= e && lat >= s && lat <= n;
}

/**
 * Which corporation a coordinate belongs to. Never returns null for a valid
 * point, which is the whole point of this function.
 *
 * The five bboxes are hand-drawn and approximate (see file header), and
 * Bangladesh has more city corporations than the five this build models — so a
 * real citizen, reporting from a real location, will sometimes land outside
 * every box. Falling back to "unassigned" there would make their complaint
 * vanish from every admin's dashboard, which defeats the entire feature: a
 * report that cannot be seen by any corporation is worse than one assigned to
 * a nearby one. So containment decides first, and the nearest corporation by
 * straight-line distance to its centre is the guaranteed fallback — every
 * coordinate resolves to exactly one corporation, always.
 */
export function assignCorporation(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const contained = CORPORATIONS.find((c) => containsPoint(c, coordinates));
  if (contained) return contained;

  const [lng, lat] = coordinates;
  let nearest = null;
  let nearestDistSq = Infinity;
  for (const c of CORPORATIONS) {
    const dLng = c.center[0] - lng;
    const dLat = c.center[1] - lat;
    const distSq = dLng * dLng + dLat * dLat;
    if (distSq < nearestDistSq) {
      nearestDistSq = distSq;
      nearest = c;
    }
  }
  return nearest;
}

/** Keep only the issues that belong to this corporation (see assignCorporation). */
export function filterIssues(issues, corp) {
  if (!corp) return { inside: issues };
  return { inside: issues.filter((i) => assignCorporation(i?.centroid?.coordinates)?.id === corp.id) };
}
