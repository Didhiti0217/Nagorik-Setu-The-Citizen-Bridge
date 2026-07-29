/**
 * AdminUser — a municipal officer, scoped to exactly one city corporation.
 *
 * `corporation` is on the account, not on the session, and that is the whole
 * point of this model. The previous demo let anyone pick a jurisdiction from a
 * radio list at sign-in; an officer choosing to look at another city's workload
 * is not a view preference, it is an authorization decision, and it belongs to
 * whoever provisioned the account.
 *
 * Accounts arrive two ways and never by self-registration: seeded by
 * scripts/seed-admins.js, or created by accepting an invite from an admin who
 * already holds that jurisdiction (services/auth.js:acceptInvite).
 */
import mongoose from 'mongoose';

import { CORPORATION_IDS } from '../lib/corporations.js';

const { Schema } = mongoose;

const AdminUserSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  // select:false is load-bearing: it means no .lean() read anywhere in the app
  // can accidentally ship the hash. Login must ask for it by name with
  // .select('+passwordHash').
  passwordHash: { type: String, required: true, select: false },
  name: { type: String, default: '' },
  // enum, so an account can never carry a jurisdiction the client cannot resolve.
  corporation: { type: String, required: true, enum: CORPORATION_IDS },
  role: { type: String, enum: ['admin'], default: 'admin' },
  invitedBy: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  isSeed: { type: Boolean, default: false },
  disabledAt: { type: Date, default: null },
  lastLoginAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

AdminUserSchema.index({ corporation: 1 });

export const AdminUser = mongoose.model('AdminUser', AdminUserSchema);
