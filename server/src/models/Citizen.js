/**
 * Citizen — a resident, identified by their mobile number and nothing else.
 *
 * There is no password and no registration step: proving control of the number
 * over OTP *is* the account. A first successful verification upserts the row,
 * so sign-up and sign-in are the same act (services/auth.js:verifyOtp).
 *
 * `phone` is stored in E.164 (+8801XXXXXXXXX) and is the unique key, which is
 * why lib/phone.js normalises every input shape — 01712345678, +8801712345678
 * and 8801712345678 must not become three accounts for one person.
 *
 * Kept as its own collection rather than a `role` field on a shared user model:
 * a citizen and an admin share literally zero fields, and merging them would
 * mean two sparse-unique indexes and a passwordHash that could leak into a
 * citizen read.
 */
import mongoose from 'mongoose';

const { Schema } = mongoose;

const CitizenSchema = new Schema({
  phone: { type: String, required: true, unique: true },
  // Never collected today — reserved so a later "what should we call you?"
  // step does not need a migration.
  name: { type: String, default: null },
  reportCount: { type: Number, default: 0 },
  lastLoginAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

export const Citizen = mongoose.model('Citizen', CitizenSchema);
