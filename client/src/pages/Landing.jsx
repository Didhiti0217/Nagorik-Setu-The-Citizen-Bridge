/**
 * The front door — now a fork, because the app has two audiences.
 *
 * A resident walking past a problem still gets a single unmissable target: the
 * citizen panel fills most of the screen and drops straight into reporting. The
 * admin door is deliberately smaller and quieter — far fewer people need it, and
 * a resident must never feel they have to pick correctly to report a broken thing.
 *
 * The logo asset is white-on-transparent (and carries the Bangla wordmark), so it
 * sits directly on the brand crimson field with no processing.
 */
import { useNavigate } from 'react-router-dom';

import { useLang } from '../i18n/index.jsx';
import logo from '../images/logo.png';

export default function LandingPage() {
  const navigate = useNavigate();
  const { t, lang, toggle } = useLang();
  const bn = lang === 'bn';

  const key = (fn) => (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  };

  const toReport = () => navigate('/report');
  const toAdmin = () => navigate('/admin/login');

  return (
    <div className="landing">
      {/* The language switch belongs on the very first screen: a resident who
          reads only Bangla must not have to walk through an English door to
          find it. Shows the language you would switch TO, as everywhere else. */}
      <button type="button" className="landing-lang" onClick={toggle} title="Switch language">
        {bn ? 'English' : 'বাংলা'}
      </button>

      <img
        className="landing-art"
        src={logo}
        alt="নাগরিক সেতু — Nagorik Setu"
        draggable="false"
      />

      <p className={`landing-tagline ${bn ? 'bn' : ''}`}>{t('landingTagline')}</p>

      <div className="landing-doors">
        <div
          className="door door-citizen"
          role="button"
          tabIndex={0}
          onClick={toReport}
          onKeyDown={key(toReport)}
        >
          <span className="door-glyph" aria-hidden="true">📣</span>
          <b className={bn ? 'bn' : ''}>{t('citizenDoor')}</b>
          <small className={bn ? 'bn' : ''}>{t('citizenDoorHint')}</small>
        </div>

        <div
          className="door door-admin"
          role="button"
          tabIndex={0}
          onClick={toAdmin}
          onKeyDown={key(toAdmin)}
        >
          <span className="door-glyph" aria-hidden="true">🏛️</span>
          <b className={bn ? 'bn' : ''}>{t('adminDoor')}</b>
          <small className={bn ? 'bn' : ''}>{t('adminDoorHint')}</small>
        </div>
      </div>
    </div>
  );
}
