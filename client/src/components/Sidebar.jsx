/**
 * The left rail, in two variants.
 *
 * `citizen` (default) is the resident's app: report, my complaints, transparency.
 * `admin` is the corporation console: work queue, transparency, and the signed-in
 * jurisdiction with a way out.
 *
 * The variants exist mainly to keep the console off the citizen rail. A resident
 * has no business in a municipal work queue, and a nav link that leads somewhere
 * they cannot use is a nav link that makes the app feel broken.
 *
 * NavLink adds an `active` class automatically, which is what the white pill
 * highlight keys off; no manual "which page am I on" bookkeeping needed.
 */
import { NavLink, useNavigate } from 'react-router-dom';

import { useLang } from '../i18n/index.jsx';
import { useSession } from '../lib/session.js';
import { corpShort } from '../lib/corporations.js';
import logo from '../images/logo.png';

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

function ReportIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  );
}
function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
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
function TransparencyIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

const NAV = {
  citizen: [
    { to: '/report', key: 'report', Icon: ReportIcon },
    { to: '/my-complaints', key: 'myComplaints', Icon: ComplaintsIcon },
    { to: '/transparency', key: 'transparency', Icon: TransparencyIcon },
  ],
  admin: [
    { to: '/admin', key: 'dashboard', Icon: DashboardIcon },
    { to: '/transparency', key: 'transparency', Icon: TransparencyIcon },
  ],
};

export default function Sidebar({ variant = 'citizen' }) {
  const { t, lang } = useLang();
  const { user, corporation, signOut } = useSession();
  const navigate = useNavigate();
  const isAdmin = variant === 'admin';

  // Sign-out is awaited so the redirect happens after the session is cleared —
  // navigating first would race the guard and could bounce back into the app.
  const leave = async (to) => {
    await signOut();
    navigate(to);
  };

  return (
    <aside className="sidebar">
      <NavLink
        to={isAdmin ? '/admin' : '/report'}
        className="sidebar-brand"
        aria-label="নাগরিক সেতু — Nagorik Setu"
      >
        <img className="sidebar-logo" src={logo} alt="নাগরিক সেতু — Nagorik Setu" draggable="false" />
      </NavLink>

      <nav className="sidebar-nav">
        {NAV[variant].map(({ to, key, Icon }) => (
          // `end` keeps /admin from staying highlighted on nested admin routes.
          <NavLink key={key} to={to} end className="sidebar-link">
            <span className="ico">
              <Icon />
            </span>
            <span className="lbl">{t(key)}</span>
          </NavLink>
        ))}
      </nav>

      {isAdmin && corporation && (
        <div className="sidebar-foot">
          <span className="sidebar-corp">
            <b>{corporation.abbr}</b>
            <small>{corpShort(corporation, lang)}</small>
          </span>
          <button type="button" className="sidebar-signout" onClick={() => leave('/admin/login')}>
            {t('signOut')}
          </button>
        </div>
      )}

      {/* The resident sees which number they are signed in with — masked, because
          a shared phone left on this screen should not display it in full. */}
      {!isAdmin && user && (
        <div className="sidebar-foot">
          <span className="sidebar-corp">
            <b dir="ltr">{user.masked || user.name || '•••'}</b>
          </span>
          <button type="button" className="sidebar-signout" onClick={() => leave('/login')}>
            {t('signOut')}
          </button>
        </div>
      )}
    </aside>
  );
}
