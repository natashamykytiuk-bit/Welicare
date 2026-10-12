// @ts-check
// Who may create, edit, archive and delete a resident — as pure functions,
// so screens can decide which buttons to show (and tests can check every
// case, tests/residentPermissions.test.js) without touching Firestore.
//
// These only decide what the app OFFERS. What's actually allowed is enforced
// by firestore.rules (isStaff / staffOf / familyOwner / mayEditResident),
// storage.rules (mayEditResidentPhoto) and the deleteResident Cloud Function;
// if those change, change these to match. The point of mirroring them here
// is that nobody is shown a button that would only fail when tapped.
//
// The rules, in words (owner decisions, Oct 2026):
// - Caregivers and Administrators ("staff") look after every resident in
//   their own organization, and can't add residents outside one.
// - Family Caregivers look after residents they added themselves while those
//   are "at home": in no organization, or in the family organization every
//   Family Caregiver gets at sign-up. Once a resident has moved into a care
//   facility the family member can view them (and share photos) but not
//   edit — the facility's staff keep the profile.
// - Volunteers never create or edit a profile, not even for a resident they
//   created or are assigned to.
// - Favourites (the hearts in the music and movie screens) are open to
//   everyone linked to the resident; they aren't treated as profile edits,
//   so nothing here gates them.
//
// Every function takes the same three things:
//   viewer   — { uid, role, orgId } for the signed-in person
//   org      — the VIEWER'S organization doc (or null). It's only read to
//              tell a family organization (isPersonal) from a care facility.
//   resident — the resident doc's data
// See loadViewer() in utils/viewer.js for the first two.

/**
 * @typedef {object} Viewer
 * @property {string | null | undefined} uid
 * @property {import('../types/models').Role | null | undefined} role
 * @property {string | null | undefined} [orgId]
 *
 * @typedef {Partial<import('../types/models').Organization> | null | undefined} ViewerOrg
 * @typedef {Partial<import('../types/models').Resident> | null | undefined} ResidentLike
 */

const STAFF_ROLES = ['Caregiver', 'Administrator'];

/** Caregivers and Administrators — the roles that keep residents' profiles. */
export function isStaff(viewer) {
  return STAFF_ROLES.includes(viewer?.role);
}

/**
 * True for a Family Caregiver's own family organization (isPersonal), false
 * for a care facility or no organization.
 * @param {ViewerOrg} org
 */
export function isFamilyOrg(org) {
  return org?.isPersonal === true;
}

/**
 * Whether this resident is "at home" for this viewer: in no organization,
 * or in the viewer's own family organization. A resident in any other
 * organization is in a care facility.
 * @param {Viewer} viewer
 * @param {ViewerOrg} org
 * @param {ResidentLike} resident
 */
export function isAtHome(viewer, org, resident) {
  const facilityId = resident?.facilityId ?? null;
  if (facilityId === null) return true;
  return !!viewer?.orgId && facilityId === viewer.orgId && isFamilyOrg(org);
}

/** The viewer added this resident (older docs only have createdBy). */
function isCreator(viewer, resident) {
  return (
    !!viewer?.uid && (resident?.caregiverId === viewer.uid || resident?.createdBy === viewer.uid)
  );
}

/**
 * Whether the "Add Resident" option should be offered.
 * - Staff: only once they belong to an organization (the resident is
 *   created inside it).
 * - Family Caregivers: at home only — so not if their account is attached
 *   to a care facility, which can only be an account from before family
 *   members stopped joining organizations.
 * - Volunteers and anyone without a role: never.
 * @param {Viewer} viewer
 * @param {ViewerOrg} org
 */
export function canCreateResident(viewer, org) {
  if (isStaff(viewer)) return !!viewer?.orgId;
  if (viewer?.role === 'Family Caregiver') return !viewer.orgId || isFamilyOrg(org);
  return false;
}

/**
 * Whether the viewer may change this resident's profile: name, life story,
 * profile photo, music and movie picks.
 * @param {Viewer} viewer
 * @param {ViewerOrg} org
 * @param {ResidentLike} resident
 */
export function canEditResident(viewer, org, resident) {
  if (!viewer?.uid || !resident) return false;
  if (isStaff(viewer)) {
    // Their own facility's residents only — being the creator of, or
    // assigned to, a resident somewhere else isn't enough.
    return !!resident.facilityId && resident.facilityId === viewer.orgId;
  }
  if (viewer.role === 'Family Caregiver') {
    return isCreator(viewer, resident) && isAtHome(viewer, org, resident);
  }
  return false;
}

/**
 * Archiving hides a resident without deleting anything, and can be undone,
 * so it follows editing exactly.
 * @param {Viewer} viewer
 * @param {ViewerOrg} org
 * @param {ResidentLike} resident
 */
export function canArchiveResident(viewer, org, resident) {
  return canEditResident(viewer, org, resident);
}

/**
 * Permanent deletion removes the resident for everyone, so in a facility
 * it's Administrators only (Caregivers archive instead). A Family Caregiver
 * may delete their own at-home resident — nobody else has any claim on it.
 * @param {Viewer} viewer
 * @param {ViewerOrg} org
 * @param {ResidentLike} resident
 */
export function canDeleteResident(viewer, org, resident) {
  if (!viewer?.uid || !resident) return false;
  if (viewer.role === 'Administrator') {
    return !!resident.facilityId && resident.facilityId === viewer.orgId;
  }
  if (viewer.role === 'Family Caregiver') {
    return isCreator(viewer, resident) && isAtHome(viewer, org, resident);
  }
  return false;
}

/**
 * Whether "Move to an organization" should be offered: a Family Caregiver's
 * own at-home resident that isn't archived and doesn't already have a move
 * waiting for approval (see requestResidentMove in functions/index.js).
 * @param {Viewer} viewer
 * @param {ViewerOrg} org
 * @param {ResidentLike & { archived?: boolean, pendingFacilityId?: string | null }} resident
 */
export function canMoveResident(viewer, org, resident) {
  return (
    viewer?.role === 'Family Caregiver' &&
    isCreator(viewer, resident) &&
    isAtHome(viewer, org, resident) &&
    resident?.archived !== true &&
    !resident?.pendingFacilityId
  );
}
