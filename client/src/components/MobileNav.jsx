/**
 * Phone-only bottom tab bar (replaces the left rail on small screens).
 *
 * Items: Dashboard, Notification, Transparency, Chat.
 *  - Dashboard / Transparency are routes (NavLink adds `.active`).
 *  - Notification opens a small self-contained sheet — there is no notifications
 *    backend and CLAUDE.md forbids faking one, so it shows an honest empty state.
 *  - Chat routes to the dashboard and asks it to open the Copilot overlay via
 *    router state (Dashboard reads location.state.openChat).
 */
import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

import { useLang } from '../i18n/index.jsx';

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

function DashIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 9.5 9.5 0 0 1-4-.9L3 20l1.9-5.5a8.38 8.38 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
    </svg>
  );
}

export default function MobileNav() {
  const { t } = useLang();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);

  return (
    <>
      <nav className="mobile-nav">
        <NavLink to="/dashboard" className="mnav-item">
          <DashIcon />
          <span>{t('dashboard')}</span>
        </NavLink>
        <button type="button" className="mnav-item" onClick={() => setNotifOpen(true)}>
          <BellIcon />
          <span>{t('notifications')}</span>
        </button>
        <NavLink to="/transparency" className="mnav-item">
          <EyeIcon />
          <span>{t('transparency')}</span>
        </NavLink>
        <button
          type="button"
          className="mnav-item"
          onClick={() => navigate('/dashboard', { state: { openChat: Date.now() } })}
        >
          <ChatIcon />
          <span>{t('chat')}</span>
        </button>
      </nav>

      {notifOpen && (
        <div className="mnav-sheet" onClick={() => setNotifOpen(false)}>
          <div className="mnav-sheet-card" onClick={(e) => e.stopPropagation()}>
            <div className="mnav-sheet-glyph">🔔</div>
            <p className="bn">{t('noNotifications')}</p>
            <button type="button" className="report-submit" onClick={() => setNotifOpen(false)}>
              {t('close')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
