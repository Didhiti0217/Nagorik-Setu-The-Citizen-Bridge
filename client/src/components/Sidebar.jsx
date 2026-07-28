/**
 * The citizen-side sidebar.
 *
 * Crimson left rail with the brand mark up top and the primary navigation below.
 * The logo asset (images/logo.png) is white-on-transparent and carries the
 * "নাগরিক সেতু" wordmark, so it drops straight onto the crimson panel as-is.
 *
 * NavLink adds an `active` class automatically, which is what the white pill
 * highlight keys off; no manual "which page am I on" bookkeeping needed.
 */
import { NavLink } from 'react-router-dom';

import { useLang } from '../i18n/index.jsx';
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

const ITEMS = [
  { to: '/report', key: 'report', Icon: ReportIcon },
  { to: '/dashboard', key: 'dashboard', Icon: DashboardIcon },
  { to: '/my-complaints', key: 'myComplaints', Icon: ComplaintsIcon },
  { to: '/transparency', key: 'transparency', Icon: TransparencyIcon },
];

export default function Sidebar() {
  const { t } = useLang();

  return (
    <aside className="sidebar">
      <NavLink to="/report" className="sidebar-brand" aria-label="নাগরিক সেতু — Nagorik Setu">
        <img className="sidebar-logo" src={logo} alt="নাগরিক সেতু — Nagorik Setu" draggable="false" />
      </NavLink>

      <nav className="sidebar-nav">
        {ITEMS.map(({ to, key, Icon }) => (
          <NavLink key={key} to={to} className="sidebar-link">
            <span className="ico">
              <Icon />
            </span>
            <span className="lbl">{t(key)}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
