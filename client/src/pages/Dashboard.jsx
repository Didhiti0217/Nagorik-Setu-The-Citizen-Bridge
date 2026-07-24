/**
 * The ward councilor's console.
 *
 * Shows ISSUES, not reports — the deduplicated physical problems. The header
 * stat that matters most is the collapse ratio: N citizen reports became M
 * tickets. That single number is the product's whole argument.
 *
 * Live updates arrive over SSE, so a report submitted on a phone lands on this
 * map without a refresh. That is the demo's proof-of-realness shot (plan.md §9).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import MapView from '../components/MapView.jsx';
import IssueDrawer from '../components/IssueDrawer.jsx';
import CopilotBar from '../components/CopilotBar.jsx';
import { getIssues, subscribeToStream } from '../lib/api.js';
import { useLang } from '../i18n/index.jsx';

function IssueCard({ issue, selected, flashing, onClick, categoryLabel }) {
  const sla = issue.slaDueAt ? new Date(issue.slaDueAt) : null;
  const overdue = sla && sla < new Date();
  return (
    <div
      className={`issue-card${selected ? ' selected' : ''}${flashing ? ' flash' : ''}`}
      onClick={onClick}
    >
      <div className="row1">
        <span className={`sev sev-${issue.severity}`}>S{issue.severity}</span>
        <span className="chip">{categoryLabel(issue.category)}</span>
        {issue.reportCount > 1 && (
          <span className="chip count">{issue.reportCount} reports</span>
        )}
        {issue.dispatchBrief?.priority && (
          <span className="chip">{issue.dispatchBrief.priority}</span>
        )}
      </div>
      <p className="summary">{issue.summaryEn || issue.summaryBn}</p>
      <div className="meta">
        {issue.inferredLocation && <span>📍 {issue.inferredLocation}</span>}
        {issue.department && <span>{issue.department}</span>}
        {sla && <span style={overdue ? { color: 'var(--sev-5)' } : undefined}>
          SLA {overdue ? 'overdue' : sla.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { setLang, category } = useLang();
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [flashId, setFlashId] = useState(null);
  const [live, setLive] = useState(false);
  const [highlightIds, setHighlightIds] = useState(null);
  const queueRef = useRef(null);

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

      setIssues((prev) => {
        const idx = prev.findIndex((i) => i._id === incoming._id);
        const next = idx === -1 ? [incoming, ...prev] : prev.map((i, k) => (k === idx ? incoming : i));
        return [...next].sort((a, b) => (b.priorityWeight ?? 0) - (a.priorityWeight ?? 0));
      });
      setFlashId(incoming._id);
      // Scrolling the new card into view makes the update legible on camera.
      requestAnimationFrame(() => queueRef.current?.scrollTo({ top: 0, behavior: 'smooth' }));
      setTimeout(() => setFlashId((f) => (f === incoming._id ? null : f)), 2600);
    }, setLive);
    return unsub;
  }, []);

  const visible = useMemo(
    () => (highlightIds ? issues.filter((i) => highlightIds.includes(String(i._id))) : issues),
    [issues, highlightIds],
  );

  const stats = useMemo(() => {
    const reports = issues.reduce((n, i) => n + (i.reportCount || 1), 0);
    return {
      issues: issues.length,
      reports,
      collapsed: reports - issues.length,
      urgent: issues.filter((i) => i.severity >= 4).length,
    };
  }, [issues]);

  const selected = issues.find((i) => i._id === selectedId) || null;

  return (
    <div className="dash">
      <aside className="dash-side">
        <div className="side-head">
          <h2>Work queue — Gazipur City Corporation</h2>
          <p>
            Ranked by priority ·{' '}
            <span className={`live-badge${live ? ' on' : ''}`}>
              <span className="dot" />
              {live ? 'live' : 'connecting'}
            </span>
          </p>
        </div>

        <div className="stats">
          <div className="stat">
            <b>{stats.reports}</b>
            <span>Reports</span>
          </div>
          <div className="stat">
            <b>{stats.issues}</b>
            <span>Issues</span>
          </div>
          <div className="stat" title="Duplicate tickets removed by Gemma">
            <b style={{ color: 'var(--brand-bright)' }}>−{stats.collapsed}</b>
            <span>Deduped</span>
          </div>
          <div className="stat">
            <b style={{ color: 'var(--sev-5)' }}>{stats.urgent}</b>
            <span>Urgent</span>
          </div>
        </div>

        {highlightIds && (
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
            <button className="btn ghost" onClick={() => setHighlightIds(null)}>
              ← Clear copilot filter ({visible.length} shown)
            </button>
          </div>
        )}

        <div className="queue" ref={queueRef}>
          {loading && <div className="loading">Loading issues…</div>}
          {error && <div className="empty">Could not load issues.<br />{error}</div>}
          {!loading && !error && visible.length === 0 && (
            <div className="empty">No issues match.</div>
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
      </aside>

      <main className="dash-main">
        <MapView
          issues={visible}
          selectedId={selectedId}
          flashId={flashId}
          onSelect={setSelectedId}
        />
        <CopilotBar onHighlight={setHighlightIds} />
        {selected && <IssueDrawer issue={selected} onClose={() => setSelectedId(null)} />}
      </main>
    </div>
  );
}
