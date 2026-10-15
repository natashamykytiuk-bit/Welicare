// Routes. Each role's area sits behind RequireRole; "/" sends a signed-in
// person to their own home. Role homes are placeholders until the screens
// are built.
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { ROLES } from '@shared/constants';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { RequireRole } from './auth/RequireRole';
import { homePathFor } from './auth/routing';
import InfoPage from './pages/InfoPage';
import LoginPage from './pages/LoginPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import Splash from './Splash';

function Home() {
  const { loading, user, profile } = useAuth();
  if (loading) return <Splash />;
  return <Navigate to={user ? homePathFor(profile) : '/login'} replace />;
}

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
          <Route path="/" element={<Home />} />
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
          <Route path="/admin/*" element={<RequireRole roles={[ROLES.ADMIN]}>{soon('Administrator')}</RequireRole>} />
          <Route path="/caregiver/*" element={<RequireRole roles={[ROLES.CAREGIVER]}>{soon('Caregiver')}</RequireRole>} />
          <Route path="/family/*" element={<RequireRole roles={[ROLES.FAMILY]}>{soon('Family Caregiver')}</RequireRole>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
