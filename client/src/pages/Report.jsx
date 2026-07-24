/**
 * The citizen app. One screen, Bangla by default.
 *
 * Deliberately has no category dropdown, no severity picker, no department
 * selector — a resident should not have to know how a city corporation is
 * organised in order to report a broken thing. Gemma 4 infers all of it from
 * free text and a photo. That absence IS the product.
 *
 * After submitting we show what Gemma understood. That is a trust feature: the
 * citizen can see their words were read correctly, and it demos beautifully.
 */
import { useEffect, useRef, useState } from 'react';

import { useLang } from '../i18n/index.jsx';
import { getReport, postReport } from '../lib/api.js';

// Fallback centre when geolocation is denied — Gazipur City Corporation.
const FALLBACK = [90.4125, 23.9999];

const SEVERITY_WORD = {
  bn: { 1: 'সামান্য', 2: 'কম', 3: 'মাঝারি', 4: 'বেশি', 5: 'অত্যন্ত জরুরি' },
  en: { 1: 'Minor', 2: 'Low', 3: 'Moderate', 4: 'High', 5: 'Critical' },
};

export default function ReportPage() {
  const { t, lang, category } = useLang();

  const [text, setText] = useState('');
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState(null);
  const [coords, setCoords] = useState(null);
  const [geoState, setGeoState] = useState('locating'); // locating | ok | denied
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [reportId, setReportId] = useState(null);
  const [result, setResult] = useState(null);

  const fileRef = useRef(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoState('denied');
      setCoords(FALLBACK);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords([pos.coords.longitude, pos.coords.latitude]);
        setGeoState('ok');
      },
      () => {
        // Denied or unavailable: fall back rather than block the report. A
        // slightly wrong pin is far better than a citizen who cannot report.
        setCoords(FALLBACK);
        setGeoState('denied');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  }, []);

  // Revoke the object URL when the preview changes, or we leak on every retake.
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  function onPickPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!text.trim() && !photo) {
      setError(t('needSomething'));
      return;
    }
    setSubmitting(true);
    try {
      const [lng, lat] = coords ?? FALLBACK;
      const res = await postReport({ text, lng, lat, photo });
      setReportId(res.id);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  /* Poll for the triage outcome. The API answers 202 in ~100ms and Gemma
     finishes 15-25s later, so polling is the simplest correct approach here —
     the citizen only cares about their own report, not the whole stream. */
  useEffect(() => {
    if (!reportId || result) return undefined;
    let alive = true;
    const timer = setInterval(async () => {
      try {
        const doc = await getReport(reportId);
        if (alive && doc.gemmaOutput) {
          setResult(doc);
          clearInterval(timer);
        }
      } catch {
        /* keep polling; a transient failure is not fatal */
      }
    }, 2500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [reportId, result]);

  function reset() {
    setText('');
    setPhoto(null);
    setPreview(null);
    setReportId(null);
    setResult(null);
    setSubmitting(false);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  /* ------------------------------------------------ confirmation view */
  if (reportId) {
    const g = result?.gemmaOutput;
    return (
      <div className="citizen confirm">
        <div className="tick">✓</div>
        <h1 className={lang === 'bn' ? 'bn' : ''}>{t('thanks')}</h1>

        {!g ? (
          <>
            <div className="spinner" style={{ marginTop: 24 }} />
            <p className={lang === 'bn' ? 'bn' : ''} style={{ margin: '0 0 4px' }}>
              {t('analysing')}
            </p>
            <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 0 }}>
              {t('analysingHint')}
            </p>
          </>
        ) : (
          <div className="understood">
            <h3>{t('understood')}</h3>
            <p className="bn" style={{ margin: '0 0 12px', fontSize: 15, lineHeight: 1.6 }}>
              {g.summary_bn}
            </p>
            <div className="kv">
              <span>{t('category')}</span>
              <span>{category(g.category)}</span>
            </div>
            <div className="kv">
              <span>{t('severity')}</span>
              <span>
                <span className={`sev sev-${g.severity}`}>{g.severity}</span>{' '}
                {SEVERITY_WORD[lang][g.severity]}
              </span>
            </div>
            <div className="kv">
              <span>{t('department')}</span>
              <span>{g.department}</span>
            </div>
            {g.inferred_location && (
              <div className="kv">
                <span>{t('location')}</span>
                <span>{g.inferred_location}</span>
              </div>
            )}
          </div>
        )}

        <button className="btn" onClick={reset} style={{ marginTop: 8 }}>
          {t('newReport')}
        </button>
      </div>
    );
  }

  /* ------------------------------------------------------- form view */
  return (
    <div className="citizen">
      <h1 className="bn">{t('appName')}</h1>
      <p className={`tagline ${lang === 'bn' ? 'bn' : ''}`}>{t('tagline')}</p>

      <div className="status-line">
        <span className={`dot ${geoState === 'ok' ? 'ok' : geoState === 'denied' ? 'bad' : ''}`} />
        <span className={lang === 'bn' ? 'bn' : ''}>
          {geoState === 'locating' && t('locating')}
          {geoState === 'ok' && t('locationReady')}
          {geoState === 'denied' && t('locationDenied')}
        </span>
      </div>

      {error && <div className={`error-box ${lang === 'bn' ? 'bn' : ''}`}>{error}</div>}

      <form onSubmit={onSubmit}>
        <div className="field">
          <label className={lang === 'bn' ? 'bn' : ''}>{t('describe')}</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('placeholder')}
            disabled={submitting}
          />
        </div>

        <div className="field">
          <label className={lang === 'bn' ? 'bn' : ''}>{t('addPhoto')}</label>
          <div className="photo-drop" onClick={() => fileRef.current?.click()}>
            {preview ? <img src={preview} alt="" /> : <span>📷 {t('addPhoto')}</span>}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPickPhoto}
            style={{ display: 'none' }}
          />
        </div>

        <button className="btn" type="submit" disabled={submitting} style={{ width: '100%' }}>
          {submitting ? t('submitting') : t('submit')}
        </button>
      </form>
    </div>
  );
}
