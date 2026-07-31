/**
 * StatusHistory — the immutable log of every status change an issue goes through.
 *
 * Written once per transition, never edited. `source` records what triggered the
 * check (not who "decided" — the backend always decides, per statusEngine.js);
 * `confidence`/`suggestedStatus` are null for the one entry that isn't
 * Gemma-driven: an issue's creation.
 */
import mongoose from 'mongoose';

const { Schema } = mongoose;

const StatusHistorySchema = new Schema({
  issueId: { type: Schema.Types.ObjectId, ref: 'Issue', required: true, index: true },
  oldStatus: { type: String, default: null },
  newStatus: { type: String, required: true },
  // 'system' (issue created) | 'merge' (a duplicate report brought an update) |
  // 'admin_update' (an officer posted a note).
  source: { type: String, enum: ['system', 'merge', 'admin_update'], required: true },
  // What Gemma actually suggested, even when the backend rejected it — an
  // officer scrolling this log should see the full picture, not just the wins.
  suggestedStatus: { type: String, default: null },
  confidence: { type: Number, default: null },
  reason: { type: String, default: null },
  applied: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

StatusHistorySchema.index({ issueId: 1, createdAt: 1 });

export const StatusHistory = mongoose.model('StatusHistory', StatusHistorySchema);
