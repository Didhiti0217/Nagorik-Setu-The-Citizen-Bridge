/**
 * The storage layer the pipeline runs on.
 *
 * services/pipeline.js is written against an injected `deps` object rather than
 * importing Mongoose — that is what let Dev A verify it on in-memory stubs
 * (scripts/pipeline-demo.js) before any database existed. This module is the
 * real Mongo implementation of that exact contract:
 *
 *   findNearbyIssues({lng,lat,radiusM,sinceHours}) -> Issue[] (+ distanceM), nearest first
 *   createIssue(issue)      -> created Issue (plain object, with _id)
 *   updateIssue(id, patch)  -> updated Issue   (patch may mix $inc/$push with plain fields)
 *   updateReport(id, patch) -> void            (plain field patch)
 *   logStatusHistory(entry) -> void            (append-only; never updated or deleted)
 *
 * Do not change these signatures without Dev A — they are the frozen H+2
 * contract (pipeline.js param docs).
 */
import { Issue } from '../models/Issue.js';
import { Report } from '../models/Report.js';
import { StatusHistory } from '../models/StatusHistory.js';

export function createStore() {
  return {
    /**
     * Duplicate candidates: issues within `radiusM` metres and the last
     * `sinceHours`, still open, nearest first. The pipeline sends this list to
     * Gemma and refers back to it by index, so ordering must be stable.
     */
    async findNearbyIssues({ lng, lat, radiusM, sinceHours }) {
      const cutoff = new Date(Date.now() - sinceHours * 3_600_000);
      return Issue.aggregate([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: [lng, lat] },
            distanceField: 'distanceM',
            maxDistance: radiusM,
            spherical: true,
            // 'resolved'/'closed' are terminal — a new report near one of those
            // is a fresh problem, not a duplicate of something already done.
            query: { status: { $nin: ['resolved', 'closed'] }, createdAt: { $gte: cutoff } },
          },
        },
        { $sort: { distanceM: 1 } },
        { $limit: 10 },
      ]);
    },

    async createIssue(issue) {
      const doc = await Issue.create(issue);
      return doc.toObject();
    },

    /**
     * The pipeline hands us patches like
     *   { $inc: { reportCount: 1 }, severity: 5, updatedAt: <date>, $push: {...} }
     * — Mongo forbids mixing operator keys with bare fields, so bare fields are
     * folded into $set here (the same split the in-memory stub did by hand).
     */
    async updateIssue(id, patch) {
      const update = {};
      const set = {};
      for (const [key, value] of Object.entries(patch)) {
        if (key === '$inc' || key === '$push' || key === '$set' || key === '$pull') {
          update[key] = { ...(update[key] || {}), ...value };
        } else {
          set[key] = value;
        }
      }
      if (Object.keys(set).length) update.$set = { ...(update.$set || {}), ...set };
      const doc = await Issue.findByIdAndUpdate(id, update, { new: true });
      return doc ? doc.toObject() : null;
    },

    async updateReport(id, patch) {
      await Report.findByIdAndUpdate(id, { $set: patch });
    },

    async logStatusHistory(entry) {
      await StatusHistory.create(entry);
    },
  };
}
