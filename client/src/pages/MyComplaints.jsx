/**
 * My Complaints — placeholder.
 *
 * Reachable from the sidebar. There is no per-citizen auth in this prototype, so
 * a real "my reports" list would need session identity we deliberately do not
 * build (CLAUDE.md §4: auth is a demo stub). Kept as a coherent, on-brand empty
 * state rather than a dead link.
 */
import Sidebar from '../components/Sidebar.jsx';
import Topbar from '../components/Topbar.jsx';
import MobileTopbar from '../components/MobileTopbar.jsx';
import MobileNav from '../components/MobileNav.jsx';
import { useLang } from '../i18n/index.jsx';

export default function MyComplaintsPage() {
  const { t, lang } = useLang();
  const bn = lang === 'bn';

  return (
    <div className="report-shell">
      <Sidebar />
      <div className="report-main">
        <MobileTopbar />
        <Topbar />
        <div className="report-content">
          <div className="placeholder">
            <div className="placeholder-glyph">📋</div>
            <h1 className={bn ? 'bn' : ''}>{t('myComplaints')}</h1>
            <p className={`tagline ${bn ? 'bn' : ''}`}>{t('comingSoon')}</p>
            <p className={`placeholder-hint ${bn ? 'bn' : ''}`}>{t('comingSoonHint')}</p>
          </div>
        </div>
      </div>
      <MobileNav />
    </div>
  );
}
