/**
 * The only place the frontend talks to the API.
 *
 * In dev VITE_API_BASE is empty and vite.config.js proxies /api to the server,
 * so everything is same-origin and CORS never comes up. In production it points
 * at the deployed origin.
 *
 * Every request carries the bearer token from lib/session.js when there is one.
 * A 401 on a request that DID carry a token means the session is finished, so it
 * is cleared here, once, centrally — a page reacting to `useSession()` then sends
 * the user back to sign-in instead of leaving them clicking a console where every
 * call fails.
 */
import { getToken, clearSession } from './session.js';

const BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

const url = (p) => `${BASE}${p}`;

/**
 * An API failure that still knows what the server said.
 *
 * `status` matters to callers in a way a bare message does not: the OTP screen
 * shows "wrong code" on 401 but starts a cooldown timer on 429, and only the
 * status distinguishes them.
 */
export class ApiError extends Error {
  constructor(message, { status, retryAfterSec, detail } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status ?? 0;
    this.retryAfterSec = retryAfterSec ?? null;
    this.detail = detail ?? null;
  }
}

/**
 * @param {string} path
 * @param {object} [opts]
 * @param {boolean} [opts.auth=true]  send the bearer token if we hold one
 */
async function request(path, { method = 'GET', body, auth = true, headers = {} } = {}) {
  const token = auth ? getToken() : null;

  const init = { method, headers: { Accept: 'application/json', ...headers } };
  if (token) init.headers.Authorization = `Bearer ${token}`;
  if (body instanceof FormData) {
    // Never set Content-Type by hand for FormData — the browser has to add the
    // multipart boundary, and overriding it makes the upload unparseable.
    init.body = body;
  } else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(url(path), init);
  } catch {
    // A network failure is not a status code, and "Failed to fetch" tells a
    // citizen nothing. Render on Free tier also cold-starts, which looks exactly
    // like this for the first request.
    throw new ApiError('Could not reach the server — check your connection', { status: 0 });
  }

  if (res.status === 204) return null;

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Only a token we actually sent can have expired. Clearing on a 401 from a
    // sign-in attempt would be meaningless, and on `auth: false` calls wrong.
    if (res.status === 401 && token) clearSession();
    throw new ApiError(payload.error || `request failed (${res.status})`, {
      status: res.status,
      retryAfterSec: payload.retryAfterSec ?? (Number(res.headers.get('Retry-After')) || null),
      detail: payload.detail,
    });
  }

  return payload;
}

/** Absolute URL for an evidence photo path returned by the API. */
export const assetUrl = (p) => (p ? url(p) : null);

/* ------------------------------------------------------------------ public -- */

export const health = () => request('/api/health', { auth: false });

/* -------------------------------------------------------------------- auth -- */

/** Ask for a login code. Returns { masked, expiresInSec, resendInSec, demoCode? }. */
export const requestOtp = (phone) =>
  request('/api/auth/otp/request', { method: 'POST', body: { phone }, auth: false });

/** Check a code. Returns { token, user } — hand it straight to setSession(). */
export const verifyOtp = (phone, code) =>
  request('/api/auth/otp/verify', { method: 'POST', body: { phone, code }, auth: false });

export const adminLogin = (email, password) =>
  request('/api/auth/admin/login', { method: 'POST', body: { email, password }, auth: false });

export const getMe = () => request('/api/auth/me');
export const logout = () => request('/api/auth/logout', { method: 'POST' });

/* ----------------------------------------------------------------- invites -- */

/** Public: what an invitation link is for, before asking for a password. */
export const peekInvite = (token) =>
  request(`/api/auth/invites/${encodeURIComponent(token)}`, { auth: false });

export const acceptInvite = ({ token, name, password }) =>
  request('/api/auth/invites/accept', {
    method: 'POST',
    body: { token, name, password },
    auth: false,
  });

export const createInvite = ({ email, name }) =>
  request('/api/auth/admin/invites', { method: 'POST', body: { email, name } });

export const listInvites = () => request('/api/auth/admin/invites');
export const revokeInvite = (id) =>
  request(`/api/auth/admin/invites/${id}`, { method: 'DELETE' });
export const listTeam = () => request('/api/auth/admin/team');

/* ------------------------------------------------------------------ issues -- */

/**
 * @param {object} [q] { status, category, min_severity, format }
 */
export function getIssues(q = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== null && v !== undefined && v !== '') params.set(k, v);
  }
  const qs = params.toString();
  return request(`/api/issues${qs ? `?${qs}` : ''}`);
}

export const getIssue = (id) => request(`/api/issues/${id}`);

/* ----------------------------------------------------------------- reports -- */

export const getReport = (id) => request(`/api/reports/${id}`);

/** The signed-in resident's own reports, newest first. Returns { reports }. */
export const getMyReports = () => request('/api/reports/mine');

/**
 * Submit a citizen report.
 *
 * Returns 202 with { id, status } in ~100ms — triage happens in the background
 * because Gemma takes 15-25s (server/src/services/pipeline.js). The confirmation
 * screen then polls getReport(id) until gemmaOutput appears.
 */
export function postReport({ text, lng, lat, photo, areaHint }) {
  const form = new FormData();
  form.set('rawText', text ?? '');
  form.set('lng', String(lng));
  form.set('lat', String(lat));
  if (areaHint) form.set('areaHint', areaHint);
  if (photo) form.set('photo', photo);
  return request('/api/reports', { method: 'POST', body: form });
}

export const askCopilot = (question) =>
  request('/api/copilot', { method: 'POST', body: { question } });

/* ------------------------------------------------------------------ stream -- */

/**
 * Subscribe to live pipeline events.
 *
 * This is what makes the pin land on the map on camera during the demo rather
 * than after a refresh.
 *
 * EventSource cannot send an Authorization header, so the console first trades
 * its session token for a short-lived, stream-audience ticket and passes that in
 * the query string (server/src/routes/stream.js explains why the audience is
 * separate). The ticket expires — 15 minutes by default, and a demo runs longer
 * than that — so an authentication failure re-mints one instead of leaving
 * EventSource retrying a dead URL forever, which is how a "live" badge lies.
 *
 * Returns a synchronous unsubscribe function, so callers can use it directly as
 * a useEffect cleanup.
 *
 * @param {(event: string, payload: object) => void} onEvent
 * @param {(live: boolean) => void} [onStatus]
 */
export function subscribeToStream(onEvent, onStatus) {
  let source = null;
  let timer = null;
  let stopped = false;
  let attempt = 0;

  const relay = (name) => (e) => {
    try {
      onEvent(name, JSON.parse(e.data));
    } catch {
      /* a malformed frame must not kill the stream */
    }
  };

  async function connect() {
    if (stopped) return;
    let ticket;
    try {
      ({ ticket } = await request('/api/auth/stream-ticket', { method: 'POST' }));
    } catch (err) {
      onStatus?.(false);
      // 401/403 means this session cannot stream at all (signed out, or not an
      // admin). Retrying would be a request-per-second loop against a wall.
      if (err.status === 401 || err.status === 403) return;
      return retry();
    }
    if (stopped) return;

    source = new EventSource(`${url('/api/stream')}?ticket=${encodeURIComponent(ticket)}`);

    // Report connection state separately from events. The dashboard's "live"
    // badge must turn on when the stream OPENS, not when the first issue happens
    // to arrive — otherwise a correctly-connected dashboard reads as broken for
    // as long as the city is quiet.
    source.onopen = () => {
      attempt = 0;
      onStatus?.(true);
    };

    source.addEventListener('issue:created', relay('issue:created'));
    source.addEventListener('issue:updated', relay('issue:updated'));
    source.addEventListener('report:failed', relay('report:failed'));

    source.onerror = () => {
      onStatus?.(false);
      // CLOSED means the browser gave up rather than scheduling its own retry —
      // which is what a rejected ticket looks like. Reconnect with a fresh one.
      if (source?.readyState === EventSource.CLOSED) {
        source.close();
        source = null;
        retry();
      } else {
        console.warn('[stream] disconnected, retrying…');
      }
    };
  }

  function retry() {
    if (stopped || timer) return;
    // 1s, 2s, 4s … capped. Long enough that a sleeping Render instance is not
    // hammered, short enough to be invisible while filming.
    const wait = Math.min(30_000, 1000 * 2 ** attempt);
    attempt += 1;
    timer = setTimeout(() => {
      timer = null;
      connect();
    }, wait);
  }

  connect();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    source?.close();
    source = null;
  };
}
