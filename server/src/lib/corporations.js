/**
 * The city corporation ids, server-side.
 *
 * Deliberately duplicated from client/src/lib/corporations.js rather than
 * shared through a workspace package — five strings do not justify a monorepo
 * in a prototype. If you add a corporation, edit BOTH files.
 *
 * The client file is the richer one: it also carries names, bounding boxes and
 * map centres, and it is what assigns an issue to a jurisdiction (geographically,
 * by where the issue physically is). The server only needs the enum, and only
 * for one reason: an AdminUser whose `corporation` is not in this list would
 * make getCorporation() return null on the client and white-screen the console
 * on its first unguarded read of corporation.center. Validating at write time is
 * cheaper than defending every read.
 */

export const CORPORATION_IDS = [
  'gazipur',
  'dhaka-north',
  'dhaka-south',
  'narayanganj',
  'chattogram',
];

export const isCorporationId = (id) => CORPORATION_IDS.includes(id);
