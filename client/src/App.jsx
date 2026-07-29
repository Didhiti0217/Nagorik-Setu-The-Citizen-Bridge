import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom';

import { LangProvider, useLang } from './i18n/index.jsx';
import LandingPage from './pages/Landing.jsx';
import ReportPage from './pages/Report.jsx';
import MyComplaintsPage from './pages/MyComplaints.jsx';
import AdminLoginPage from './pages/AdminLogin.jsx';
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
      <NavLink to="/admin">{t('dashboard')}</NavLink>
      <NavLink to="/transparency">{t('transparency')}</NavLink>
      <div className="spacer" />
      <button className="btn ghost" onClick={toggle} title="Switch language">
        {lang === 'bn' ? 'English' : 'বাংলা'}
      </button>
    </nav>
  );
}

// Every screen except the landing splash shares the top nav.
function AppLayout() {
  return (
    <>
      <Nav />
      <Outlet />
    </>
  );
}

export default function App() {
  return (
    // The citizen app is the front door and defaults to Bangla; the dashboard
    // flips itself to English on mount (see Dashboard.jsx).
    <LangProvider initial="bn">
      <Routes>
        {/* Full-bleed splash that forks: citizen → /report, admin → /admin/login. */}
        <Route path="/" element={<LandingPage />} />

        {/* Citizen app. These pages carry their own sidebar (see Sidebar.jsx),
            so they sit outside the top-nav layout. */}
        <Route path="/report" element={<ReportPage />} />
        <Route path="/my-complaints" element={<MyComplaintsPage />} />

        {/* Corporation console. /admin redirects to the picker when no
            corporation is selected (see Dashboard.jsx). */}
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<DashboardPage />} />
        {/* The console used to live here; keep the old link working. */}
        <Route path="/dashboard" element={<Navigate to="/admin" replace />} />

        <Route element={<AppLayout />}>
          <Route path="/transparency" element={<TransparencyPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </LangProvider>
  );
}
