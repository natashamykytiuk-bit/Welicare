// Routes. For now the site is only the public pages (Overview, Our Story,
// Contact): its job is showing what Welicare does and collecting pilot
// interest. The sign-in portal (login, password reset, the admin approvals
// screens and the role homes) is switched off below, not deleted: uncomment
// those imports and routes, and the <AuthProvider> wrapper, to bring it back.
// While it's off, any portal URL (/login, /admin, …) falls through to the
// "*" route and shows the "page not found" page.
import { BrowserRouter, Route, Routes } from 'react-router';
// (Add Navigate back to this import when the portal is switched on.)
import ContactPage from './pages/ContactPage';
import LandingPage from './pages/LandingPage';
import NotFoundPage from './pages/NotFoundPage';
import OurStoryPage from './pages/OurStoryPage';
// --- Portal (switched off) ---
// import { ROLES } from '@shared/constants';
// import AdminLayout from './admin/AdminLayout';
// import ApprovalsPage from './admin/ApprovalsPage';
// import { AuthProvider } from './auth/AuthProvider';
// import { RequireRole } from './auth/RequireRole';
// import InfoPage from './pages/InfoPage';
// import LoginPage from './pages/LoginPage';
// import ResetPasswordPage from './pages/ResetPasswordPage';
//
// const soon = (who: string) => (
//   <InfoPage title={`Welcome, ${who}`} body="Your portal screens are coming soon." />
// );

export default function App() {
  // AuthProvider (switched off with the portal) used to wrap BrowserRouter.
  // The public pages don't need it, and leaving it out means visitors don't
  // wait on the auth check's splash screen before the page appears.
  return (
    <BrowserRouter>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/our-story" element={<OurStoryPage />} />
        <Route path="/contact" element={<ContactPage />} />
        {/* --- Portal (switched off) ---
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/use-the-app"
          element={
            <InfoPage
              title="Please use the iPad app"
              body="Volunteer sessions run in the Welicare app on iPad. Sign in there to continue."
            />
          }
        />
        <Route
          path="/pending"
          element={
            <InfoPage
              title="Waiting for approval"
              body="Your organization’s administrator needs to approve your account. Please check back later."
            />
          }
        />
        <Route
          path="/no-profile"
          element={
            <InfoPage
              title="Account not set up"
              body="Please finish setting up your account in the Welicare app, then sign in here."
            />
          }
        />
        <Route
          path="/admin"
          element={
            <RequireRole roles={[ROLES.ADMIN]}>
              <AdminLayout />
            </RequireRole>
          }
        >
          {/* No dashboard yet, so the admin home is the approvals list. *\/}
          <Route index element={<Navigate to="approvals" replace />} />
          <Route path="approvals" element={<ApprovalsPage />} />
        </Route>
        <Route path="/caregiver/*" element={<RequireRole roles={[ROLES.CAREGIVER]}>{soon('Caregiver')}</RequireRole>} />
        <Route path="/family/*" element={<RequireRole roles={[ROLES.FAMILY]}>{soon('Family Caregiver')}</RequireRole>} />
        --- end of portal --- */}
        {/* Unknown addresses get a "page not found" page rather than a silent
            redirect, so a broken link is visible as one. */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
