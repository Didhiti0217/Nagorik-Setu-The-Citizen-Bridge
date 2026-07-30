/**
 * The Councilor's Copilot, on its own page.
 *
 * It used to occupy the console's right column permanently, which spent the best
 * real estate on a panel used occasionally and pushed the map — the thing the
 * console exists to show — behind a toggle. Here it gets the full width instead,
 * which also gives the conversation room to be readable.
 *
 * The link back is deliberate rather than automatic: an answer names the issues
 * worth looking at, and "Show N on the map" carries those ids to the work queue
 * through router state (Dashboard reads location.state.highlight). Navigating on
 * its own the moment an answer arrived would throw away the answer you asked for.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import Sidebar from '../components/Sidebar.jsx';
import Topbar from '../components/Topbar.jsx';
import MobileTopbar from '../components/MobileTopbar.jsx';
import MobileNav from '../components/MobileNav.jsx';
import CopilotChat from '../components/CopilotChat.jsx';
import { useLang } from '../i18n/index.jsx';
import { useSession } from '../lib/session.js';
import { corpName } from '../lib/corporations.js';

export default function CopilotPage() {
  const { setLang, t, lang } = useLang();
  const { corporation } = useSession();
  const navigate = useNavigate();

  // Municipal officers work in English, like the rest of the console.
  useEffect(() => {
    setLang('en');
  }, [setLang]);

  return (
    <div className="dash2 copilot-shell">
      <Sidebar variant="admin" />

      <main className="dash2-main">
        <MobileTopbar />
        <Topbar />

        <div className="dash2-head">
          <div className="dash2-titles">
            <h2>
              ✨ {t('copilot')}
              {corporation ? ` — ${corpName(corporation, lang)}` : ''}
            </h2>
            <p>Ask about the work queue in Bangla or English — Gemma 4 picks the query.</p>
          </div>
        </div>

        <CopilotChat onHighlight={(ids) => navigate('/admin', { state: { highlight: ids } })} />
      </main>

      <MobileNav variant="admin" />
    </div>
  );
}
