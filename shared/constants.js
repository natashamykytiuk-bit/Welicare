// Role, collection and field names shared by the mobile app and the web
// portal (web/ imports this through its @shared alias), so both spell them
// the same way. firestore.rules, storage.rules and functions/ can't import
// this file and keep their own copies of these strings —
// tests/sharedConstants.test.js checks firestore.rules still uses every one.

// The four roles picked at sign-up (users/{uid}.role). Locked after
// sign-up by firestore.rules.
export const ROLES = {
  FAMILY: 'Family Caregiver',
  CAREGIVER: 'Caregiver',
  VOLUNTEER: 'Volunteer',
  ADMIN: 'Administrator',
};

// Roles that keep residents' profiles (isStaff() in firestore.rules).
export const STAFF_ROLES = [ROLES.CAREGIVER, ROLES.ADMIN];

export const COLLECTIONS = {
  USERS: 'users',
  RESIDENTS: 'residents',
  ORGANIZATIONS: 'organizations',
  ACTIVITY_SESSIONS: 'activitySessions',
  USERNAMES: 'usernames',
};

export const FIELDS = {
  // users/{uid}: the organization the person belongs to, and the one
  // they've asked to join (set only by the joinOrganization function).
  USER_ORG: 'orgId',
  USER_PENDING_ORG: 'pendingOrgId',
  ROLE: 'role',
  // residents/{id}: the organization the resident lives in. Rules match it
  // against the caller's own users/{uid}.orgId.
  RESIDENT_FACILITY: 'facilityId',
};
