// Where a signed-in person belongs, from their users/{uid} record. Kept pure
// (no Firebase) so the routing rules have a unit test. The rules enforce
// data access; this only decides which screens to show.
import { ROLES } from '@shared/constants';

export type Profile = { role?: string; orgId?: string; pendingOrgId?: string };

export function homePathFor(profile: Profile | null): string {
  if (!profile?.role) return '/no-profile';
  // Web is not for volunteers (UI-only: rules can't tell web from iPad).
  if (profile.role === ROLES.VOLUNTEER) return '/use-the-app';
  // Staff without an org can't see any facility data yet.
  if (profile.role !== ROLES.FAMILY && !profile.orgId) return '/pending';
  if (profile.role === ROLES.ADMIN) return '/admin';
  if (profile.role === ROLES.CAREGIVER) return '/caregiver';
  return '/family';
}
