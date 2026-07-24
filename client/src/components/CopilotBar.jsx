/**
 * The Councilor's Copilot — ask in Bangla, the map answers.
 *
 * The councilor types a question; Gemma picks one whitelisted tool with typed
 * arguments; the server runs that parameterised query; Gemma narrates the
 * result back in Bangla; the map filters to the issues it named.
 *
 * The model never writes a query — it selects from a fixed schema
 * (server/src/lib/copilotTools.js). We show the chosen tool and arguments
 * underneath the answer so the mechanism is visible rather than magic, which
 * is both more honest and more convincing to anyone evaluating this.
 */
import { useState } from 'react';

import { askCopilot } from '../lib/api.js';

const SUGGESTIONS = [
  'গত সাত দিনে টঙ্গীতে কোন সমস্যা সবচেয়ে বেশি?',
  'কোন এলাকায় সবচেয়ে বেশি অভিযোগ আসছে?',
  'Show me all life-threatening issues still open',
];

export default function CopilotBar({ onHighlight }) {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [error, setError] = useState(null);

  async function ask(q) {
    const text = (q ?? question).trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await askCopilot(text);
      setAnswer(res);
      // Gemma names the issues worth looking at; filter the map to them.
      const ids = res.answer?.highlight_issue_ids;
      onHighlight?.(ids?.length ? ids.map(String) : null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="copilot">
      {(answer || error || busy) && (
        <div className="answer">
          {busy && <div style={{ color: 'var(--text-dim)' }}>Gemma is thinking…</div>}
          {error && <div style={{ color: 'var(--sev-5)' }}>{error}</div>}
          {answer && (
            <>
              <div className="bn">{answer.answer?.answer_bn}</div>
              <div className="en">{answer.answer?.answer_en}</div>
              <div className="tool">
                {answer.tool}({Object.entries(answer.args || {})
                  .filter(([, v]) => v !== null && v !== undefined)
                  .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
                  .join(', ')}) → {Array.isArray(answer.results) ? answer.results.length : 1} result(s)
              </div>
            </>
          )}
        </div>
      )}

      {!answer && !busy && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              className="btn ghost bn"
              style={{ fontSize: 12 }}
              onClick={() => { setQuestion(s); ask(s); }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="আপনার প্রশ্ন লিখুন / Ask about your ward…"
          disabled={busy}
        />
        <button className="btn" type="submit" disabled={busy || !question.trim()}>
          {busy ? '…' : 'Ask'}
        </button>
      </form>
    </div>
  );
}
