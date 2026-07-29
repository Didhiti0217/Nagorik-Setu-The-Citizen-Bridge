/**
 * OtpChallenge — one live login code per phone number.
 *
 * `phone` is unique and requests upsert, so a resend overwrites the previous
 * challenge instead of accumulating rows. That also makes the resend cooldown
 * trivially enforceable: there is exactly one `lastSentAt` to compare against.
 *
 * The code itself is never stored. `codeHash` is an HMAC-SHA256 over
 * `otp:<phone>:<code>` keyed with JWT_SECRET (services/auth.js). HMAC rather
 * than bcrypt because the code has only 10^6 possible values — a slow hash buys
 * almost nothing there, and the real defences are the attempt cap, the TTL and
 * the rate limiter. Binding the phone into the HMAC input means a stolen hash
 * cannot be replayed against a different number.
 *
 * IMPORTANT: the TTL index below is garbage collection, NOT a security control.
 * MongoDB's TTL monitor runs roughly once every 60 seconds, so a document past
 * `expiresAt` stays readable for up to a minute after it should be gone.
 * verifyOtp MUST compare expiresAt in code. mongodb-memory-server behaves the
 * same way, so the smoke test must not depend on deletion timing either.
 */
import mongoose from 'mongoose';

const { Schema } = mongoose;

const OtpChallengeSchema = new Schema({
  phone: { type: String, required: true, unique: true },
  codeHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  sendCount: { type: Number, default: 1 },
  lastSentAt: { type: Date, default: Date.now },
  consumedAt: { type: Date, default: null },
  // Which sender delivered it — 'demo' means it was shown on screen, never sent.
  channel: { type: String, default: 'demo' },
  createdAt: { type: Date, default: Date.now },
});

OtpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OtpChallenge = mongoose.model('OtpChallenge', OtpChallengeSchema);
