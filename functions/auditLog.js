// The organization activity log: a server-only record of who did what and
// when, for an organization's Administrators (ActivityLogScreen, reached
// from Administrator Mode).
//
// Entries live in the top-level `auditLog` collection, one doc per event:
//   { orgId, action, actorUid, actorName, targetUid?, targetName?, at }
// Only Cloud Functions write them (firestore.rules refuse all client
// writes), so nobody can forge or erase entries from the app, and only that
// organization's Administrators can read them.
//
// Privacy: entries hold account/resident names and ids plus the kind of
// action — never life-story content, safety notes or other profile details.
//
// Events come from two places:
// - the organization Cloud Functions in index.js call logAudit() after a
//   change succeeds (member joined/removed/left, administrator transferred,
//   invite code replaced);
// - Firestore triggers (below) for changes the app makes directly under
//   firestore.rules: a resident deleted, the volunteer permission changed.
//   The "...WithAuthContext" triggers are told which account made the change.

const {
  onDocumentDeletedWithAuthContext,
  onDocumentUpdatedWithAuthContext,
} = require('firebase-functions/v2/firestore');

// The actions an entry can record; ActivityLogScreen has a sentence for each.
const ACTIONS = {
  memberJoined: 'member.joined',
  memberRemoved: 'member.removed',
  memberLeft: 'member.left',
  adminTransferred: 'admin.transferred',
  inviteCodeRegenerated: 'inviteCode.regenerated',
  residentDeleted: 'resident.deleted',
  volunteerPermissionsChanged: 'volunteerPermissions.changed',
};

// A person's display name for the log, from their users doc: the same
// fallback order listOrgMembers uses. null if they have no profile (or
// uid is null).
async function nameOf(db, uid) {
  if (!uid) return null;
  const data = (await db.doc(`users/${uid}`).get()).data();
  return data ? data.fullName || data.username || null : null;
}

/**
 * Adds one entry. Called after the change it describes has succeeded; a
 * failure to log is reported in the function logs but never undoes or
 * fails the change itself (the log is a record, not a gate).
 *
 * Names can be passed in when the caller already has them (or when the
 * person's profile is about to be deleted); otherwise they're looked up.
 */
async function logAudit(
  db,
  { orgId, action, actorUid = null, actorName, targetUid = null, targetName, detail = null }
) {
  try {
    const { FieldValue } = require('firebase-admin/firestore');
    await db.collection('auditLog').add({
      orgId,
      action,
      actorUid,
      actorName: actorName !== undefined ? actorName : await nameOf(db, actorUid),
      targetUid,
      targetName: targetName !== undefined ? targetName : await nameOf(db, targetUid),
      detail,
      at: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error('[auditLog] could not record', action, 'for', orgId, e);
  }
}

// Whether an organization still wants log entries: skipped for a personal
// organization (a family member's private space — nothing to audit for an
// administrator) and for one that's gone or being deleted (its log is
// deleted with it; see deleteOrganization).
async function orgIsLogged(db, orgId) {
  if (!orgId) return false;
  const org = await db.doc(`organizations/${orgId}`).get();
  return org.exists && org.data().isPersonal !== true && org.data().status !== 'deleting';
}

// The uid behind a trigger event, when it was a signed-in app user
// ("system"/admin-SDK changes, e.g. deleteOrganization's cleanup, have
// no user).
function actorFromEvent(event) {
  return event.authType === 'app_user' && event.authId ? event.authId : null;
}

/**
 * The two Firestore triggers, created by index.js with its Admin SDK
 * getter (so firebase-admin is only initialised once).
 * @param {() => import('firebase-admin')} getAdmin
 */
function auditTriggers(getAdmin) {
  return {
    // A resident deleted from the app (Resident Mode → Remove, Administrators
    // only). Deletions made by deleteOrganization are skipped — the org is
    // marked "deleting" first, so orgIsLogged is false by then.
    auditResidentDeleted: onDocumentDeletedWithAuthContext(
      'residents/{residentId}',
      async (event) => {
        const db = getAdmin().firestore();
        const resident = event.data?.data() ?? {};
        if (!(await orgIsLogged(db, resident.facilityId))) return;
        await logAudit(db, {
          orgId: resident.facilityId,
          action: ACTIONS.residentDeleted,
          actorUid: actorFromEvent(event),
          targetUid: null,
          targetName: resident.name ?? null,
        });
      }
    ),

    // Organizational Settings → "Volunteers can view life stories" changed.
    auditVolunteerPermissions: onDocumentUpdatedWithAuthContext(
      'organizations/{orgId}',
      async (event) => {
        const before = event.data?.before.data()?.volunteerPermissions?.canViewLifeStories === true;
        const after = event.data?.after.data()?.volunteerPermissions?.canViewLifeStories === true;
        if (before === after) return; // some other field changed
        const db = getAdmin().firestore();
        if (!(await orgIsLogged(db, event.params.orgId))) return;
        await logAudit(db, {
          orgId: event.params.orgId,
          action: ACTIONS.volunteerPermissionsChanged,
          actorUid: actorFromEvent(event),
          detail: after
            ? 'Volunteers can now view life stories'
            : 'Volunteers can no longer view life stories',
        });
      }
    ),
  };
}

module.exports = { ACTIONS, logAudit, orgIsLogged, auditTriggers };
