/**
 * Resident sign-in — a mobile number and a one-time code, in two steps.
 *
 * No password anywhere, by design (server/src/services/auth.js says why from the
 * other side): asking someone reporting a live power line to invent and remember
 * a password is how you lose the report. A first successful code also creates the
 * account, so signing up and signing in are the same act and there is no
 * registration screen to build.
 *
 * The demo code is shown on screen only when the SERVER says so — AUTH_DEMO_MODE
 * with no SMS gateway attached, which is what lets a judge with no Bangladeshi SIM
 * sign in (CLAUDE.md §0). It is the real code from the real challenge, not a
 * stand-in, and if the server stops sending it this panel simply disappears.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { requestOtp, verifyOtp } from '../lib/api.js';
import { useSession } from '../lib/session.js';
import { useLang } from '../i18n/index.jsx';
import logo from '../images/logo.png';

export default function SignInPage() {
  const { t, lang, toggle } = useLang();
  const { signIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const bn = lang === 'bn';

  const [step, setStep] = useState('phone'); // phone | code
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState(null); // { masked, demoCode? }
  // A deadline, not a countdown. Decrementing a counter on an interval drifts —
  // and under StrictMode's double-mounted effects it runs twice a second, so the
  // resend button unlocks at half the wait the server actually enforces.
  const [resendAt, setResendAt] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const codeRef = useRef(null);

  // Where the guard bounced us from, so a resident who tapped "My Complaints"
  // lands back on it instead of somewhere they did not ask for.
  const next = location.state?.from ?? '/report';

  useEffect(() => {
    if (!resendAt) return undefined;
    const tick = () => setCooldown(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [resendAt]);

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
  }, [step]);

  async function send(e) {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await requestOtp(phone);
      setChallenge(res);
      setResendAt(Date.now() + (res.resendInSec ?? 60) * 1000);
      setCode('');
      setStep('code');
    } catch (err) {
      setError(err.message);
      // A 429 is a wait, not a mistake — start the clock so the button explains
      // itself instead of failing again on the next tap.
      if (err.status === 429 && err.retryAfterSec) {
        setResendAt(Date.now() + err.retryAfterSec * 1000);
        setStep(challenge ? 'code' : 'phone');
      }
    } finally {
      setBusy(false);
    }
  }

  async function verify(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const session = await verifyOtp(phone, code);
      signIn(session);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message);
      setCode('');
      // The server burns the challenge after five wrong tries; a new code is the
      // only way forward, so put them back where they can ask for one.
      if (err.status === 429) setStep('phone');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="adminlogin">
      <button type="button" className="adminlogin-lang" onClick={toggle}>
        {bn ? 'English' : 'বাংলা'}
      </button>

      <form className="adminlogin-card" onSubmit={step === 'phone' ? send : verify}>
        <img className="adminlogin-logo" src={logo} alt="নাগরিক সেতু — Nagorik Setu" draggable="false" />

        <h1 className={bn ? 'bn' : ''}>{t('citizenSignIn')}</h1>
        <p className={`adminlogin-sub ${bn ? 'bn' : ''}`}>{t('citizenSignInSub')}</p>

        {error && <div className={`error-box auth-error ${bn ? 'bn' : ''}`}>{error}</div>}

        {step === 'phone' ? (
          <>
            <label className={`auth-field ${bn ? 'bn' : ''}`}>
              <span>{t('phoneLabel')}</span>
              <input
                className="auth-input"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="01XXXXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={busy}
                autoFocus
              />
            </label>
            <p className={`adminlogin-hint ${bn ? 'bn' : ''}`}>{t('phoneHint')}</p>

            <button className="adminlogin-submit" type="submit" disabled={busy || phone.trim().length < 6}>
              {busy ? t('sending') : t('sendCode')}
            </button>
          </>
        ) : (
          <>
            <p className={`auth-sent ${bn ? 'bn' : ''}`}>
              {t('codeSentTo')} <b dir="ltr">{challenge?.masked}</b>
            </p>

            {challenge?.demoCode && (
              <div className="auth-demo">
                <span className={bn ? 'bn' : ''}>{t('demoCodeLabel')}</span>
                <b dir="ltr">{challenge.demoCode}</b>
                <small className={bn ? 'bn' : ''}>{t('demoCodeHint')}</small>
              </div>
            )}

            <label className={`auth-field ${bn ? 'bn' : ''}`}>
              <span>{t('codeLabel')}</span>
              <input
                ref={codeRef}
                className="auth-input auth-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="••••••"
                value={code}
                // Strip anything that is not a digit so a pasted "code: 123456"
                // still works instead of failing validation for invisible reasons.
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                disabled={busy}
              />
            </label>

            <button className="adminlogin-submit" type="submit" disabled={busy || code.length !== 6}>
              {busy ? t('verifying') : t('verifyCode')}
            </button>

            <button
              type="button"
              className="adminlogin-back"
              onClick={send}
              disabled={busy || cooldown > 0}
            >
              {cooldown > 0 ? `${cooldown} ${t('resendIn')}` : t('resendCode')}
            </button>

            <button
              type="button"
              className="adminlogin-back"
              onClick={() => {
                setStep('phone');
                setError(null);
              }}
            >
              {t('changeNumber')}
            </button>
          </>
        )}

        <p className={`adminlogin-demo ${bn ? 'bn' : ''}`}>{t('whySignIn')}</p>

        <Link className="adminlogin-back" to="/">
          {t('backToCitizen')}
        </Link>
      </form>
    </div>
  );
}
