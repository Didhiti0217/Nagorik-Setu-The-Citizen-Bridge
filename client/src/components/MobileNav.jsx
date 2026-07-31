/**
 * Phone-only bottom tab bar (replaces the left rail on small screens).
 *
 * Mirrors Sidebar's two variants so the citizen app and the corporation console
 * stay separated on phones too.
 *  - Routes use NavLink (which adds `.active`).
 *  - Notification opens a small self-contained sheet — there is no notifications
 *    backend and CLAUDE.md forbids faking one, so it shows an honest empty state.
 *  - Copilot (admin only) is a page of its own now, so it is a plain link.
 *  - Emergency Contact is the 4th slot in BOTH variants — a number worth
 *    calling belongs to citizen and officer alike, not just one side.
 */
import { useState } from 'react';
import { NavLink } from 'react-router-dom';

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
function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 9.5 9.5 0 0 1-4-.9L3 20l1.9-5.5a8.38 8.38 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
    </svg>
  );
}

function ReportIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  );
}
function ComplaintsIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4h6v2H9z" />
      <path d="M9 11h6M9 15h4" />
    </svg>
  );
}
function EmergencyIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1z" />
    </svg>
  );
}

export default function MobileNav({ variant = 'citizen' }) {
  const { t } = useLang();
  const [notifOpen, setNotifOpen] = useState(false);
  const isAdmin = variant === 'admin';

  return (
    <>
      <nav className="mobile-nav">
        {isAdmin ? (
          <NavLink to="/admin" end className="mnav-item">
            <DashIcon />
            <span>{t('dashboard')}</span>
          </NavLink>
        ) : (
          <NavLink to="/report" className="mnav-item">
            <ReportIcon />
            <span>{t('report')}</span>
          </NavLink>
        )}
        <button type="button" className="mnav-item" onClick={() => setNotifOpen(true)}>
          <BellIcon />
          <span>{t('notifications')}</span>
        </button>
        {isAdmin ? (
          <NavLink to="/copilot" className="mnav-item">
            <ChatIcon />
            <span>{t('copilot')}</span>
          </NavLink>
        ) : (
          <NavLink to="/my-complaints" className="mnav-item">
            <ComplaintsIcon />
            <span>{t('myComplaints')}</span>
          </NavLink>
        )}
        <NavLink to="/emergency" className="mnav-item">
          <EmergencyIcon />
          <span>{t('emergencyContact')}</span>
        </NavLink>
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
