/**
 * /admin/invite/:token — the recipient's side of an admin invitation.
 *
 * Public by necessity: the person following this link has no account yet, which is
 * the entire point. The token in the URL is the credential, so the page reads it
 * once to show who the invitation is for (GET /api/auth/invites/:token) and posts
 * it back with a chosen password.
 *
 * The corporation is displayed but never editable — it comes from the inviter's
 * own jurisdiction and the server ignores anything the client sends
 * (server/src/services/auth.js:createInvite). Accepting signs you straight in, so
 * there is no "now go and log in" step to lose people at.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { acceptInvite, peekInvite } from '../lib/api.js';
import { useSession } from '../lib/session.js';
import { getCorporation, corpName } from '../lib/corporations.js';
import { useLang } from '../i18n/index.jsx';
import logo from '../images/logo.png';

export default function InviteAcceptPage() {
  const { token } = useParams();
  const { t, lang, toggle } = useLang();
  const { signIn } = useSession();
  const navigate = useNavigate();
  const bn = lang === 'bn';

  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    peekInvite(token)
      .then((res) => {
        if (!alive) return;
        setInvite(res);
        setName(res.name || '');
      })
      .catch((err) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [token]);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      signIn(await acceptInvite({ token, name, password }));
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const corporation = getCorporation(invite?.corporation);

  return (
    <div className="adminlogin">
      <button type="button" className="adminlogin-lang" onClick={toggle}>
        {bn ? 'English' : 'বাংলা'}
      </button>

      <form className="adminlogin-card" onSubmit={submit}>
        <img className="adminlogin-logo" src={logo} alt="নাগরিক সেতু — Nagorik Setu" draggable="false" />

        <h1 className={bn ? 'bn' : ''}>{t('inviteTitle')}</h1>

        {loading && <p className={`adminlogin-sub ${bn ? 'bn' : ''}`}>{t('loading')}</p>}

        {/* An expired, revoked or already-accepted link is a dead end by design,
            so say so and offer the only useful next step. */}
        {!loading && !invite && (
          <>
            <div className={`error-box auth-error ${bn ? 'bn' : ''}`}>{error || t('inviteInvalid')}</div>
            <Link className="adminlogin-back" to="/admin/login">
              {t('adminSignIn')}
            </Link>
          </>
        )}

        {invite && (
          <>
            <p className={`adminlogin-sub ${bn ? 'bn' : ''}`}>
              {t('inviteFor')} <b dir="ltr">{invite.email}</b>
            </p>

            {corporation && (
              <div className="auth-corp">
                <span className="corp-abbr">{corporation.abbr}</span>
                <b className={bn ? 'bn' : ''}>{corpName(corporation, lang)}</b>
              </div>
            )}

            {error && <div className={`error-box auth-error ${bn ? 'bn' : ''}`}>{error}</div>}

            <label className={`auth-field ${bn ? 'bn' : ''}`}>
              <span>{t('yourNameLabel')}</span>
              <input
                className="auth-input"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
                autoFocus
              />
            </label>

            <label className={`auth-field ${bn ? 'bn' : ''}`}>
              <span>{t('newPasswordLabel')}</span>
              <input
                className="auth-input"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                dir="ltr"
              />
            </label>

            <p className={`adminlogin-hint ${bn ? 'bn' : ''}`}>{t('passwordRule')}</p>

            <button className="adminlogin-submit" type="submit" disabled={busy || password.length < 8}>
              {busy ? t('creatingAccount') : t('createAccount')}
            </button>

            <p className={`adminlogin-demo ${bn ? 'bn' : ''}`}>{t('jurisdictionFromAccount')}</p>
          </>
        )}
      </form>
    </div>
  );
}
