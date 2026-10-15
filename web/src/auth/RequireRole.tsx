// Route guard: signed out → /login; wrong role or not set up → their own
// home (homePathFor). UI only — firestore.rules are the real enforcement.
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from './AuthProvider';
import Splash from '../Splash';
import { homePathFor } from './routing';

export function RequireRole({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { loading, user, profile } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  const home = homePathFor(profile);
  // Must also be "set up" for that role (e.g. a Caregiver with an org).
  if (!profile?.role || !roles.includes(profile.role) || home === '/pending' || home === '/use-the-app')
    return <Navigate to={home} replace />;
  return children;
}
