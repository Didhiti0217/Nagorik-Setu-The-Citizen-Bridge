import { NavLink, Navigate, Route, Routes } from 'react-router-dom';

import { LangProvider, useLang } from './i18n/index.jsx';
import ReportPage from './pages/Report.jsx';
import DashboardPage from './pages/Dashboard.jsx';
import TransparencyPage from './pages/Transparency.jsx';

function Nav() {
  const { t, lang, toggle } = useLang();
  return (
    <nav className="nav">
      <div className="brand">
        <span className="bn">নাগরিক সেতু</span>
        <small>Nagorik Setu</small>
      </div>
      <NavLink to="/report">{t('report')}</NavLink>
      <NavLink to="/dashboard">{t('dashboard')}</NavLink>
      <NavLink to="/transparency">{t('transparency')}</NavLink>
      <div className="spacer" />
      <button className="btn ghost" onClick={toggle} title="Switch language">
        {lang === 'bn' ? 'English' : 'বাংলা'}
      </button>
    </nav>
  );
}

export default function App() {
  return (
    // The citizen app is the front door and defaults to Bangla; the dashboard
    // flips itself to English on mount (see Dashboard.jsx).
    <LangProvider initial="bn">
      <Nav />
      <Routes>
        <Route path="/" element={<Navigate to="/report" replace />} />
        <Route path="/report" element={<ReportPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/transparency" element={<TransparencyPage />} />
        <Route path="*" element={<Navigate to="/report" replace />} />
      </Routes>
    </LangProvider>
  );
}
