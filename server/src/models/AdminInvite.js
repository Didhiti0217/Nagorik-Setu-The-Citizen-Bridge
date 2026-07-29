/**
 * AdminInvite — a pending offer of a console account, in its own collection.
 *
 * Not a `status: 'invited'` row on AdminUser, for two concrete reasons: a
 * pending row would occupy the unique `email` index and block re-inviting the
 * same person after a typo, and it would need a row with no passwordHash in a
 * required field. A separate collection also gives the console something to
 * list and revoke.
 *
 * `corporation` is copied from the INVITER at creation time and never read from
 * the request body — an admin can only invite into their own jurisdiction. That
 * is the single most important authorization decision in this flow.
 *
 * Only the sha256 of the token is stored. The raw token exists exactly once, in
 * the create response, and is embedded in the link the inviter copies. There is
 * no email sender in this app and inventing one would be faking a capability
 * (CLAUDE.md §1.7), so the link is handed over out of band.
 */
import mongoose from 'mongoose';

import { CORPORATION_IDS } from '../lib/corporations.js';

const { Schema } = mongoose;

const AdminInviteSchema = new Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  name: { type: String, default: '' },
  corporation: { type: String, required: true, enum: CORPORATION_IDS },
  tokenHash: { type: String, required: true, unique: true },
  invitedBy: { type: Schema.Types.ObjectId, ref: 'AdminUser', required: true },
  expiresAt: { type: Date, required: true },
  acceptedAt: { type: Date, default: null },
  acceptedUserId: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  revokedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

// Purge a week after expiry rather than at expiry, so the console can still
// show "this invite expired" instead of the row vanishing mid-conversation.
AdminInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 604800 });

export const AdminInvite = mongoose.model('AdminInvite', AdminInviteSchema);
