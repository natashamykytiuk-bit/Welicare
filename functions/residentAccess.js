// Loads what generateSuggestions may use about a resident — their life story
// and safety notes — straight from Firestore, after checking the caller is
// allowed to see them.
//
// The app used to read these itself and send them along. That meant the
// function had to trust whatever it was sent: a direct caller could pass any
// text as a "life story" (using the paid model for anything they liked), or
// leave out the safety notes. Now the app sends only a residentId and
// everything else comes from here.
//
// The Admin SDK bypasses firestore.rules, so the checks below repeat the
// rules for these two docs (linkedToResident and the private/{docId} rules
// in firestore.rules). If those rules change, change these to match.
//
// Like rateLimit.js, this file doesn't load firebase-functions, so it can be
// unit-tested without the emulator (tests/residentAccess.test.js). A refusal
// is thrown as a plain Error marked `denied`; ai.js turns it into the
// HttpsError the app receives.

// Roles that see every resident in their own facility — seesWholeFacility()
// in firestore.rules. Family Caregivers are left out on purpose: they only
// reach residents they're linked to directly.
const FACILITY_ROLES = ['Caregiver', 'Administrator', 'Volunteer'];

// Same as linkedToResident() in firestore.rules: the resident's creator or
// caregiver, anyone on its assignedCaregivers or familyMembers list, or
// facility staff in the resident's own facility.
function linkedToResident(resident, user, uid) {
  const inList = (list) => Array.isArray(list) && list.includes(uid);
  return (
    resident.caregiverId === uid ||
    resident.createdBy === uid ||
    inList(resident.assignedCaregivers) ||
    inList(resident.familyMembers) ||
    (resident.facilityId != null &&
      user?.orgId === resident.facilityId &&
      FACILITY_ROLES.includes(user?.role))
  );
}

// One message whether the resident doesn't exist or the caller isn't linked
// to them, so the reply doesn't confirm which ids are real.
function denied() {
  return Object.assign(new Error("You don't have access to this resident."), { denied: true });
}

// Returns { lifeStory, topicsToAvoid } for `residentId` as `uid` may see
// them, or throws a `denied` Error. Both are returned raw — ai.js still runs
// them through sanitizeLifeStory / sanitizeTopicsToAvoid.
//
// - Safety notes: everyone linked to the resident, volunteers included.
// - Life story: everyone linked except volunteers, unless their organization
//   switched on "Volunteers can view life stories". A volunteer without it
//   gets lifeStory: null (general suggestions) — not an error — and the
//   safety notes still apply.
//
// A failed read is thrown, never treated as "nothing saved": suggestions
// must not be generated without the safety notes just because they couldn't
// be loaded.
async function loadResidentContext(db, residentId, uid) {
  if (typeof residentId !== 'string' || !residentId || residentId.includes('/')) throw denied();
  const residentPath = `residents/${residentId}`;
  const [residentSnap, userSnap] = await Promise.all([
    db.doc(residentPath).get(),
    db.doc(`users/${uid}`).get(),
  ]);
  const resident = residentSnap.data();
  const user = userSnap.data();
  if (!resident || !linkedToResident(resident, user, uid)) throw denied();

  let mayViewLifeStory = user?.role !== 'Volunteer';
  if (!mayViewLifeStory && resident.facilityId != null) {
    const org = (await db.doc(`organizations/${resident.facilityId}`).get()).data();
    mayViewLifeStory = org?.volunteerPermissions?.canViewLifeStories === true;
  }

  const [storySnap, safetySnap] = await Promise.all([
    mayViewLifeStory ? db.doc(`${residentPath}/private/lifeStory`).get() : null,
    db.doc(`${residentPath}/private/safety`).get(),
  ]);
  // Residents saved before the life story moved to its own doc still have it
  // as a field on the resident (see utils/residentLifeStory.js in the app).
  const lifeStory = mayViewLifeStory ? (storySnap.data() ?? resident.lifeStory ?? null) : null;
  const topicsToAvoid = safetySnap.data()?.topicsToAvoid ?? null;
  return { lifeStory, topicsToAvoid };
}

// Whether a resident is still "at home" with the family member `uid`: in no
// organization, or in that person's own family (personal) organization.
// `org` is the resident's organization doc, or null. Same idea as atHome()
// in firestore.rules, with the extra check that the family organization is
// really this person's.
function isAtHomeResident(resident, org, uid) {
  if (resident.facilityId == null) return true;
  return org?.isPersonal === true && org.createdBy === uid;
}

// Who may permanently delete a resident (the deleteResident function in
// index.js — the app itself can't delete residents at all):
// - an Administrator of the resident's own facility. Not Caregivers, who
//   archive instead: deleting removes the resident for everyone.
// - the Family Caregiver who added an at-home resident. Nobody else has any
//   claim on it, so it's theirs to remove.
// `org` is the resident's organization doc, or null if it has none.
function mayDeleteResident(resident, user, uid, org) {
  if (!resident || !user) return false;
  if (user.role === 'Administrator') {
    return (
      resident.facilityId != null &&
      user.orgId === resident.facilityId &&
      // A family organization has no administrator to speak of.
      org?.isPersonal !== true
    );
  }
  if (user.role === 'Family Caregiver') {
    return (
      (resident.createdBy === uid || resident.caregiverId === uid) &&
      isAtHomeResident(resident, org, uid)
    );
  }
  return false;
}

module.exports = { linkedToResident, loadResidentContext, isAtHomeResident, mayDeleteResident };
