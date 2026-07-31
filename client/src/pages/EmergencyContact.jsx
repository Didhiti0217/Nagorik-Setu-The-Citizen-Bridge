/**
 * Emergency Contact — one place to find a number worth calling right now.
 *
 * Two tiers, deliberately not mixed together:
 *   - the National Emergency Service (999) — real, verified, and the number
 *     that actually matters in a life-threatening situation.
 *   - a per-corporation "helpline" — a DEMO number (lib/corporations.js), not
 *     a published municipal hotline. Shown because the prototype should look
 *     complete, but never presented as if it were real: this project ships
 *     fabricated data everywhere else with the same honesty (README, seed
 *     corpus), and a fake number is worse to get wrong here than anywhere
 *     else in the app — someone could actually dial it expecting help.
 *
 * Reachable from three places: an anonymous visitor (Landing's quiet link,
 * no session at all), a signed-in citizen, or a signed-in admin. Sidebar and
 * MobileNav both key off a `variant` prop, not the URL, so this page has to
 * pick the right one itself from the real session — hardcoding 'citizen'
 * would swap an admin's rail out from under them (wrong sign-out route, no
 * way back to the console) the moment they clicked this link from their own
 * sidebar.
 */
import Sidebar from '../components/Sidebar.jsx';
import Topbar from '../components/Topbar.jsx';
import MobileTopbar from '../components/MobileTopbar.jsx';
import MobileNav from '../components/MobileNav.jsx';
import { CORPORATIONS, corpName } from '../lib/corporations.js';
import { useLang } from '../i18n/index.jsx';
import { useSession } from '../lib/session.js';

const NATIONAL_EMERGENCY = '999';

/** 01712345001 -> 01712-345001, so it reads the way a Bangladeshi number normally does. */
const formatBd = (n) => `${n.slice(0, 5)}-${n.slice(5)}`;

export default function EmergencyContactPage() {
  const { t, lang } = useLang();
  const { isAdmin } = useSession();
  const bn = lang === 'bn';
  const variant = isAdmin ? 'admin' : 'citizen';

  return (
    <div className="report-shell">
      <Sidebar variant={variant} />
      <div className="report-main">
        <MobileTopbar />
        <Topbar />
        <div className="report-content">
          <div className="report-head">
            <h1 className={bn ? 'bn' : ''}>{t('emergencyHeading')}</h1>
            <p className={`tagline ${bn ? 'bn' : ''}`}>{t('emergencySub')}</p>
          </div>

          <a className="ec-national" href={`tel:${NATIONAL_EMERGENCY}`}>
            <span className="ec-national-number">{NATIONAL_EMERGENCY}</span>
            <span className="ec-national-text">
              <b className={bn ? 'bn' : ''}>{t('nationalEmergency')}</b>
              <small className={bn ? 'bn' : ''}>{t('nationalEmergencyHint')}</small>
            </span>
            <span className="ec-call-glyph" aria-hidden="true">📞</span>
          </a>

          <h3 className={`ec-section-head ${bn ? 'bn' : ''}`}>{t('corporationHelplines')}</h3>
          <div className="ec-corp-list">
            {CORPORATIONS.map((corp) => (
              <div className="ec-corp-row" key={corp.id}>
                <span className="ec-corp-abbr">{corp.abbr}</span>
                <span className="ec-corp-name">
                  <b className={bn ? 'bn' : ''}>{corpName(corp, lang)}</b>
                  <small dir="ltr">{formatBd(corp.emergencyPhone)}</small>
                </span>
                <a className="ec-corp-call" href={`tel:${corp.emergencyPhone}`}>
                  {t('callNow')}
                </a>
              </div>
            ))}
          </div>

          <p className={`ec-demo-notice ${bn ? 'bn' : ''}`}>{t('demoNumberNotice')}</p>
        </div>
      </div>
      <MobileNav variant={variant} />
    </div>
  );
}
