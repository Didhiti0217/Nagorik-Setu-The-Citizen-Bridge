/**
 * Admin sign-in — email and password against a provisioned account.
 *
 * This page used to be a radio list of city corporations with no password at all.
 * The list is gone on purpose: an officer choosing which city's workload to open
 * is not a view preference, it is an authorization decision, and it now lives on
 * the account (server/src/models/AdminUser.js). Whichever jurisdiction the token
 * carries is the one the console shows.
 *
 * Accounts are seeded (server/scripts/seed-admins.js) or created by accepting an
 * invitation. There is no self-registration, so there is no "sign up" link to
 * offer — the page says where an account comes from instead of dead-ending.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { adminLogin } from '../lib/api.js';
import { useSession } from '../lib/session.js';
import { useLang } from '../i18n/index.jsx';
import logo from '../images/logo.png';

export default function AdminLoginPage() {
  const { t, lang, toggle } = useLang();
  const { signIn } = useSession();
  const navigate = useNavigate();
  const bn = lang === 'bn';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      signIn(await adminLogin(email, password));
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err.message);
      setPassword('');
      setBusy(false);
    }
  }

  return (
    <div className="adminlogin">
      <button type="button" className="adminlogin-lang" onClick={toggle}>
        {bn ? 'English' : 'বাংলা'}
      </button>

      <form className="adminlogin-card" onSubmit={submit}>
        <img className="adminlogin-logo" src={logo} alt="নাগরিক সেতু — Nagorik Setu" draggable="false" />

        <h1 className={bn ? 'bn' : ''}>{t('adminSignIn')}</h1>
        <p className={`adminlogin-sub ${bn ? 'bn' : ''}`}>{t('adminSignInSub')}</p>

        {error && <div className={`error-box auth-error ${bn ? 'bn' : ''}`}>{error}</div>}

        <label className={`auth-field ${bn ? 'bn' : ''}`}>
          <span>{t('emailLabel')}</span>
          <input
            className="auth-input"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            autoFocus
            dir="ltr"
          />
        </label>

        <label className={`auth-field ${bn ? 'bn' : ''}`}>
          <span>{t('passwordLabel')}</span>
          <input
            className="auth-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            dir="ltr"
          />
        </label>

        <p className={`adminlogin-hint ${bn ? 'bn' : ''}`}>{t('jurisdictionFromAccount')}</p>

        <button className="adminlogin-submit" type="submit" disabled={busy || !email.trim() || !password}>
          {busy ? t('verifying') : t('enterConsole')}
        </button>

        <p className={`adminlogin-demo ${bn ? 'bn' : ''}`}>{t('noAdminAccount')}</p>

        <Link className="adminlogin-back" to="/">
          {t('backToCitizen')}
        </Link>
      </form>
    </div>
  );
}
