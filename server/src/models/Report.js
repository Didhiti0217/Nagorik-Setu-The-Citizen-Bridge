/**
 * Report — one raw citizen submission, preserved verbatim.
 *
 * A report is never dropped: even when triage fails it is kept and flagged
 * (status: 'failed' / 'manual_review'), because a citizen's complaint must not
 * vanish because the model had a bad day (schemas.js:manualReviewFallback).
 *
 * The photo BYTES are not stored here — only an optional `photoPath` to the file
 * on disk. The base64 image is passed transiently to Gemma and never persisted
 * in the database.
 */
import mongoose from 'mongoose';

const { Schema } = mongoose;

const ReportSchema = new Schema({
  rawText: { type: String, default: '' },
  hasPhoto: { type: Boolean, default: false },
  photoPath: { type: String, default: null },
  // GeoJSON Point — [lng, lat].
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true },
  },
  areaHint: { type: String, default: null },
  // Who filed it. Null on every report seeded before authentication existed —
  // those genuinely belong to nobody, so they stay out of any citizen's "my
  // complaints" and remain readable only by the console. No backfill.
  submittedBy: { type: Schema.Types.ObjectId, ref: 'Citizen', default: null, index: true },
  // received -> processing -> triaged|manual_review -> linked | failed
  // A citizen can also move ANY of those to 'revoked' themselves (routes/reports.js).
  status: { type: String, default: 'received' },
  gemmaOutput: { type: Schema.Types.Mixed, default: null },
  evidenceCheck: { type: Schema.Types.Mixed, default: null },
  issueId: { type: Schema.Types.ObjectId, ref: 'Issue', default: null },
  error: { type: String, default: null },
  revokedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

ReportSchema.index({ location: '2dsphere' });

export const Report = mongoose.model('Report', ReportSchema);
