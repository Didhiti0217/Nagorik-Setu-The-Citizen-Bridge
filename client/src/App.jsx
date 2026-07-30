import { NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';

import { LangProvider, useLang } from './i18n/index.jsx';
import { useSession } from './lib/session.js';
import LandingPage from './pages/Landing.jsx';
import SignInPage from './pages/SignIn.jsx';
import ReportPage from './pages/Report.jsx';
import MyComplaintsPage from './pages/MyComplaints.jsx';
import AdminLoginPage from './pages/AdminLogin.jsx';
import InviteAcceptPage from './pages/InviteAccept.jsx';
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

/**
 * The client-side half of authorization — a redirect, not a defence.
 *
 * The server is what actually refuses (every route is guarded there); this only
 * spares people a screen full of failed requests. The two roles land in different
 * places on purpose: a resident who taps "My Complaints" belongs at the phone
 * sign-in, an officer at the console login, and neither should be sent to the
 * other's door.
 *
 * `from` is carried through so signing in resumes where the person was going.
 */
function Require({ role, children }) {
  const { session } = useSession();
  const location = useLocation();

  if (!session) {
    const to = role === 'admin' ? '/admin/login' : '/login';
    return <Navigate to={to} replace state={{ from: location.pathname }} />;
  }
  // Signed in as the wrong role. Sending an admin to the citizen sign-in would
  // ask them to sign out first, which is confusing; send each role home instead.
  if (session.role !== role) {
    return <Navigate to={session.isAdmin ? '/admin' : '/report'} replace />;
  }
  return children;
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
        <Route path="/login" element={<SignInPage />} />
        <Route
          path="/report"
          element={
            <Require role="citizen">
              <ReportPage />
            </Require>
          }
        />
        <Route
          path="/my-complaints"
          element={
            <Require role="citizen">
              <MyComplaintsPage />
            </Require>
          }
        />

        {/* Corporation console. */}
        <Route path="/admin/login" element={<AdminLoginPage />} />
        {/* Public by necessity — whoever follows an invitation has no account yet. */}
        <Route path="/admin/invite/:token" element={<InviteAcceptPage />} />
        <Route
          path="/admin"
          element={
            <Require role="admin">
              <DashboardPage />
            </Require>
          }
        />
        {/* The console used to live here; keep the old link working. */}
        <Route path="/dashboard" element={<Navigate to="/admin" replace />} />

        {/* Deliberately public, like the API behind it: a judge who never signs in
            can still watch real Gemma calls (server/src/routes/transparency.js). */}
        <Route element={<AppLayout />}>
          <Route path="/transparency" element={<TransparencyPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </LangProvider>
  );
}
