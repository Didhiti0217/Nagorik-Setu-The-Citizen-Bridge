/**
 * Every Gemma call, raw.
 *
 * This page exists to answer the question nobody asks out loud when they see an
 * AI demo: is this real, or is it hardcoded? Stage, modalities, latency and the
 * actual model output for the last 100 calls. Nothing here is generated for
 * display — it is the audit log the pipeline writes as it runs.
 *
 * It is also where the honest latency numbers come from: Gemma 4 reasons before
 * answering and cannot be told not to, which is why intake is asynchronous.
 */
import { useEffect, useState } from 'react';

import { getTransparency } from '../lib/api.js';

const ms = (n) => (n == null ? '—' : `${(n / 1000).toFixed(1)}s`);

export default function TransparencyPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getTransparency(100).then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="transparency"><div className="empty">{error}</div></div>;
  if (!data) return <div className="transparency"><div className="loading">Loading audit log…</div></div>;

  return (
    <div className="transparency">
      <h1>Transparency — every Gemma 4 call</h1>
      <p className="lede">
        The raw audit log written by the pipeline as it runs: stage, input modalities,
        latency, and the model's actual output. Nothing on this page is generated for
        display, and no response anywhere in this project is hardcoded.
      </p>

      <div className="stats" style={{ padding: 0, border: 'none', marginBottom: 22 }}>
        <div className="stat"><b>{data.count}</b><span>Calls shown</span></div>
        <div className="stat"><b>{ms(data.stats?.p50Ms)}</b><span>p50 latency</span></div>
        <div className="stat"><b>{ms(data.stats?.p95Ms)}</b><span>p95 latency</span></div>
        <div className="stat">
          <b>{Object.keys(data.stats?.byStage || {}).length}</b>
          <span>Stages</span>
        </div>
      </div>

      <p className="lede" style={{ fontSize: 13 }}>
        Latency is dominated by reasoning: thinking accounts for 75–80% of generated
        tokens and cannot be disabled on these models (<code>thinkingConfig</code> returns
        HTTP 400). That is why report submission returns <code>202</code> immediately and
        processes in the background rather than making a citizen wait.
      </p>

      {data.calls.map((c) => (
        <div className="call" key={c._id}>
          <div className="head">
            <span className="stage">{c.stage}</span>
            <span className="chip">{c.model}</span>
            <span className="chip">{(c.modalities || []).join(' + ') || 'text'}</span>
            <span className="chip">{ms(c.latencyMs)}</span>
            {c.tokensIn != null && <span className="chip">{c.tokensIn} in</span>}
            {c.tokensOut != null && <span className="chip">{c.tokensOut} out</span>}
            {c.parsedOk === false && (
              <span className="chip" style={{ color: 'var(--sev-5)' }}>parse failed</span>
            )}
            {c.repairAttempted && <span className="chip">repaired</span>}
            <span style={{ marginLeft: 'auto', color: 'var(--text-dim)' }}>
              {c.createdAt ? new Date(c.createdAt).toLocaleTimeString() : ''}
            </span>
          </div>
          <pre>{(c.rawResponse ?? '(no response recorded)').slice(0, 1500)}</pre>
        </div>
      ))}

      {data.calls.length === 0 && (
        <div className="empty">No calls logged yet. Submit a report to populate this.</div>
      )}
    </div>
  );
}
