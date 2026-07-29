/**
 * Everything that decides who someone is. Routes stay thin (CLAUDE.md §3).
 *
 * Two ways in, deliberately different:
 *
 *   Residents prove control of a mobile number over a one-time code. There is no
 *   password and no registration step — a first successful verification upserts
 *   the Citizen, so signing up and signing in are the same act. Asking a
 *   resident reporting a broken power line to invent and remember a password is
 *   how you lose the report.
 *
 *   Admins use an email and a password, because a municipal console is not
 *   something you should be able to enter by holding a phone. Their accounts are
 *   provisioned — seeded, or invited by an admin who already holds that
 *   jurisdiction — never self-registered.
 *
 * Every failure here throws AuthError with a status; middleware/errors.js turns
 * that into the same { error } shape the rest of the API already uses.
 */
import { createHmac, randomBytes, randomInt, createHash, timingSafeEqual } from 'node:crypto';

import bcrypt from 'bcryptjs';

import { authConfig } from '../lib/authConfig.js';
import { signSession, signStreamTicket } from '../lib/jwt.js';
import { normalizePhone, maskPhone } from '../lib/phone.js';
import { AuthError } from '../middleware/auth.js';
import { Citizen } from '../models/Citizen.js';
import { AdminUser } from '../models/AdminUser.js';
import { AdminInvite } from '../models/AdminInvite.js';
import { OtpChallenge } from '../models/OtpChallenge.js';
import { createOtpSender } from './otpSender.js';

const BCRYPT_COST = 10;

// Resolved once, lazily — so a test can set OTP_SENDER before the first call
// without this module having already read it at import time.
let sender = null;
const otpSender = () => (sender ??= createOtpSender());

/* ---------------------------------------------------------------- shapes -- */

/**
 * The one user shape the client parses. Both roles produce it, so the frontend
 * has a single thing to render and one field (`role`) to branch on.
 */
export function publicCitizen(doc) {
  return {
    id: String(doc._id),
    role: 'citizen',
    phone: doc.phone,
    masked: maskPhone(doc.phone),
    name: doc.name ?? null,
  };
}

export function publicAdmin(doc) {
  return {
    id: String(doc._id),
    role: 'admin',
    email: doc.email,
    name: doc.name ?? '',
    corporation: doc.corporation,
  };
}

/* ------------------------------------------------------------------- otp -- */

/**
 * HMAC-SHA256 rather than bcrypt.
 *
 * A six-digit code has only 10^6 possible values, so a deliberately slow hash
 * buys almost nothing — anyone who can read the database can enumerate the space
 * regardless. The defences that actually matter are the five-attempt cap, the
 * five-minute TTL and the rate limiter. What hashing buys is that a leaked dump
 * does not hand over live codes, and binding the phone into the input means a
 * stolen hash cannot be replayed against a different number.
 */
function hashCode(phone, code) {
  return createHmac('sha256', authConfig().jwtSecret).update(`otp:${phone}:${code}`).digest('hex');
}

function codesMatch(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  // timingSafeEqual throws on a length mismatch, which would itself be a timing
  // signal. Both are fixed-length hex digests, so this only guards a corrupt row.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Issue (or re-issue) a login code.
 *
 * @returns {{phone, masked, expiresInSec, resendInSec, channel, demoCode?}}
 */
export async function requestOtp({ phone: rawPhone }) {
  const cfg = authConfig();
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new AuthError('enter a valid Bangladeshi mobile number', 400);

  const existing = await OtpChallenge.findOne({ phone });
  if (existing) {
    const waited = (Date.now() - new Date(existing.lastSentAt).getTime()) / 1000;
    if (waited < cfg.otpResendCooldownSec) {
      const err = new AuthError('please wait before requesting another code', 429);
      err.retryAfterSec = Math.ceil(cfg.otpResendCooldownSec - waited);
      throw err;
    }
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = new Date(Date.now() + cfg.otpTtlSec * 1000);

  let delivery;
  try {
    delivery = await otpSender().deliver({ phone, code, ttlSec: cfg.otpTtlSec });
  } catch (err) {
    console.error('[auth] otp delivery failed:', err.message);
    throw new AuthError('could not send the code, please try again', 502);
  }

  // A resend overwrites: same row (phone is unique), new code, attempts back to
  // zero, extended expiry. Accumulating challenges would make "which code is
  // live?" ambiguous and break the cooldown, which reads a single lastSentAt.
  await OtpChallenge.findOneAndUpdate(
    { phone },
    {
      $set: {
        codeHash: hashCode(phone, code),
        expiresAt,
        attempts: 0,
        lastSentAt: new Date(),
        consumedAt: null,
        channel: delivery.channel,
      },
      $inc: { sendCount: 1 },
      $setOnInsert: { phone, createdAt: new Date() },
    },
    { upsert: true, new: true },
  );

  return {
    phone,
    masked: maskPhone(phone),
    expiresInSec: cfg.otpTtlSec,
    resendInSec: cfg.otpResendCooldownSec,
    channel: delivery.channel,
    // Only when the sender did not actually deliver anything AND the operator
    // has opted into demo mode. Both conditions, because either one alone
    // getting flipped by accident would be a log-in-as-anyone oracle — and
    // lib/authConfig.js refuses to boot on the dangerous combination.
    ...(cfg.demoMode && !delivery.delivered ? { demoCode: code } : {}),
  };
}

/**
 * Check a code and sign the resident in, creating the account on first use.
 *
 * @returns {{token, user}}
 */
export async function verifyOtp({ phone: rawPhone, code }) {
  const cfg = authConfig();
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new AuthError('enter a valid Bangladeshi mobile number', 400);

  const challenge = await OtpChallenge.findOne({ phone });

  // Missing and expired share one message on purpose. Distinguishing them would
  // let anyone enumerate which numbers have recently tried to sign in.
  //
  // The expiry is checked HERE, not left to the TTL index: Mongo's TTL monitor
  // runs about once a minute, so an expired challenge stays readable for a while
  // after it should be gone. The index is garbage collection, not a control.
  const expired = challenge && new Date(challenge.expiresAt).getTime() <= Date.now();
  if (!challenge || expired) {
    if (expired) await OtpChallenge.deleteOne({ _id: challenge._id });
    throw new AuthError('that code is not right, or it has expired — request a new one', 401);
  }

  if (!codesMatch(challenge.codeHash, hashCode(phone, code))) {
    const attempts = challenge.attempts + 1;
    if (attempts >= cfg.otpMaxAttempts) {
      // Burn the challenge rather than leaving a lockout row. The per-phone rate
      // limiter still caps how fast a new one can be requested, so this costs an
      // attacker a request instead of costing a fumbling user a 60s wait.
      await OtpChallenge.deleteOne({ _id: challenge._id });
      throw new AuthError('too many attempts — request a new code', 429);
    }
    await OtpChallenge.updateOne({ _id: challenge._id }, { $inc: { attempts: 1 } });
    throw new AuthError('that code is not right', 401);
  }

  await OtpChallenge.deleteOne({ _id: challenge._id });

  const citizen = await Citizen.findOneAndUpdate(
    { phone },
    { $setOnInsert: { phone, createdAt: new Date() }, $set: { lastLoginAt: new Date() } },
    { upsert: true, new: true },
  );

  const user = publicCitizen(citizen);
  return { token: signSession({ id: user.id, role: 'citizen' }), user };
}

/* ----------------------------------------------------------------- admin -- */

/** @returns {{token, user}} */
export async function adminLogin({ email, password }) {
  const admin = await AdminUser.findOne({ email: String(email).toLowerCase().trim() }).select(
    '+passwordHash',
  );

  // One message for "no such account" and "wrong password", and a hash
  // comparison even when the account does not exist — otherwise the response
  // time tells an attacker which municipal email addresses are real.
  const hash = admin?.passwordHash || '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const ok = await bcrypt.compare(String(password), hash);
  if (!admin || !ok) throw new AuthError('wrong email or password', 401);

  if (admin.disabledAt) throw new AuthError('this account has been disabled', 403);

  admin.lastLoginAt = new Date();
  await admin.save();

  const user = publicAdmin(admin);
  return {
    token: signSession({ id: user.id, role: 'admin', corporation: user.corporation }),
    user,
  };
}

/** Identity for a token that already verified. @returns {{user}} */
export async function getMe(auth) {
  if (auth.role === 'admin') {
    const admin = await AdminUser.findById(auth.id);
    if (!admin || admin.disabledAt) throw new AuthError('sign in required', 401);
    return { user: publicAdmin(admin) };
  }
  const citizen = await Citizen.findById(auth.id);
  if (!citizen) throw new AuthError('sign in required', 401);
  return { user: publicCitizen(citizen) };
}

/** Short-lived, stream-audience token for EventSource. @returns {{ticket, expiresInSec}} */
export function createStreamTicket(auth) {
  return signStreamTicket({ id: auth.id, role: auth.role, corporation: auth.corp });
}

/* --------------------------------------------------------------- invites -- */

const hashInviteToken = (raw) => createHash('sha256').update(raw).digest('hex');

const publicInvite = (doc) => ({
  id: String(doc._id),
  email: doc.email,
  name: doc.name ?? '',
  corporation: doc.corporation,
  expiresAt: doc.expiresAt,
  createdAt: doc.createdAt,
});

/**
 * Invite another officer into YOUR corporation.
 *
 * The jurisdiction is copied from the inviter and is never read from the request
 * body. This is the load-bearing authorization decision in the whole flow: let
 * the client name a corporation and any admin can mint themselves an account in
 * a city they have no authority over.
 *
 * @returns {{invite, acceptUrl, token}} — `token` is the only time the raw value exists.
 */
export async function createInvite(auth, { email, name }) {
  const cfg = authConfig();
  const normalizedEmail = String(email).toLowerCase().trim();

  const existing = await AdminUser.findOne({ email: normalizedEmail });
  if (existing) throw new AuthError('an account with that email already exists', 409);

  const inviter = await AdminUser.findById(auth.id);
  if (!inviter) throw new AuthError('sign in required', 401);

  // Supersede any live invite for this address, so a typo-then-retry does not
  // leave two working links to the same account.
  await AdminInvite.deleteMany({ email: normalizedEmail, acceptedAt: null });

  const raw = randomBytes(32).toString('base64url');
  const invite = await AdminInvite.create({
    email: normalizedEmail,
    name: name || '',
    corporation: inviter.corporation,
    tokenHash: hashInviteToken(raw),
    invitedBy: inviter._id,
    expiresAt: new Date(Date.now() + cfg.inviteTtlHours * 3600 * 1000),
  });

  return {
    invite: publicInvite(invite),
    // There is no email sender in this app, and inventing one would be faking a
    // capability (CLAUDE.md §1.7). The inviter copies this link and sends it
    // however they already talk to their colleague.
    acceptUrl: `${cfg.publicAppUrl}/admin/invite/${raw}`,
    token: raw,
  };
}

/** Pending invites for the caller's corporation. @returns {{invites}} */
export async function listInvites(auth) {
  const invites = await AdminInvite.find({
    corporation: auth.corp,
    acceptedAt: null,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .lean();
  return { invites: invites.map(publicInvite) };
}

export async function revokeInvite(auth, id) {
  // Scoped to the caller's corporation, so an id from another city is a 404
  // rather than a cross-jurisdiction write.
  const result = await AdminInvite.findOneAndUpdate(
    { _id: id, corporation: auth.corp, acceptedAt: null },
    { $set: { revokedAt: new Date() } },
  ).catch(() => null);
  if (!result) throw new AuthError('not found', 404);
}

/** Officers in the caller's corporation. @returns {{admins}} */
export async function listTeam(auth) {
  const admins = await AdminUser.find({ corporation: auth.corp }).sort({ createdAt: 1 }).lean();
  return {
    admins: admins.map((a) => ({
      id: String(a._id),
      email: a.email,
      name: a.name ?? '',
      isSeed: Boolean(a.isSeed),
      disabled: Boolean(a.disabledAt),
      lastLoginAt: a.lastLoginAt ?? null,
      createdAt: a.createdAt,
    })),
  };
}

async function findLiveInvite(rawToken) {
  const invite = await AdminInvite.findOne({ tokenHash: hashInviteToken(String(rawToken)) });
  if (!invite || invite.revokedAt || invite.acceptedAt) {
    throw new AuthError('this invitation is no longer valid', 404);
  }
  if (new Date(invite.expiresAt).getTime() <= Date.now()) {
    throw new AuthError('this invitation has expired', 410);
  }
  return invite;
}

/** Read-only preview so the accept page can render before asking for a password. */
export async function peekInvite(rawToken) {
  const invite = await findLiveInvite(rawToken);
  return { email: invite.email, name: invite.name ?? '', corporation: invite.corporation };
}

/** @returns {{token, user}} — accepting signs you straight in. */
export async function acceptInvite({ token: rawToken, name, password }) {
  const invite = await findLiveInvite(rawToken);

  const clash = await AdminUser.findOne({ email: invite.email });
  if (clash) throw new AuthError('an account with that email already exists', 409);

  const admin = await AdminUser.create({
    email: invite.email,
    passwordHash: await bcrypt.hash(String(password), BCRYPT_COST),
    name: name || invite.name || '',
    corporation: invite.corporation, // from the invite, never from the request
    invitedBy: invite.invitedBy,
    lastLoginAt: new Date(),
  });

  invite.acceptedAt = new Date();
  invite.acceptedUserId = admin._id;
  await invite.save();

  const user = publicAdmin(admin);
  return {
    token: signSession({ id: user.id, role: 'admin', corporation: user.corporation }),
    user,
  };
}

/** Shared by scripts/seed-admins.js so the cost factor lives in one place. */
export const hashPassword = (plain) => bcrypt.hash(String(plain), BCRYPT_COST);
