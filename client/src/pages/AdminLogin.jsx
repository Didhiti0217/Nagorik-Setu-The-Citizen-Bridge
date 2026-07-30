/**
 * Admin sign-in — pick which city corporation's console you are entering.
 *
 * There is no password (CLAUDE.md §4 keeps auth a demo-grade stub), and the page
 * says so plainly rather than implying a security model it does not have. The
 * only real decision here is jurisdiction, which is what actually changes what
 * the console shows.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { CORPORATIONS, corpName } from '../lib/corporations.js';
import { useAdminSession } from '../lib/session.js';
import { useLang } from '../i18n/index.jsx';
import logo from '../images/logo.png';

export default function AdminLoginPage() {
  const { t, lang, toggle } = useLang();
  const { corporation, signIn } = useAdminSession();
  const [picked, setPicked] = useState(corporation?.id ?? null);
  const navigate = useNavigate();
  const bn = lang === 'bn';

  function submit(e) {
    e.preventDefault();
    if (!picked) return;
    signIn(picked);
    navigate('/admin');
  }

  return (
    <div className="adminlogin">
      <header className="adminlogin-nav">
        <span className="adminlogin-navlogo">
          <img src={logo} alt="নাগরিক সেতু — Nagorik Setu" draggable="false" />
        </span>
        <button type="button" className="adminlogin-navlang" onClick={toggle}>
          {bn ? 'English' : 'বাংলা'}
        </button>
      </header>

      <form className="adminlogin-body" onSubmit={submit}>
        <section className="adminlogin-left">
          <div className="adminlogin-head">
            <h1 className={bn ? 'bn' : ''}>{t('adminSignIn')}</h1>
            <p className={bn ? 'bn' : ''}>{t('selectCorporation')}</p>
          </div>

          <div className="adminlogin-box">
            <div className="corp-grid" role="radiogroup" aria-label={t('selectCorporation')}>
              {CORPORATIONS.map((corp) => (
                <button
                  key={corp.id}
                  type="button"
                  role="radio"
                  aria-checked={picked === corp.id}
                  className={`corp-option${picked === corp.id ? ' picked' : ''}`}
                  onClick={() => setPicked(corp.id)}
                >
                  <span className="corp-abbr">{corp.abbr}</span>
                  <span className="corp-names">
                    <b className={bn ? 'bn' : ''}>{corpName(corp, lang)}</b>
                    <small>{bn ? corp.nameEn : corp.nameBn}</small>
                  </span>
                  <span className="corp-tick" aria-hidden="true">✓</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="adminlogin-right">
          <p className={`adminlogin-hint ${bn ? 'bn' : ''}`}>{t('selectCorporationHint')}</p>
          <button type="submit" className="adminlogin-submit" disabled={!picked}>
            {t('enterConsole')}
          </button>
          <p className={`adminlogin-demo ${bn ? 'bn' : ''}`}>{t('demoNotice')}</p>
          <button type="button" className="adminlogin-back" onClick={() => navigate('/')}>
            {t('backToCitizen')}
          </button>
        </section>
      </form>
    </div>
  );
}
