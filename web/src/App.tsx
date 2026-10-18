// Routes. "/" is the public product page (LandingPage) for everyone; each
// role's area sits behind RequireRole, and signing in sends a person to
// their own home. Role homes are placeholders until the screens are built.
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { ROLES } from '@shared/constants';
import AdminLayout from './admin/AdminLayout';
import ApprovalsPage from './admin/ApprovalsPage';
import { AuthProvider } from './auth/AuthProvider';
import { RequireRole } from './auth/RequireRole';
import InfoPage from './pages/InfoPage';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

const soon = (who: string) => (
  <InfoPage title={`Welcome, ${who}`} body="Your portal screens are coming soon." />
);

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <Routes>
          <Route path="/" element={<LandingPage />} />
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
            {/* No dashboard yet, so the admin home is the approvals list. */}
            <Route index element={<Navigate to="approvals" replace />} />
            <Route path="approvals" element={<ApprovalsPage />} />
          </Route>
          <Route path="/caregiver/*" element={<RequireRole roles={[ROLES.CAREGIVER]}>{soon('Caregiver')}</RequireRole>} />
          <Route path="/family/*" element={<RequireRole roles={[ROLES.FAMILY]}>{soon('Family Caregiver')}</RequireRole>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
