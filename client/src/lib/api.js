/**
 * The only place the frontend talks to the API.
 *
 * In dev VITE_API_BASE is empty and vite.config.js proxies /api to the server,
 * so everything is same-origin and CORS never comes up. In production it points
 * at the deployed origin.
 */
const BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

const url = (p) => `${BASE}${p}`;

async function get(path) {
  const res = await fetch(url(path), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${path}`);
  return res.json();
}

/** Absolute URL for an evidence photo path returned by the API. */
export const assetUrl = (p) => (p ? url(p) : null);

export const health = () => get('/api/health');

/**
 * @param {object} [q] { status, category, min_severity, format }
 */
export function getIssues(q = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== null && v !== undefined && v !== '') params.set(k, v);
  }
  const qs = params.toString();
  return get(`/api/issues${qs ? `?${qs}` : ''}`);
}

export const getIssue = (id) => get(`/api/issues/${id}`);
export const getReport = (id) => get(`/api/reports/${id}`);
export const getTransparency = (limit = 100) => get(`/api/transparency?limit=${limit}`);

/**
 * Submit a citizen report.
 *
 * Returns 202 with { id, status } in ~100ms — triage happens in the background
 * because Gemma takes 15-25s (server/src/services/pipeline.js). The confirmation
 * screen then polls getReport(id) until gemmaOutput appears.
 */
export async function postReport({ text, lng, lat, photo, areaHint }) {
  const form = new FormData();
  form.set('rawText', text ?? '');
  form.set('lng', String(lng));
  form.set('lat', String(lat));
  if (areaHint) form.set('areaHint', areaHint);
  if (photo) form.set('photo', photo);

  const res = await fetch(url('/api/reports'), { method: 'POST', body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `submit failed (${res.status})`);
  return body;
}

export async function askCopilot(question) {
  const res = await fetch(url('/api/copilot'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || body.error || `copilot failed (${res.status})`);
  return body;
}

/**
 * Subscribe to live pipeline events.
 *
 * This is what makes the pin land on the map on camera during the demo rather
 * than after a refresh. Returns an unsubscribe function.
 *
 * @param {(event: string, payload: object) => void} onEvent
 */
export function subscribeToStream(onEvent, onStatus) {
  const source = new EventSource(url('/api/stream'));

  // Report connection state separately from events. The dashboard's "live"
  // badge must turn on when the stream OPENS, not when the first issue happens
  // to arrive — otherwise a correctly-connected dashboard reads as broken for
  // as long as the city is quiet.
  source.onopen = () => onStatus?.(true);

  const relay = (name) => (e) => {
    try {
      onEvent(name, JSON.parse(e.data));
    } catch {
      /* a malformed frame must not kill the stream */
    }
  };

  source.addEventListener('issue:created', relay('issue:created'));
  source.addEventListener('issue:updated', relay('issue:updated'));
  source.addEventListener('report:failed', relay('report:failed'));

  // EventSource reconnects on its own; surface the gap so a silent drop is visible.
  source.onerror = () => {
    onStatus?.(false);
    console.warn('[stream] disconnected, retrying…');
  };

  return () => source.close();
}
