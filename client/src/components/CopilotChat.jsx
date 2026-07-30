/**
 * The Councilor's Copilot — as a chat panel.
 *
 * Same mechanism as before: the councilor asks in Bangla or English, Gemma picks
 * one whitelisted tool with typed arguments, the server runs that parameterised
 * query, and Gemma narrates the result. The model never writes a query — it
 * selects from a fixed schema (server/src/lib/copilotTools.js), and we surface
 * the chosen tool under each answer so the mechanism stays visible, not magic.
 *
 * Presentation is a running conversation: right-aligned question bubbles,
 * left-aligned answer bubbles, a typing indicator, and suggestion chips that
 * float above the input the way a messaging app offers quick replies.
 *
 * When Gemma names specific issues, the answer keeps them and offers a button
 * rather than calling onHighlight straight away: this panel now lives on its own
 * page (pages/Copilot.jsx), so acting on the ids means navigating to the work
 * queue — and doing that automatically would scroll away the answer just given.
 */
import { useEffect, useRef, useState } from 'react';

import { askCopilot } from '../lib/api.js';

const SUGGESTIONS = [
  'গত সাত দিনে টঙ্গীতে কোন সমস্যা সবচেয়ে বেশি?',
  'কোন এলাকায় সবচেয়ে বেশি অভিযোগ আসছে?',
  'Show me all life-threatening issues still open',
];

export default function CopilotChat({ onHighlight }) {
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  // Keep the newest message in view, like any chat app.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  async function ask(q) {
    const text = (q ?? question).trim();
    if (!text || busy) return;
    setQuestion('');
    setMessages((m) => [...m, { role: 'user', text }]);
    setBusy(true);
    try {
      const res = await askCopilot(text);
      // Gemma names the issues worth looking at. They ride along on the message
      // so the answer can offer to show them, instead of navigating unasked.
      const ids = res.answer?.highlight_issue_ids;
      setMessages((m) => [
        ...m,
        {
          role: 'bot',
          bn: res.answer?.answer_bn,
          en: res.answer?.answer_en,
          ids: ids?.length ? ids.map(String) : null,
        },
      ]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'bot', error: err.message }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="dash-chat">
      {/* No header of its own: the page that hosts this already titles it, and
          two stacked headings saying the same thing is just lost space. */}

      <div className="chat-msgs no-scrollbar" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="chat-greeting">
            <div className="chat-greeting-glyph">💬</div>
            <p className="bn">জিজ্ঞাসা করুন — নিচের যেকোনো প্রশ্নে ট্যাপ করুন বা লিখুন।</p>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div className="chat-msg user" key={i}>
              <div className="chat-bubble">{m.text}</div>
            </div>
          ) : (
            <div className="chat-msg bot" key={i}>
              <div className="chat-bubble">
                {m.error ? (
                  <span className="chat-err">{m.error}</span>
                ) : (
                  <>
                    {m.bn && <div className="bn">{m.bn}</div>}
                    {m.en && <div className="en">{m.en}</div>}
                    {m.ids?.length > 0 && (
                      <button type="button" className="chat-jump" onClick={() => onHighlight?.(m.ids)}>
                        Show {m.ids.length} on the map →
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ),
        )}

        {busy && (
          <div className="chat-msg bot">
            <div className="chat-bubble typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </div>

      <div className="chat-suggest no-scrollbar">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="chat-chip bn" onClick={() => ask(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>

      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="আপনার প্রশ্ন লিখুন / Ask…"
          disabled={busy}
        />
        <button type="submit" className="chat-send" disabled={busy || !question.trim()} aria-label="Send">
          ➤
        </button>
      </form>
    </aside>
  );
}
