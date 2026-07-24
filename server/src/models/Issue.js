/**
 * Issue — a deduplicated physical problem, the unit the councilor actually works.
 *
 * One issue can carry many citizen reports (see `reportCount` / `mergeReasons`).
 * The pipeline in services/pipeline.js is the only writer; it hands us plain
 * objects through the injected store (lib/store.js), so field names here MUST
 * match the keys the pipeline sets on createIssue/updateIssue.
 */
import mongoose from 'mongoose';

const { Schema } = mongoose;

const MergeReasonSchema = new Schema(
  {
    reportId: Schema.Types.Mixed,
    reason: String,
    confidence: Number,
  },
  { _id: false },
);

const IssueSchema = new Schema({
  // GeoJSON Point — [lng, lat]. 2dsphere index below powers $geoNear dedupe.
  centroid: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true },
  },
  category: String,
  severity: { type: Number, min: 1, max: 5 },
  isLifeThreatening: { type: Boolean, default: false },
  summaryBn: String,
  summaryEn: String,
  inferredLocation: String,
  urgencyReason: String,
  department: String,
  estimatedAffectedPeople: { type: Number, default: 0 },
  evidenceConfidence: { type: Number, default: null },
  reportCount: { type: Number, default: 1 },
  priorityWeight: { type: Number, default: 0 },
  status: { type: String, enum: ['open', 'dispatched', 'resolved'], default: 'open' },
  needsReview: { type: Boolean, default: false },
  dispatchBrief: { type: Schema.Types.Mixed, default: null },
  slaDueAt: { type: Date, default: null },
  mergeReasons: { type: [MergeReasonSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Geospatial dedupe candidate lookup ($geoNear, meters, spherical).
IssueSchema.index({ centroid: '2dsphere' });
// Dashboard queries filter by category and recency (plan.md §5).
IssueSchema.index({ category: 1, createdAt: -1 });
// The work queue is ranked by priorityWeight.
IssueSchema.index({ priorityWeight: -1 });

export const Issue = mongoose.model('Issue', IssueSchema);
