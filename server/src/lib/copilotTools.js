/**
 * The copilot's tool executor — the injection boundary (schemas.js §Stage 6).
 *
 * Gemma NEVER emits a raw query. planCopilotQuery() returns one tool name from a
 * fixed whitelist plus typed args already validated by CopilotCallSchema. This
 * module maps that safe, structured request onto a parameterised Mongo query.
 * Nothing here interpolates model text into a query operator, so a prompt
 * injection cannot reach the database.
 */
import { Issue } from '../models/Issue.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Build the shared match filter from the validated, typed copilot args. */
function buildMatch(args = {}) {
  const match = {};
  if (args.category) match.category = args.category;
  if (args.min_severity != null) match.severity = { $gte: args.min_severity };
  if (args.status) match.status = args.status;
  if (args.days != null) match.createdAt = { $gte: new Date(Date.now() - args.days * 86_400_000) };
  // `area` is matched against the inferred landmark, escaped so it is a literal.
  if (args.area) match.inferredLocation = new RegExp(escapeRegex(args.area), 'i');
  return match;
}

/**
 * @param {'query_issues'|'aggregate_by_category'|'find_hotspots'} tool
 * @param {object} args  already validated by CopilotCallSchema
 */
export async function runCopilotTool(tool, args = {}) {
  const match = buildMatch(args);
  const limit = Math.min(args.limit || 20, 100);

  if (tool === 'query_issues') {
    return Issue.find(match).sort({ priorityWeight: -1 }).limit(limit).lean();
  }

  if (tool === 'aggregate_by_category') {
    return Issue.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$category',
          issues: { $sum: 1 },
          reports: { $sum: '$reportCount' },
          maxSeverity: { $max: '$severity' },
        },
      },
      { $sort: { reports: -1 } },
    ]);
  }

  if (tool === 'find_hotspots') {
    // Cluster by location rounded to ~100 m so repeated problems in one spot
    // surface as a single hotspot.
    return Issue.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            lng: { $round: [{ $arrayElemAt: ['$centroid.coordinates', 0] }, 3] },
            lat: { $round: [{ $arrayElemAt: ['$centroid.coordinates', 1] }, 3] },
          },
          issues: { $sum: 1 },
          reports: { $sum: '$reportCount' },
          maxSeverity: { $max: '$severity' },
          issueIds: { $push: '$_id' },
        },
      },
      { $sort: { reports: -1 } },
      { $limit: limit },
    ]);
  }

  throw new Error(`Unknown copilot tool: ${tool}`);
}
