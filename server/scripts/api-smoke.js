/**
 * End-to-end smoke test for the backend — no cloud account, no API key.
 *
 * Spins up an in-memory MongoDB and the REAL Express app, with Gemma set to the
 * `mock` provider so the five stages return fixtures instead of calling a model.
 * Everything else is real: geospatial dedupe, the async 202 pipeline, SSE, the
 * gemma_calls audit log, the copilot tool boundary, and — since auth landed —
 * every route guard and the whole OTP round trip.
 *
 * This is the regression suite for authorization. A guard that gets dropped in a
 * refactor shows up here as a 200 where a 401, 403 or 404 was expected, which is
 * the one class of bug that is otherwise invisible until someone finds it.
 *
 * Run: npm run api:smoke
 */
import { MongoMemoryServer } from 'mongodb-memory-server';

import { connectDb } from '../src/lib/db.js';
import { createStore } from '../src/lib/store.js';
import { publish, subscribe } from '../src/lib/events.js';
import { createPipeline } from '../src/services/pipeline.js';
import { setCallLogger, setMockFixture } from '../src/gemma/index.js';
import { GemmaCall } from '../src/models/GemmaCall.js';
import { Report } from '../src/models/Report.js';
import { AdminUser } from '../src/models/AdminUser.js';
import { hashPassword } from '../src/services/auth.js';
import { resetRateLimits } from '../src/middleware/rateLimit.js';
import { createApp } from '../src/app.js';

/* ---------- assertions ---------------------------------------------------- */
let passed = 0;
const failures = [];
function check(label, cond) {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL ${label}`);
  }
}

/* ---------- mock Gemma fixtures (valid against schemas.js) ---------------- */
const FIXTURES = {
  triage: {
    category: 'hazard', severity: 5,
    urgency_reason: 'Live sparking power line in a crowded market.',
    summary_bn: 'টঙ্গী বাজারে বিদ্যুতের তার স্পার্ক করছে',
    summary_en: 'Live power line sparking at Tongi market',
    inferred_location: 'Tongi Bazar', landmark_confidence: 0.9,
    department: 'Fire Service', action_required: 'immediate_dispatch',
    is_life_threatening: true, estimated_affected_people: 500,
    language_detected: 'bn', pii_present: false,
  },
  evidence: {
    supports_claim: true, evidence_confidence: 0.8,
    visible_elements: ['power line', 'sparks'], mismatch_reason: null,
    image_quality: 'clear',
  },
  // Always "duplicate of candidate 0" — the 2nd nearby report merges into the 1st.
  dedupe: {
    is_duplicate: true, candidate_index: 0, confidence: 0.92,
    reason: 'Same sparking transformer at Tongi Bazar, reported again.',
  },
  dispatch: {
    department: 'Fire Service', priority: 'P1', sla_hours: 1,
    crew: '4-person emergency electrical crew', equipment: ['insulated gloves', 'cordon tape'],
    brief_en: 'Isolate and make safe the sparking line at Tongi Bazar entrance.',
    brief_bn: 'টঙ্গী বাজারে বিদ্যুতের লাইন বিচ্ছিন্ন করে নিরাপদ করুন।',
    citizen_sms_bn: 'আপনার অভিযোগ পেয়েছি। দ্রুত ব্যবস্থা নেওয়া হচ্ছে।',
    priority_justification: 'Immediate electrocution risk in a crowded market.',
  },
  'copilot:plan': {
    tool: 'aggregate_by_category',
    args: { category: null, min_severity: null, days: 7, area: null, status: null, limit: null },
    intent_bn: 'গত সাত দিনের সমস্যা',
  },
  'copilot:answer': {
    answer_bn: 'গত সাত দিনে বিপজ্জনক সমস্যা সবচেয়ে বেশি রিপোর্ট হয়েছে।',
    answer_en: 'Hazard issues were reported most in the last seven days.',
    highlight_issue_ids: [],
  },
};

const TONGI = { lng: 90.4012, lat: 23.8918 };
const CITIZEN_PHONE = '01700000000';
const OTHER_PHONE = '01811111111';
const ADMIN_EMAIL = 'smoke-admin@nagoriksetu.demo';
const ADMIN_PASSWORD = 'smoke-test-password';

/* ---------- helpers ------------------------------------------------------- */
async function waitFor(fn, { tries = 40, gapMs = 250 } = {}) {
  for (let i = 0; i < tries; i += 1) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, gapMs));
  }
  return false;
}

/* ---------- run ----------------------------------------------------------- */
let mongod;
let server;
try {
  console.log('Nagorik Setu — API smoke test (in-memory Mongo + mock Gemma)\n');

  process.env.GEMMA_PROVIDER = 'mock';
  // Demo mode so the OTP comes back in the response and this test can complete a
  // real sign-in without an SMS gateway — exactly the path a judge uses.
  process.env.JWT_SECRET = 'smoke-test-secret-that-is-comfortably-long-enough';
  process.env.AUTH_DEMO_MODE = 'true';
  process.env.OTP_SENDER = 'demo';
  process.env.OTP_RESEND_COOLDOWN_SECONDS = '60';
  process.env.OTP_MAX_ATTEMPTS = '5';

  for (const [stage, value] of Object.entries(FIXTURES)) setMockFixture(stage, value);

  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri('nagorik-setu'));
  setCallLogger(async (rec) => { try { await GemmaCall.create(rec); } catch (e) { console.error(e.message); } });

  const store = createStore();
  const { processReport } = createPipeline({ ...store, publish });
  const app = createApp({ processReport });

  // Capture SSE broadcasts to prove the pipeline publishes live events.
  const sseEvents = [];
  subscribe((e) => sseEvents.push(e.event));

  server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  const api = (path, opts = {}) => fetch(`${base}${path}`, opts);
  const asJson = (token, body) => ({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const bearer = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

  /* ===== 0. the app is CLOSED by default ================================== */
  check('unauthenticated POST /api/reports is 401', (await api('/api/reports', asJson(null, {}))).status === 401);
  check('unauthenticated GET /api/issues is 401', (await api('/api/issues')).status === 401);
  check('unauthenticated POST /api/copilot is 401', (await api('/api/copilot', asJson(null, { question: 'hi' }))).status === 401);

  // Rejected before any SSE header is written, so the client sees a real status
  // and not a silent empty stream.
  const noTicket = await api('/api/stream');
  check('GET /api/stream without a ticket is 401 JSON', noTicket.status === 401 && !String(noTicket.headers.get('content-type')).includes('event-stream'));

  const garbage = await api('/api/issues', bearer('not.a.real.token'));
  check('a forged token is rejected', garbage.status === 401);

  /* ===== 1. public surface stays public =================================== */
  const health = await (await api('/api/health')).json();
  check('GET /api/health ok WITHOUT a token', health.ok === true);
  check('health reports mock provider', health.gemma.provider === 'mock');
  check('GET /api/transparency is public', (await api('/api/transparency')).status === 200);

  /* ===== 2. resident signs in with a phone and a one-time code ============ */
  const otpReq = await api('/api/auth/otp/request', asJson(null, { phone: CITIZEN_PHONE }));
  const otpBody = await otpReq.json();
  check('OTP request returns 200', otpReq.status === 200);
  check('demo mode returns the code on screen', /^\d{6}$/.test(otpBody.demoCode ?? ''));
  check('OTP response masks the number', otpBody.masked === '+8801•••••000');

  const badPhone = await api('/api/auth/otp/request', asJson(null, { phone: '01234' }));
  check('an invalid phone is a 400', badPhone.status === 400);

  const cooldown = await api('/api/auth/otp/request', asJson(null, { phone: CITIZEN_PHONE }));
  check('resend inside the cooldown is 429', cooldown.status === 429);
  check('the 429 carries Retry-After', Number(cooldown.headers.get('retry-after')) > 0);

  const wrongCode = await api('/api/auth/otp/verify', asJson(null, { phone: CITIZEN_PHONE, code: '000000' }));
  check('a wrong code is 401', wrongCode.status === 401);

  const verify = await api('/api/auth/otp/verify', asJson(null, { phone: CITIZEN_PHONE, code: otpBody.demoCode }));
  const citizenSession = await verify.json();
  const CT = citizenSession.token;
  check('the right code signs the resident in', verify.status === 200 && Boolean(CT));
  check('the session user is a citizen', citizenSession.user.role === 'citizen');
  check('the token carries no phone number', !JSON.stringify(citizenSession.token).includes('8801700'));

  const replay = await api('/api/auth/otp/verify', asJson(null, { phone: CITIZEN_PHONE, code: otpBody.demoCode }));
  check('a consumed code cannot be replayed', replay.status === 401);

  // Burn through the attempt cap on a fresh challenge for a second number.
  const other = await (await api('/api/auth/otp/request', asJson(null, { phone: OTHER_PHONE }))).json();
  let capStatus = 0;
  for (let i = 0; i < 5; i += 1) {
    capStatus = (await api('/api/auth/otp/verify', asJson(null, { phone: OTHER_PHONE, code: '000000' }))).status;
  }
  check('the 5th wrong attempt is 429, not another 401', capStatus === 429);
  const afterCap = await api('/api/auth/otp/verify', asJson(null, { phone: OTHER_PHONE, code: other.demoCode }));
  check('the real code no longer works once the challenge is burned', afterCap.status === 401);

  const me = await (await api('/api/auth/me', bearer(CT))).json();
  check('GET /api/auth/me identifies the citizen', me.user.role === 'citizen' && me.user.phone === '+8801700000000');

  /* ===== 3. admin signs in with email and password ======================== */
  await AdminUser.create({
    email: ADMIN_EMAIL,
    passwordHash: await hashPassword(ADMIN_PASSWORD),
    name: 'Smoke Console',
    corporation: 'gazipur',
    isSeed: true,
  });

  const badLogin = await api('/api/auth/admin/login', asJson(null, { email: ADMIN_EMAIL, password: 'wrong' }));
  const unknownLogin = await api('/api/auth/admin/login', asJson(null, { email: 'nobody@nowhere.demo', password: 'wrong' }));
  check('a wrong password is 401', badLogin.status === 401);
  check('a wrong password and an unknown account are indistinguishable',
    (await badLogin.json()).error === (await unknownLogin.json()).error);

  const login = await api('/api/auth/admin/login', asJson(null, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }));
  const adminSession = await login.json();
  const AT = adminSession.token;
  check('the admin signs in', login.status === 200 && Boolean(AT));
  check('the corporation comes from the account, not a picker', adminSession.user.corporation === 'gazipur');
  check('the admin payload never carries a password hash', !('passwordHash' in adminSession.user));

  /* ===== 4. the pipeline still works, now behind the guard =============== */
  const r1 = await api('/api/reports', asJson(CT, { rawText: 'টঙ্গী বাজারে ট্রান্সফরমার স্পার্ক করছে', ...TONGI }));
  check('POST /api/reports returns 202', r1.status === 202);
  const r1body = await r1.json();
  check('202 body carries a report id', Boolean(r1body.id));

  const gotIssue = await waitFor(async () => {
    const issues = await (await api('/api/issues', bearer(AT))).json();
    return issues.length === 1;
  });
  check('pipeline created one issue from the first report', gotIssue);

  await api('/api/reports', asJson(CT, { rawText: 'transformer sparking again at tongi bazar', ...TONGI }));
  const merged = await waitFor(async () => {
    const issues = await (await api('/api/issues', bearer(AT))).json();
    return issues.length === 1 && issues[0].reportCount === 2;
  });
  check('second nearby report merged (1 issue, reportCount=2)', merged);

  const issues = await (await api('/api/issues', bearer(AT))).json();
  const issue = issues[0];
  check('merged issue has a dispatch brief (severity 5)', Boolean(issue.dispatchBrief));
  check('priorityWeight computed', issue.priorityWeight > 0);
  check('merge reason recorded', issue.mergeReasons.length === 1);

  const geo = await (await api('/api/issues?format=geojson', bearer(AT))).json();
  check('GeoJSON FeatureCollection returned', geo.type === 'FeatureCollection' && geo.features.length === 1);
  check('feature geometry is a Point', geo.features[0].geometry.type === 'Point');

  check('SSE published issue:created', sseEvents.includes('issue:created'));
  check('SSE published issue:updated', sseEvents.includes('issue:updated'));

  const trans = await (await api('/api/transparency')).json();
  check('gemma_calls logged to transparency', trans.count > 0);

  /* ===== 5. reports are owned ============================================ */
  const mine = await (await api('/api/reports/mine', bearer(CT))).json();
  check('GET /api/reports/mine is not shadowed by /:id', Array.isArray(mine.reports));
  check('/mine returns exactly this citizen\'s reports', mine.reports.length === 2);
  check('a submitted report records its submitter', Boolean(mine.reports[0].submittedBy));

  check('an admin cannot use the citizen-only /mine', (await api('/api/reports/mine', bearer(AT))).status === 403);
  check('a citizen can read their own report', (await api(`/api/reports/${r1body.id}`, bearer(CT))).status === 200);
  check('an admin can read any report', (await api(`/api/reports/${r1body.id}`, bearer(AT))).status === 200);

  // A report that belongs to nobody — exactly like every report seeded before
  // authentication existed.
  const orphan = await Report.create({
    rawText: 'seeded before auth existed',
    location: { type: 'Point', coordinates: [TONGI.lng, TONGI.lat] },
  });
  const foreign = await api(`/api/reports/${orphan._id}`, bearer(CT));
  check('a report a citizen does not own is 404, NOT 403', foreign.status === 404);
  check('legacy anonymous reports stay readable by the console', (await api(`/api/reports/${orphan._id}`, bearer(AT))).status === 200);

  /* ===== 6. role boundaries ============================================== */
  check('a citizen cannot list the work queue', (await api('/api/issues', bearer(CT))).status === 403);
  check('a citizen cannot read one issue', (await api(`/api/issues/${issue._id}`, bearer(CT))).status === 403);
  check('a citizen cannot spend Gemma calls on the copilot', (await api('/api/copilot', asJson(CT, { question: 'hi' }))).status === 403);
  check('a citizen cannot mint a stream ticket', (await api('/api/auth/stream-ticket', { method: 'POST', ...bearer(CT) })).status === 403);
  check('a citizen cannot invite an admin', (await api('/api/auth/admin/invites', asJson(CT, { email: 'x@y.demo' }))).status === 403);

  /* ===== 7. the copilot, for an admin ==================================== */
  const cop = await api('/api/copilot', asJson(AT, { question: 'গত সাত দিনে সবচেয়ে বেশি কোন সমস্যা?' }));
  check('POST /api/copilot returns 200 for an admin', cop.status === 200);
  const copBody = await cop.json();
  check('copilot used a whitelisted tool', copBody.tool === 'aggregate_by_category');
  check('copilot answered in Bangla', Boolean(copBody.answer?.answer_bn));

  /* ===== 8. the SSE ticket dance ========================================= */
  const ticketRes = await api('/api/auth/stream-ticket', { method: 'POST', ...bearer(AT) });
  const { ticket } = await ticketRes.json();
  check('an admin can mint a stream ticket', ticketRes.status === 200 && Boolean(ticket));

  const streamed = await api(`/api/stream?ticket=${encodeURIComponent(ticket)}`);
  check('a valid ticket opens the event stream',
    streamed.status === 200 && String(streamed.headers.get('content-type')).includes('text/event-stream'));
  await streamed.body.cancel();

  // A session token is not a stream ticket. Different audience, on purpose: a
  // ticket lands in query strings and therefore in access logs.
  check('a session token is rejected as a stream ticket', (await api(`/api/stream?ticket=${encodeURIComponent(AT)}`)).status === 401);
  check('a citizen ticket cannot be forged from a citizen session', (await api(`/api/stream?ticket=${encodeURIComponent(CT)}`)).status === 401);

  /* ===== 9. invites inherit the inviter's jurisdiction =================== */
  const invRes = await api('/api/auth/admin/invites', asJson(AT, { email: 'new.officer@gcc.gov.bd', name: 'New Officer', corporation: 'chattogram' }));
  const inv = await invRes.json();
  check('an admin can create an invite', invRes.status === 201);
  check('the raw token is never returned outside the link', !('token' in inv));

  const rawToken = inv.acceptUrl.split('/').pop();
  const peek = await (await api(`/api/auth/invites/${rawToken}`)).json();
  check('an invite ignores a corporation supplied by the client', peek.corporation === 'gazipur');

  const accepted = await api('/api/auth/invites/accept', asJson(null, { token: rawToken, name: 'New Officer', password: 'a-good-enough-password' }));
  const acceptedBody = await accepted.json();
  check('accepting an invite signs the new admin in', accepted.status === 201 && acceptedBody.user.role === 'admin');
  check('the new admin lands in the INVITER\'s corporation', acceptedBody.user.corporation === 'gazipur');
  check('an invite cannot be accepted twice', (await api('/api/auth/invites/accept', asJson(null, { token: rawToken, name: 'x', password: 'another-password' }))).status === 404);

  const team = await (await api('/api/auth/admin/team', bearer(AT))).json();
  check('the team lists both officers', team.admins.length === 2);
  check('the team listing never carries password hashes', !JSON.stringify(team).includes('passwordHash'));

  /* ===== 10. bad input is rejected, not crashed ========================== */
  resetRateLimits();
  const bad = await api('/api/reports', asJson(CT, { rawText: 'no coordinates here' }));
  check('report without coordinates is a 400', bad.status === 400);
  check('an unparseable report id is a 400', (await api('/api/reports/not-an-objectid', bearer(CT))).status === 400);
  check('an unknown route is a 404 with a JSON body',
    (await api('/api/nope')).status === 404 && (await (await api('/api/nope')).json()).error === 'not found');

  console.log(`\n${'='.repeat(60)}`);
  if (failures.length === 0) {
    console.log(`ALL ${passed} CHECKS PASSED`);
  } else {
    console.log(`${passed} passed, ${failures.length} FAILED:`);
    for (const f of failures) console.log(`  - ${f}`);
  }
} catch (err) {
  console.error('\nSMOKE TEST THREW:', err);
  failures.push('unexpected exception');
} finally {
  if (server) server.close();
  const mongoose = (await import('mongoose')).default;
  await mongoose.disconnect().catch(() => {});
  if (mongod) await mongod.stop();
  process.exit(failures.length === 0 ? 0 : 1);
}
