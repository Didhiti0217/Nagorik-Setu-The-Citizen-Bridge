/**
 * The admin session — a demo-grade stub, on purpose (CLAUDE.md §4).
 *
 * There is no password, no token, and no server-side check. Signing in means
 * "which corporation's console am I looking at", and that choice is kept in
 * localStorage so a refresh mid-demo doesn't bounce you back to the picker.
 *
 * This must never be mistaken for access control. It scopes a view; it does not
 * protect anything, and the API remains open exactly as before.
 */
import { useCallback, useEffect, useState } from 'react';

import { getCorporation } from './corporations.js';

const KEY = 'nagorik.admin.corporation';

export function readSession() {
  try {
    return getCorporation(localStorage.getItem(KEY));
  } catch {
    // Private-mode Safari throws on localStorage. A judge in a private window
    // is an explicitly supported path, so degrade to "signed out", never crash.
    return null;
  }
}

function writeSession(id) {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore — the session is a convenience, not a requirement */
  }
  // Same-tab listeners: the `storage` event only fires in *other* tabs.
  window.dispatchEvent(new Event('nagorik:session'));
}

/** The signed-in corporation, or null. Re-renders on sign in/out. */
export function useAdminSession() {
  const [corporation, setCorporation] = useState(readSession);

  useEffect(() => {
    const sync = () => setCorporation(readSession());
    window.addEventListener('nagorik:session', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('nagorik:session', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const signIn = useCallback((id) => writeSession(id), []);
  const signOut = useCallback(() => writeSession(null), []);

  return { corporation, signIn, signOut };
}
