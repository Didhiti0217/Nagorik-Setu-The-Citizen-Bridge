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
 * Keep only the issues inside this corporation.
 *
 * An issue whose centroid falls outside every corporation we know about is not
 * silently dropped — `unassigned` collects it so the console can say so out loud
 * instead of quietly under-reporting the city's workload.
 */
export function filterIssues(issues, corp) {
  if (!corp) return { inside: issues, unassigned: [] };
  const inside = [];
  const unassigned = [];
  for (const issue of issues) {
    const coords = issue?.centroid?.coordinates;
    if (containsPoint(corp, coords)) inside.push(issue);
    else if (!CORPORATIONS.some((c) => containsPoint(c, coords))) unassigned.push(issue);
  }
  return { inside, unassigned };
}
