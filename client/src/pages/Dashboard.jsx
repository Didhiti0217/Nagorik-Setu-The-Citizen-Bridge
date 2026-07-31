/**
 * The corporation console (admin side).
 *
 * Shows ISSUES, not reports — the deduplicated physical problems. The header
 * stat that matters most is the collapse ratio: N citizen reports became M
 * tickets. That single number is the product's whole argument.
 *
 * Scoped to the signed-in city corporation: an officer in Gazipur must not be
 * looking at Dhaka South's workload. Scoping is geographic (lib/corporations.js)
 * because a corporation *is* a jurisdiction, so a pin and its ticket can never
 * disagree about which city they belong to. Every issue resolves to exactly
 * one corporation — contained by its bbox, or nearest by centre otherwise — so
 * a citizen's report can never be invisible to every console at once.
 *
 * Layout: the crimson nav rail (left), the work queue as a scrollable list of
 * cards (centre), and the map (right) — always visible, never behind a toggle,
 * because where the city's problems physically are is the thing this console
 * exists to show. The Copilot moved to its own page (pages/Copilot.jsx) and
 * hands its results back here through router state.
 *
 * Live updates arrive over SSE, so a report submitted on a phone lands here
 * without a refresh — the new card flashes and scrolls into view.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import Sidebar from '../components/Sidebar.jsx';
import Topbar from '../components/Topbar.jsx';
import MobileTopbar from '../components/MobileTopbar.jsx';
import MobileNav from '../components/MobileNav.jsx';
import MapView from '../components/MapView.jsx';
import IssueDrawer from '../components/IssueDrawer.jsx';
import CopilotChat from '../components/CopilotChat.jsx';
import { getIssues, subscribeToStream } from '../lib/api.js';
import { useLang } from '../i18n/index.jsx';
import { useSession } from '../lib/session.js';
import { corpName, assignCorporation, filterIssues } from '../lib/corporations.js';

function IssueCard({ issue, selected, flashing, onClick, categoryLabel }) {
  return (
    <button
      type="button"
      className={`d2-card${selected ? ' selected' : ''}${flashing ? ' flash' : ''}`}
      onClick={onClick}
    >
      <div className="d2-card-top">
        <span className={`sev sev-${issue.severity}`}>S{issue.severity}</span>
        <span className="d2-chip">{categoryLabel(issue.category)}</span>
        {issue.reportCount > 1 && <span className="d2-chip count">{issue.reportCount}×</span>}
      </div>

      <p className="d2-card-summary">{issue.summaryEn || issue.summaryBn}</p>

      <div className="d2-card-meta">
        {issue.inferredLocation && <span>📍 {issue.inferredLocation}</span>}
        {issue.department && <span>{issue.department}</span>}
      </div>

      <div className="d2-card-foot">
        {issue.dispatchBrief?.priority && <span className="d2-chip">{issue.dispatchBrief.priority}</span>}
      </div>
    </button>
  );
}

export default function DashboardPage() {
  const { setLang, category, t, lang } = useLang();
  // The jurisdiction comes from the signed-in account's token, not from a picker.
  const { corporation, user, signOut } = useSession();
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [flashId, setFlashId] = useState(null);
  const [live, setLive] = useState(false);
  const [highlightIds, setHighlightIds] = useState(null);
  const [view, setView] = useState('cards'); // centre column: 'cards' | 'map'
  const queueRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Only reachable from the unknown-jurisdiction state below. Awaited, so the guard
  // sees a cleared session and lets /admin/login render instead of bouncing back.
  const leaveConsole = useCallback(async () => {
    await signOut();
    navigate('/admin/login', { replace: true });
  }, [signOut, navigate]);

  // The Copilot page sends the issues Gemma named back here to filter the queue.
  // Router state rather than a query string: these are opaque ids that mean
  // nothing in a URL someone might share, and they should not survive a reload.
  useEffect(() => {
    const ids = location.state?.highlight;
    if (ids?.length) setHighlightIds(ids.map(String));
  }, [location.state?.highlight]);

  // Municipal officers work in English; the citizen app stays Bangla.
  useEffect(() => { setLang('en'); }, [setLang]);

  const load = useCallback(async () => {
    try {
      const data = await getIssues();
      setIssues(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ---- live pipeline events ---- */
  useEffect(() => {
    const unsub = subscribeToStream((event, payload) => {
      if (event === 'report:failed') return;
      const incoming = payload?.issue;
      if (!incoming?._id) return;

      // Keep every issue in state regardless of jurisdiction — switching
      // corporation then re-filters instantly instead of refetching.
      setIssues((prev) => {
        const idx = prev.findIndex((i) => i._id === incoming._id);
        const next = idx === -1 ? [incoming, ...prev] : prev.map((i, k) => (k === idx ? incoming : i));
        return [...next].sort((a, b) => (b.priorityWeight ?? 0) - (a.priorityWeight ?? 0));
      });

      // ...but only announce it if it landed in the console we're looking at.
      // Flashing a card an officer cannot see would be worse than silence.
      if (assignCorporation(incoming?.centroid?.coordinates)?.id !== corporation.id) return;
      setFlashId(incoming._id);
      // Scrolling the new card into view makes the update legible on camera.
      requestAnimationFrame(() => queueRef.current?.scrollTo({ top: 0, behavior: 'smooth' }));
      setTimeout(() => setFlashId((f) => (f === incoming._id ? null : f)), 2600);
    }, setLive);
    return unsub;
  }, [corporation]);

  /* ---- jurisdiction scoping ---- */
  const { inside: scoped } = useMemo(
    () => filterIssues(issues, corporation),
    [issues, corporation],
  );

  const visible = useMemo(
    () => (highlightIds ? scoped.filter((i) => highlightIds.includes(String(i._id))) : scoped),
    [scoped, highlightIds],
  );

  const stats = useMemo(() => {
    const reports = scoped.reduce((n, i) => n + (i.reportCount || 1), 0);
    return {
      issues: scoped.length,
      reports,
      urgent: scoped.filter((i) => i.severity >= 4).length,
    };
  }, [scoped]);

  const selected = scoped.find((i) => i._id === selectedId) || null;

  // After every hook — React forbids an early return that skips them.
  //
  // An admin whose account carries a jurisdiction this build cannot resolve. The
  // server's `enum: CORPORATION_IDS` makes it nearly impossible, but this must NOT
  // redirect to /admin/login: that page now bounces signed-in admins back here, so a
  // redirect would be an infinite loop and a white screen. Say what is wrong and
  // offer the one action that fixes it.
  if (!corporation) {
    return (
      <div className="dash2">
        <Sidebar variant="admin" />
        <main className="dash2-main">
          <div className="d2-empty">
            This account is assigned to <b>{user?.corporation || 'no corporation'}</b>, which
            this build does not know about.
            <br />
            Sign in with an account whose jurisdiction is one of the five city corporations.
            <br />
            <button type="button" className="report-submit" onClick={leaveConsole}>
              {t('signOut')}
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="dash2">
      <Sidebar variant="admin" />

      <main className="dash2-main">
        <MobileTopbar />
        <Topbar />

        <div className="dash2-head">
          <div className="dash2-titles">
            <h2>
              {t('workQueue')} — {corpName(corporation, lang)}
            </h2>
            <p>
              Ranked by priority ·{' '}
              <span className={`live-badge${live ? ' on' : ''}`}>
                <span className="dot" />
                {live ? 'live' : 'connecting'}
              </span>
            </p>
          </div>
          <div className="d2-toggle" role="tablist" aria-label="View">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'cards'}
              className={view === 'cards' ? 'active' : ''}
              onClick={() => setView('cards')}
            >
              ▦ Cards
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'map'}
              className={view === 'map' ? 'active' : ''}
              onClick={() => setView('map')}
            >
              ◍ Map
            </button>
          </div>
        </div>

        <div className="d2-stats">
          <div className="d2-stat">
            <b>{stats.reports}</b>
            <span>Reports</span>
          </div>
          <div className="d2-stat">
            <b>{stats.issues}</b>
            <span>Issues</span>
          </div>
          <div className="d2-stat">
            <b className="danger">{stats.urgent}</b>
            <span>Urgent</span>
          </div>
        </div>

        {highlightIds && (
          <button className="d2-clear" onClick={() => setHighlightIds(null)}>
            ← Clear copilot filter ({visible.length} shown)
          </button>
        )}

        {view === 'cards' ? (
          <div className="d2-cards no-scrollbar" ref={queueRef}>
            {loading && <div className="d2-empty">Loading issues…</div>}
            {error && <div className="d2-empty">Could not load issues.<br />{error}</div>}
            {!loading && !error && visible.length === 0 && (
              <div className="d2-empty">{highlightIds ? 'No issues match.' : t('noIssuesHere')}</div>
            )}
            {visible.map((issue) => (
              <IssueCard
                key={issue._id}
                issue={issue}
                categoryLabel={category}
                selected={issue._id === selectedId}
                flashing={issue._id === flashId}
                onClick={() => setSelectedId(issue._id)}
              />
            ))}
          </div>
        ) : (
          <div className="d2-map">
            <MapView
              issues={visible}
              selectedId={selectedId}
              flashId={flashId}
              onSelect={setSelectedId}
              center={corporation.center}
              zoom={corporation.zoom}
            />
          </div>
        )}
      </main>

      {/* Right column: the Copilot chat, with the issue drawer sliding in over it
          when a card is opened. The chat stays mounted underneath. */}
      <aside className="dash2-aside">
        <CopilotChat onHighlight={setHighlightIds} showHeader />
        {selected && <IssueDrawer issue={selected} onClose={() => setSelectedId(null)} />}
      </aside>

      <MobileNav variant="admin" />
    </div>
  );
}
