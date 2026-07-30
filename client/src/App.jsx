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
import CopilotPage from './pages/Copilot.jsx';
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

// Where each role belongs when it is somewhere it has no business being. Shared by
// both guards below so "home" cannot drift between them.
const homeFor = (session) => (session.isAdmin ? '/admin' : '/report');

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
  if (session.role !== role) return <Navigate to={homeFor(session)} replace />;

  return children;
}

/**
 * The mirror of Require: a page whose only purpose is to get you in, which someone
 * already signed in should never see — by typing the URL, and above all by pressing
 * Back onto it.
 *
 * `replace` is the load-bearing part. Signing in leaves a history stack of
 * [/, /report], so Back re-enters `/`; replacing that entry with the home route
 * means the stack becomes [/report, /report] and a second Back press stays put
 * instead of ping-ponging. Without `replace` the splash would come back every time.
 *
 * Every role is bounced from every entry page, so switching between the resident app
 * and the console means signing out first — one click in the sidebar, which lands on
 * a login page whose "back to the citizen app" link shows the splash again.
 */
function RedirectIfSignedIn({ children }) {
  const { session } = useSession();
  if (session) return <Navigate to={homeFor(session)} replace />;
  return children;
}

export default function App() {
  return (
    // The citizen app is the front door and defaults to Bangla; the dashboard
    // flips itself to English on mount (see Dashboard.jsx).
    <LangProvider initial="bn">
      <Routes>
        {/* Full-bleed splash that forks: citizen → /report, admin → /admin/login.
            The doors deliberately PUSH, so an anonymous visitor on a login screen can
            still press Back to the splash — the one Back that should succeed. */}
        <Route
          path="/"
          element={
            <RedirectIfSignedIn>
              <LandingPage />
            </RedirectIfSignedIn>
          }
        />

        {/* Citizen app. These pages carry their own sidebar (see Sidebar.jsx),
            so they sit outside the top-nav layout. */}
        <Route
          path="/login"
          element={
            <RedirectIfSignedIn>
              <SignInPage />
            </RedirectIfSignedIn>
          }
        />
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
        <Route
          path="/admin/login"
          element={
            <RedirectIfSignedIn>
              <AdminLoginPage />
            </RedirectIfSignedIn>
          }
        />
        {/* Public by necessity — whoever follows an invitation has no account yet, and
            NOT wrapped above: the point of this page is provisioning an account for
            someone who may well be signed in as somebody else. Accepting navigates
            with replace, so a consumed token is not left behind in history. */}
        <Route path="/admin/invite/:token" element={<InviteAcceptPage />} />
        <Route
          path="/admin"
          element={
            <Require role="admin">
              <DashboardPage />
            </Require>
          }
        />
        <Route
          path="/copilot"
          element={
            <Require role="admin">
              <CopilotPage />
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
