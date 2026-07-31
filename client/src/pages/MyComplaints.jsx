/**
 * My Complaints — the resident's own reports, and what the city did with them.
 *
 * This page was a placeholder for as long as there was no per-citizen identity to
 * hang it on. There is one now, so it reads GET /api/reports/mine, which returns
 * each report with the deduplicated issue it was folded into — deliberately not
 * /api/issues, which is console-only and would leak the whole municipal work queue
 * to anyone with a phone number.
 *
 * The status shown is the ISSUE's when there is one, because that is what the
 * corporation is actually working on. A report still in triage says so rather than
 * showing a status nobody has decided yet.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import Sidebar from '../components/Sidebar.jsx';
import Topbar from '../components/Topbar.jsx';
import MobileTopbar from '../components/MobileTopbar.jsx';
import MobileNav from '../components/MobileNav.jsx';
import { assetUrl, getMyReports, getReportStatusHistory, revokeReport } from '../lib/api.js';
import { useLang } from '../i18n/index.jsx';

const ISSUE_STATUS_KEY = {
  // Pre-lifecycle values, kept for issues seeded before this existed.
  open: 'statusOpen',
  dispatched: 'statusDispatched',
  // The status lifecycle (services/statusEngine.js).
  reported: 'statusReported',
  under_review: 'statusUnderReview',
  verified: 'statusVerified',
  assigned: 'statusAssigned',
  in_progress: 'statusInProgress',
  resolved: 'statusResolved',
  closed: 'statusClosed',
};

/** Still waiting on the pipeline? Then there is no status to report yet. */
const isPending = (r) => !r.issueId && r.status !== 'manual_review' && r.status !== 'failed' && r.status !== 'revoked';

/** Own status wins over the issue's — this citizen withdrew THEIR report, full stop. */
function statusKey(report) {
  if (report.status === 'revoked') return 'statusRevoked';
  if (report.issueId?.status) return ISSUE_STATUS_KEY[report.issueId.status] ?? 'statusOpen';
  if (report.status === 'manual_review') return 'statusManualReview';
  if (report.status === 'failed') return 'statusFailed';
  return null;
}

/** A finished (or already-withdrawn) complaint has nothing left to revoke. */
function canRevoke(report) {
  if (report.status === 'revoked' || report.status === 'failed') return false;
  const issueStatus = report.issueId?.status;
  return issueStatus !== 'resolved' && issueStatus !== 'closed';
}

const STATUS_LABEL_TIMELINE = {
  reported: 'statusReported',
  under_review: 'statusUnderReview',
  verified: 'statusVerified',
  assigned: 'statusAssigned',
  in_progress: 'statusInProgress',
  resolved: 'statusResolved',
  closed: 'statusClosed',
};

function StatusTimeline({ reportId, t, bn }) {
  const [history, setHistory] = useState(null);

  useEffect(() => {
    let alive = true;
    getReportStatusHistory(reportId)
      .then((res) => alive && setHistory(res.history ?? []))
      .catch(() => alive && setHistory([]));
    return () => {
      alive = false;
    };
  }, [reportId]);

  if (history === null) return <p className={`mc-timeline-loading ${bn ? 'bn' : ''}`}>{t('loading')}</p>;
  if (history.length === 0) return <p className={`mc-timeline-empty ${bn ? 'bn' : ''}`}>{t('noTimelineYet')}</p>;

  return (
    <div className="mc-timeline">
      {history.map((h, i) => (
        <div className="mc-timeline-event" key={i}>
          <span className="mc-timeline-label">
            {t(STATUS_LABEL_TIMELINE[h.newStatus] ?? 'statusOpen')}
          </span>
          <span className="mc-timeline-time">
            {h.createdAt ? new Date(h.createdAt).toLocaleString(bn ? 'bn-BD' : 'en-GB') : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

function ComplaintCard({ report, t, lang, category, onRevoked }) {
  const bn = lang === 'bn';
  const issue = report.issueId || null;
  const severity = issue?.severity ?? report.gemmaOutput?.severity ?? null;
  const cat = issue?.category ?? report.gemmaOutput?.category ?? null;
  const summary = bn
    ? issue?.summaryBn || report.gemmaOutput?.summary_bn
    : issue?.summaryEn || report.gemmaOutput?.summary_en;
  const key = statusKey(report);
  const when = new Date(report.createdAt).toLocaleString(bn ? 'bn-BD' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const [confirming, setConfirming] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  // A handful of photos uploaded before Report.photoData existed (app.js) have
  // no durable backup and are genuinely gone from Render's ephemeral disk —
  // this is the honest "we lost it" state, not a loading glitch, so it gets its
  // own quiet placeholder rather than the browser's broken-image icon.
  const [photoFailed, setPhotoFailed] = useState(false);

  async function confirmRevoke() {
    setRevoking(true);
    setRevokeError(null);
    try {
      await revokeReport(report._id);
      onRevoked();
    } catch (err) {
      setRevokeError(err.message);
      setRevoking(false);
      setConfirming(false);
    }
  }

  return (
    <article className="mc-card">
      {report.photoPath && (
        photoFailed ? (
          <div className="mc-thumb mc-thumb-missing" title="Photo unavailable">🖼️</div>
        ) : (
          <img
            className="mc-thumb"
            src={assetUrl(report.photoPath)}
            alt=""
            loading="lazy"
            onError={() => setPhotoFailed(true)}
          />
        )
      )}

      <div className="mc-body">
        <div className="mc-top">
          {severity && <span className={`sev sev-${severity}`}>S{severity}</span>}
          {cat && <span className="d2-chip">{category(cat)}</span>}
          {key ? (
            <span className={`mc-status ${report.status === 'revoked' ? 'revoked' : (report.issueId?.status ?? report.status)} ${bn ? 'bn' : ''}`}>
              {t(key)}
            </span>
          ) : (
            <span className={`mc-status pending ${bn ? 'bn' : ''}`}>{t('awaitingTriage')}</span>
          )}
        </div>

        {/* The citizen's own words first — they wrote them, they should be able to
            find their complaint by them. Gemma's summary is supporting detail. */}
        <p className={`mc-raw ${report.rawText ? 'bn' : ''}`}>
          {report.rawText || (report.hasPhoto ? t('withPhoto') : '—')}
        </p>
        {summary && <p className={`mc-summary ${bn ? 'bn' : ''}`}>{summary}</p>}

        <div className="mc-meta">
          <span>
            {t('reportedAt')} {when}
          </span>
          {issue?.reportCount > 1 && <span>{issue.reportCount}×</span>}
          {issue?.dispatchBrief?.priority && (
            <span className="d2-chip">{issue.dispatchBrief.priority}</span>
          )}
        </div>

        <div className="mc-actions">
          {report.issueId && (
            <button
              type="button"
              className={`mc-link-btn ${bn ? 'bn' : ''}`}
              onClick={() => setTimelineOpen((o) => !o)}
            >
              {t(timelineOpen ? 'hideTimeline' : 'viewTimeline')}
            </button>
          )}

          {canRevoke(report) && !confirming && (
            <button type="button" className={`mc-link-btn danger ${bn ? 'bn' : ''}`} onClick={() => setConfirming(true)}>
              {t('revoke')}
            </button>
          )}
        </div>

        {timelineOpen && report.issueId && (
          <StatusTimeline reportId={report._id} t={t} bn={bn} />
        )}

        {confirming && (
          <div className="mc-revoke-confirm">
            <p className={bn ? 'bn' : ''}>{t('revokeConfirm')}</p>
            {revokeError && <p className="mc-revoke-error">{revokeError}</p>}
            <div className="mc-revoke-actions">
              <button type="button" className="mc-revoke-yes" disabled={revoking} onClick={confirmRevoke}>
                {revoking ? t('revoking') : t('revokeYes')}
              </button>
              <button type="button" className="mc-revoke-no" disabled={revoking} onClick={() => setConfirming(false)}>
                {t('revokeNo')}
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

export default function MyComplaintsPage() {
  const { t, lang, category } = useLang();
  const bn = lang === 'bn';

  const [reports, setReports] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const { reports: rows } = await getMyReports();
      setReports(rows);
      setError(null);
      return rows;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A report submitted seconds ago is still in Gemma triage (15-25s), so refresh
  // while any of them is unresolved and stop as soon as none is. Polling forever
  // would keep a phone awake for no reason.
  const pending = reports?.some(isPending) ?? false;
  useEffect(() => {
    if (!pending) return undefined;
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [pending, load]);

  return (
    <div className="report-shell">
      <Sidebar />
      <div className="report-main">
        <MobileTopbar />
        <Topbar />
        <div className="report-content">
          <div className="report-head">
            <h1 className={bn ? 'bn' : ''}>{t('myComplaints')}</h1>
          </div>

          {error && <div className={`error-box ${bn ? 'bn' : ''}`}>{error}</div>}

          {reports === null && !error && <p className={bn ? 'bn' : ''}>{t('loading')}</p>}

          {reports?.length === 0 && (
            <div className="placeholder">
              <div className="placeholder-glyph">📋</div>
              <p className={`tagline ${bn ? 'bn' : ''}`}>{t('noComplaintsYet')}</p>
              <p className={`placeholder-hint ${bn ? 'bn' : ''}`}>{t('noComplaintsHint')}</p>
              <Link className="report-submit mc-cta" to="/report">
                {t('newReportBtn')}
              </Link>
            </div>
          )}

          {reports?.length > 0 && (
            <div className="mc-list">
              {reports.map((r) => (
                <ComplaintCard key={r._id} report={r} t={t} lang={lang} category={category} onRevoked={load} />
              ))}
            </div>
          )}
        </div>
      </div>
      <MobileNav />
    </div>
  );
}
