/**
 * Issue detail — the dispatch view.
 *
 * Four things here a normal complaint dashboard cannot show:
 *   - the Gemma-generated work order (crew, equipment, SLA, bilingual brief)
 *   - WHY each duplicate report was merged, in plain language
 *   - every citizen's photo, next to Gemma's own read of it (Stage 3), not
 *     just a single confidence number
 *   - the status lifecycle: Gemma SUGGESTS a next stage from a new update,
 *     the backend decides whether to apply it (services/statusEngine.js), and
 *     every attempt — accepted or rejected — is on the timeline below
 *
 * Surfacing the merge reasons is deliberate. Deduplication is the highest-value
 * and highest-risk stage: a wrong merge buries a real complaint. Showing the
 * model's reasoning lets an officer catch that in seconds instead of never.
 *
 * `evidencePhotos` holds one entry per report that arrived with a photo
 * (services/pipeline.js), so a mismatched photo on report #3 stays visible
 * instead of being averaged into the issue-level `evidenceConfidence` below.
 *
 * Status history is not on the `issue` prop — the work-queue list is kept lean
 * on purpose, so this fetches it once per issue via getIssue(), the detail
 * route (routes/issues.js). Live fields (severity, status, photos, ...) still
 * come from the `issue` prop, which the dashboard keeps fresh over SSE.
 */
import { useEffect, useState } from 'react';

import { assetUrl, getIssue, postIssueUpdate } from '../lib/api.js';

const STATUS_LABELS = {
  reported: 'Reported',
  under_review: 'Under Review',
  verified: 'Verified',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

function StatusUpdateForm({ issueId, onApplied }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await postIssueUpdate(issueId, text.trim());
      setResult(res);
      setText('');
      onApplied();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="status-update-form" onSubmit={submit}>
      <textarea
        placeholder="What happened? e.g. &quot;Crew arrived and started digging up the road.&quot;"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
        rows={2}
      />
      <button className="btn" type="submit" disabled={busy || !text.trim()}>
        {busy ? 'Asking Gemma…' : 'Post update'}
      </button>

      {error && <p className="status-update-error">{error}</p>}
      {result && (
        <p className={`status-update-result ${result.applied ? 'applied' : 'rejected'}`}>
          {result.applied
            ? `✓ Moved to "${STATUS_LABELS[result.suggestion?.next_status] ?? result.suggestion?.next_status}" (${Math.round((result.suggestion?.confidence ?? 0) * 100)}% confidence)`
            : `Not applied — ${result.rejectReason ?? 'suggestion rejected'}`}
        </p>
      )}
    </form>
  );
}

export default function IssueDrawer({ issue, onClose }) {
  const b = issue.dispatchBrief;
  const [statusHistory, setStatusHistory] = useState(null);

  const loadHistory = () => {
    getIssue(issue._id)
      .then((full) => setStatusHistory(full.statusHistory ?? []))
      .catch(() => setStatusHistory([]));
  };

  // Refetch whenever the drawer opens on a (possibly different) issue.
  useEffect(loadHistory, [issue._id]);

  return (
    <div className="drawer">
      <button className="btn ghost close" onClick={onClose}>✕</button>

      <div className="row1" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span className={`sev sev-${issue.severity}`}>S{issue.severity}</span>
        <span className="chip">{issue.category}</span>
        <span className={`chip status-chip status-${issue.status}`}>
          {STATUS_LABELS[issue.status] ?? issue.status}
        </span>
        {issue.isLifeThreatening && (
          <span className="chip" style={{ background: 'var(--sev-5)', color: '#fff', border: 'none' }}>
            life-threatening
          </span>
        )}
        {issue.needsReview && <span className="chip">needs review</span>}
      </div>

      <h2>{issue.summaryEn}</h2>
      <p className="bn-summary">{issue.summaryBn}</p>

      <section>
        <h4>Assessment</h4>
        <div className="kv"><span>Reported by</span><span>{issue.reportCount} citizen(s)</span></div>
        <div className="kv"><span>Location</span><span>{issue.inferredLocation || '—'}</span></div>
        <div className="kv"><span>Department</span><span>{issue.department || '—'}</span></div>
        <div className="kv"><span>People affected</span><span>~{issue.estimatedAffectedPeople ?? 0}</span></div>
        <div className="kv"><span>Priority weight</span><span>{issue.priorityWeight}</span></div>
        {issue.evidenceConfidence != null && (
          <div className="kv">
            <span>Photo evidence</span>
            <span>{Math.round(issue.evidenceConfidence * 100)}% supports claim</span>
          </div>
        )}
      </section>

      {issue.urgencyReason && (
        <section>
          <h4>Why this severity</h4>
          <div className="brief">{issue.urgencyReason}</div>
        </section>
      )}

      {b && (
        <section>
          <h4>Dispatch brief · {b.priority} · SLA {b.sla_hours}h</h4>
          <div className="brief">
            <div><strong>Crew:</strong> {b.crew}</div>
            {b.equipment?.length > 0 && (
              <div style={{ marginTop: 6 }}><strong>Equipment:</strong> {b.equipment.join(', ')}</div>
            )}
            <div style={{ marginTop: 10 }}>{b.brief_en}</div>
            <div className="bn">{b.brief_bn}</div>
          </div>
        </section>
      )}

      {b?.citizen_sms_bn && (
        <section>
          <h4>Citizen notification (generated, not sent)</h4>
          <div className="brief bn" style={{ marginTop: 0 }}>{b.citizen_sms_bn}</div>
        </section>
      )}

      {issue.evidencePhotos?.length > 0 && (
        <section>
          <h4>Photo evidence · Gemma's read</h4>
          <div className="evidence-photos">
            {issue.evidencePhotos.map((p, i) => (
              <div className="evidence-photo" key={p.reportId ?? i}>
                <img src={assetUrl(p.photoPath)} alt="" loading="lazy" />
                <div className="evidence-caption">
                  <span className={`evidence-badge ${p.supportsClaim === false ? 'mismatch' : 'ok'}`}>
                    {p.supportsClaim === false ? '⚠ possible mismatch' : '✓ supports claim'}
                    {p.evidenceConfidence != null && ` · ${Math.round(p.evidenceConfidence * 100)}%`}
                  </span>
                  {p.visibleElements?.length > 0 && (
                    <p className="evidence-elements">Visible: {p.visibleElements.join(', ')}</p>
                  )}
                  {p.mismatchReason && <p className="evidence-mismatch">{p.mismatchReason}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h4>Post a status update</h4>
        <StatusUpdateForm issueId={issue._id} onApplied={loadHistory} />
      </section>

      {statusHistory?.length > 0 && (
        <section>
          <h4>Status timeline</h4>
          <div className="status-timeline">
            {statusHistory.map((h, i) => (
              <div className={`status-event${h.applied ? '' : ' rejected'}`} key={i}>
                <div className="status-event-head">
                  <span className="status-event-label">
                    {h.oldStatus ? `${STATUS_LABELS[h.oldStatus] ?? h.oldStatus} → ` : ''}
                    {STATUS_LABELS[h.newStatus] ?? h.newStatus}
                  </span>
                  <span className="status-event-time">
                    {h.createdAt ? new Date(h.createdAt).toLocaleString() : ''}
                  </span>
                </div>
                {!h.applied && h.suggestedStatus && (
                  <div className="status-event-note">
                    Gemma suggested "{STATUS_LABELS[h.suggestedStatus] ?? h.suggestedStatus}" — not applied
                  </div>
                )}
                {h.reason && <div className="status-event-reason">{h.reason}</div>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
