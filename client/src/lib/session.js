/**
 * The signed-in session — one store for both roles.
 *
 * This used to be a demo stub whose only content was "which corporation's console
 * am I looking at", kept in localStorage and enforcing nothing. The API is now
 * closed by default, so a session is a real bearer token issued by
 * /api/auth/otp/verify (residents) or /api/auth/admin/login (officers), and the
 * server decides what it can reach. Nothing here grants access; this only
 * remembers what the server already handed us.
 *
 * An admin's `corporation` comes from the token's account and is NOT selectable —
 * choosing another city's workload is an authorization decision, not a view
 * preference (server/src/models/AdminUser.js says the same thing from the other
 * side).
 *
 * Deliberately framework-agnostic below the hook: lib/api.js needs the token on
 * every request and must not have to be inside a component to read it.
 */
import { useCallback, useSyncExternalStore } from 'react';

// Circular with lib/api.js, which needs getToken() on every request. Safe in both
// load orders: neither module calls into the other at import time, only inside
// functions that run long after both are initialised.
import { logout } from './api.js';
import { getCorporation } from './corporations.js';

const KEY = 'nagorik.session';

/* ---------------------------------------------------------------- storage -- */

// Private-mode Safari throws on localStorage, and a judge opening the demo in a
// private window is an explicitly supported path (CLAUDE.md §0). Fall back to a
// module-level value so signing in still works for the life of the tab.
let memory = null;
let usable = true;

function readStored() {
  if (!usable) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    usable = false;
    return memory;
  }
}

function writeStored(value) {
  memory = value;
  if (!usable) return;
  try {
    if (value) localStorage.setItem(KEY, JSON.stringify(value));
    else localStorage.removeItem(KEY);
  } catch {
    usable = false;
  }
}

/* ------------------------------------------------------------------ store -- */

// Cached, because useSyncExternalStore compares snapshots by identity: parsing
// the JSON afresh on every read would return a new object each time and spin.
let current = normalize(readStored());
const listeners = new Set();

/**
 * Shape whatever was in storage into the one session object the app renders,
 * or null. A half-written or hand-edited value is treated as signed out rather
 * than crashing a page on `session.user.role`.
 */
function normalize(raw) {
  const token = raw?.token;
  const user = raw?.user;
  if (typeof token !== 'string' || !token || !user?.role) return null;
  const isAdmin = user.role === 'admin';
  return {
    token,
    user,
    role: user.role,
    isAdmin,
    isCitizen: user.role === 'citizen',
    // Resolved here so no page has to remember to: an id the client cannot
    // resolve would otherwise white-screen the console on corporation.center.
    corporation: isAdmin ? getCorporation(user.corporation) : null,
  };
}

function emit() {
  for (const fn of listeners) fn();
}

function subscribe(fn) {
  listeners.add(fn);
  // Signing out in another tab must sign this one out too — `storage` only fires
  // in *other* tabs, which is exactly the gap this covers.
  const onStorage = (e) => {
    if (e.key !== null && e.key !== KEY) return;
    current = normalize(readStored());
    fn();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
}

/* ----------------------------------------------------------------- public -- */

/** The current session, or null. Safe to call outside React. */
export const getSession = () => current;

/** The bearer token, or null. lib/api.js calls this on every request. */
export const getToken = () => current?.token ?? null;

/** Store what /api/auth returned: { token, user }. */
export function setSession(next) {
  const shaped = normalize(next);
  writeStored(shaped ? { token: shaped.token, user: shaped.user } : null);
  current = shaped;
  emit();
}

/**
 * Forget the session.
 *
 * Called both by an explicit sign-out and by lib/api.js when the server answers
 * 401 — an expired or revoked token should drop the user at the sign-in screen,
 * not leave them clicking a console that fails every request.
 */
export function clearSession() {
  if (!current) return; // idempotent: several parallel 401s must not re-render N times
  writeStored(null);
  current = null;
  emit();
}

/**
 * The session, plus signIn/signOut. Re-renders on any change, including one made
 * in another tab.
 *
 * @returns {{session, user, role, corporation, isCitizen, isAdmin, signIn, signOut}}
 */
export function useSession() {
  const session = useSyncExternalStore(subscribe, getSession, getSession);

  const signIn = useCallback((payload) => setSession(payload), []);
  // Best-effort server call, then forget the token regardless. The token is
  // stateless, so the client discarding it IS the sign-out; if the request fails
  // the user must still end up signed out locally.
  const signOut = useCallback(async () => {
    try {
      await logout();
    } catch {
      /* ignore — see above */
    }
    clearSession();
  }, []);

  return {
    session,
    user: session?.user ?? null,
    role: session?.role ?? null,
    corporation: session?.corporation ?? null,
    isCitizen: Boolean(session?.isCitizen),
    isAdmin: Boolean(session?.isAdmin),
    signIn,
    signOut,
  };
}
