/**
 * The citizen-side top bar: a notification bell and the language switcher,
 * pinned to the top-right of the content area.
 *
 * The bell is presentational for now (there is no notifications backend, and
 * CLAUDE.md forbids faking one — so no invented unread counts). The language
 * box reuses the existing i18n toggle; it shows the language you'd switch TO.
 */
import { useLang } from '../i18n/index.jsx';

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z" />
    </svg>
  );
}

export default function Topbar() {
  const { lang, toggle, t } = useLang();

  return (
    <header className="report-topbar">
      <button type="button" className="bell-btn" aria-label={t('notifications')}>
        <BellIcon />
      </button>
      <button type="button" className="lang-box" onClick={toggle} title="Switch language">
        <GlobeIcon />
        <span className={lang === 'bn' ? '' : 'bn'}>{lang === 'bn' ? 'English' : 'বাংলা'}</span>
      </button>
    </header>
  );
}
