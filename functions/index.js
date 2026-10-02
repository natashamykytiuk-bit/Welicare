const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');

// Every function runs in Montréal, the same region as the Firestore
// database, so resident data is processed in Canada rather than the default
// us-central1 (Iowa). The app must call the same region — see REGION in
// firebaseConfig.js — and firebase.json's postdeploy list names it too.
// (The AI request itself still goes to Anthropic's API in the US.)
setGlobalOptions({ region: 'northamerica-northeast1' });

const { requireVerified, requireRecentLogin } = require('./authChecks');
const { ACTIONS, logAudit, orgIsLogged, auditTriggers } = require('./auditLog');

// AI suggestions and YouTube search live in their own files; exported here
// so Firebase deploys them. They're required AFTER setGlobalOptions above,
// so they pick up the Montréal region too.
exports.generateSuggestions = require('./ai').generateSuggestions;
exports.searchYouTube = require('./youtube').searchYouTube;

// A BulkWriter that remembers the outcome of every write it's given.
//
// BulkWriter.close() resolves once everything has been attempted, but never
// rejects — a write that failed (after BulkWriter's own retries) only shows
// up on that write's own promise. finish() waits for all of them and throws
// if ANY failed, so callers can refuse to carry on to their final,
// irreversible step (deleting the account or the organization) until every
// cleanup write is confirmed. Each promise gets a handler immediately, so a
// failure can't surface as an unhandled rejection before finish() runs.
// All the writes used with it are safe to repeat, so a failed run can just
// be retried.
function trackedBulkWriter(db, label) {
  const writer = db.bulkWriter();
  const outcomes = [];
  const track = (promise, what) =>
    outcomes.push(
      promise.then(
        () => null,
        (error) => ({ what, error })
      )
    );
  return {
    delete: (ref) => track(writer.delete(ref), `delete ${ref.path}`),
    update: (ref, data) => track(writer.update(ref, data), `update ${ref.path}`),
    async finish() {
      await writer.close();
      const failures = (await Promise.all(outcomes)).filter(Boolean);
      if (failures.length) {
        for (const f of failures) console.error(`[${label}] ${f.what} failed:`, f.error);
        throw new HttpsError(
          'internal',
          'Something went wrong partway through. Nothing important was lost — please try again.',
          { reason: 'cleanup-incomplete', failed: failures.length }
        );
      }
    },
  };
}

// The Admin SDK, initialised on first use rather than at load, so functions
// that never touch it (AI suggestions, YouTube search) don't pay for it on
// cold start.
//
// firebase-admin 13+ has no admin.firestore() / admin.auth() namespace any
// more: each service comes from its own subpath (firebase-admin/firestore,
// …). getAdmin() returns the same three accessors the rest of this file
// already calls, so callers read the same as before.
let adminApp = null;
function getAdmin() {
  if (!adminApp) adminApp = require('firebase-admin/app').initializeApp();
  return {
    firestore: () => require('firebase-admin/firestore').getFirestore(adminApp),
    auth: () => require('firebase-admin/auth').getAuth(adminApp),
    storage: () => require('firebase-admin/storage').getStorage(adminApp),
  };
}

// Removes a resident's files and photo album: EVERYTHING under
// residents/{residentId}/ in Cloud Storage (the album's photos/ and the
// profile.jpg profile photo), and every residents/{residentId}/photos/*
// doc queued on `writer` (deleting the resident doc doesn't delete its
// subcollections). Files first, so if that fails the docs are still there
// and a retry finds everything again. deleteFiles on a prefix with nothing
// under it is a no-op, so this is safe to repeat. See
// utils/residentPhotos.js and utils/profilePhotos.js for the layout.
async function deleteResidentPhotos(admin, writer, residentRef) {
  await admin
    .storage()
    .bucket()
    .deleteFiles({ prefix: `residents/${residentRef.id}/` });
  const photos = await residentRef.collection('photos').get();
  for (const photo of photos.docs) writer.delete(photo.ref);
}

// Activity-log triggers for changes the app makes directly (a resident
// deleted, the volunteer permission changed) — see auditLog.js.
const triggers = auditTriggers(getAdmin);
exports.auditResidentDeleted = triggers.auditResidentDeleted;
exports.auditVolunteerPermissions = triggers.auditVolunteerPermissions;

// Other Administrators in `orgId`, excluding `uid`. "Administrator" means
// the role on each member's users doc — the same field ModeSelectionScreen
// branches on — not the org doc's createdBy/adminId, which is just the one
// admin allowed to edit the org's details.
async function otherAdmins(db, orgId, uid) {
  const snap = await db
    .collection('users')
    .where('orgId', '==', orgId)
    .where('role', '==', 'Administrator')
    .get();
  return snap.docs.filter((d) => d.id !== uid);
}

// In-app account deletion, called from DeleteAccountScreen. Removes this
// person's own information; a real organization and its residents are
// shared data and stay (deleteOrganization removes those instead).
//
// - Sole administrator: refused with failed-precondition, so an
//   organization is never left with nobody to manage it. They have to
//   transfer the role first (transferOrgAdmin) or delete the org.
// - Org owner (createdBy/adminId) with other admins: ownership moves to
//   one of them, so someone can still edit the org's details.
// - Personal organization (a Family Caregiver's auto-created one): deleted
//   along with its residents, since nobody else could ever reach them.
//   Same for facility-less residents only this person looks after.
// - Every other resident: the caller is just removed from
//   assignedCaregivers. createdBy/caregiverId stay (they're historical).
// - Every usernames/* doc for this uid, the users doc, and finally the
//   Firebase Auth account.
//
// The client re-authenticates with the password before calling this, so a
// device left signed in can't be used to delete someone's account.
exports.deleteAccount = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  requireRecentLogin(request);
  const uid = request.auth.uid;
  const admin = getAdmin();
  const db = admin.firestore();
  // Imported from the firestore subpath — admin.firestore.FieldValue is
  // undefined in firebase-admin v12's namespace export.
  const { FieldValue } = require('firebase-admin/firestore');

  const user = (await db.doc(`users/${uid}`).get()).data() ?? {};
  const orgId = user.orgId ?? null;
  const orgSnap = orgId ? await db.doc(`organizations/${orgId}`).get() : null;
  const org = orgSnap?.exists ? orgSnap.data() : null;
  const personalOrgId = org && org.isPersonal === true && org.createdBy === uid ? orgId : null;

  // Checked before anything is written, so a refusal leaves the account
  // exactly as it was.
  let newOwner = null;
  if (org && !personalOrgId) {
    const isOwner = org.createdBy === uid || org.adminId === uid;
    if (isOwner || user.role === 'Administrator') {
      const others = await otherAdmins(db, orgId, uid);
      if (others.length === 0) {
        throw new HttpsError(
          'failed-precondition',
          'You are the only administrator of this organization. Make someone else the administrator first.',
          { reason: 'sole-admin' }
        );
      }
      if (isOwner) newOwner = others[0].id;
    }
  }

  // Two queries because older residents are linked by createdBy only.
  const [created, assigned, personalResidents] = await Promise.all([
    db.collection('residents').where('createdBy', '==', uid).get(),
    db.collection('residents').where('assignedCaregivers', 'array-contains', uid).get(),
    personalOrgId
      ? db.collection('residents').where('facilityId', '==', personalOrgId).get()
      : Promise.resolve({ docs: [] }),
  ]);
  const inPersonalOrg = new Set(personalResidents.docs.map((d) => d.id));
  const residents = new Map();
  for (const snap of [...created.docs, ...assigned.docs, ...personalResidents.docs])
    residents.set(snap.id, snap);

  // BulkWriter batches and retries on its own — no 500-op batch limit.
  // Step 1: cleanup, every write checked (see trackedBulkWriter). The user
  // doc is left in place until this succeeds, so a failed run can simply be
  // retried — it still knows the user's org, personal org, etc.
  const writer = trackedBulkWriter(db, 'deleteAccount');
  for (const snap of residents.values()) {
    const data = snap.data();
    const assignedList = Array.isArray(data.assignedCaregivers) ? data.assignedCaregivers : [];
    const others = assignedList.filter((id) => id !== uid);
    if (inPersonalOrg.has(snap.id) || (!data.facilityId && others.length === 0)) {
      // The life story lives in its own private doc under the resident
      // (see utils/residentLifeStory.js); deleting a doc doesn't delete its
      // subcollections, so remove it explicitly.
      // Both private docs: the life story and the safety notes.
      writer.delete(snap.ref.collection('private').doc('lifeStory'));
      writer.delete(snap.ref.collection('private').doc('safety'));
      // And the photo album (Storage files + photos/* docs).
      await deleteResidentPhotos(admin, writer, snap.ref);
      writer.delete(snap.ref);
    } else if (assignedList.includes(uid)) {
      writer.update(snap.ref, { assignedCaregivers: FieldValue.arrayRemove(uid) });
    }
  }

  // Residents they were linked to by a family code (redeemFamilyCode): take
  // them off familyMembers. Skips residents already deleted above.
  const linkedAsFamily = await db
    .collection('residents')
    .where('familyMembers', 'array-contains', uid)
    .get();
  for (const snap of linkedAsFamily.docs) {
    const removed =
      inPersonalOrg.has(snap.id) ||
      (residents.has(snap.id) &&
        !snap.data().facilityId &&
        (snap.data().assignedCaregivers ?? []).every((id) => id === uid));
    if (!removed) writer.update(snap.ref, { familyMembers: FieldValue.arrayRemove(uid) });
  }

  if (personalOrgId) writer.delete(db.doc(`organizations/${personalOrgId}`));
  if (newOwner)
    writer.update(db.doc(`organizations/${orgId}`), { createdBy: newOwner, adminId: newOwner });

  const usernames = await db.collection('usernames').where('uid', '==', uid).get();
  for (const snap of usernames.docs) writer.delete(snap.ref);
  await writer.finish();

  // Their optional profile picture (utils/profilePhotos.js). Removed with
  // the other cleanup, before the profile, so a failure can be retried.
  // ignoreNotFound: most people never add one.
  await admin.storage().bucket().file(`users/${uid}/avatar.jpg`).delete({ ignoreNotFound: true });

  // Step 2: only now remove the profile, then (below) the login itself.
  await db.doc(`users/${uid}`).delete();
  // Logged for a real organization only (a personal one is gone by now).
  // The name comes from the profile read earlier, since it was just deleted.
  if (org && !personalOrgId && (await orgIsLogged(db, orgId))) {
    await logAudit(db, {
      orgId,
      action: ACTIONS.memberLeft,
      actorUid: uid,
      actorName: user.fullName || user.username || null,
    });
  }

  // Last, so if anything above fails the person can still sign in and try
  // again rather than being left with half-cleaned data and no account.
  await admin.auth().deleteUser(uid);
  return { ok: true };
});

// Checks the caller owns `orgId` (createdBy/adminId) and is an
// Administrator. Every org-management function needs this because the
// Admin SDK bypasses firestore.rules, so they must authorise themselves.
async function requireOrgOwner(db, orgId, uid) {
  if (typeof orgId !== 'string' || !orgId) {
    throw new HttpsError('invalid-argument', 'orgId is required.');
  }
  const [orgSnap, userSnap] = await Promise.all([
    db.doc(`organizations/${orgId}`).get(),
    db.doc(`users/${uid}`).get(),
  ]);
  if (!orgSnap.exists) {
    throw new HttpsError('not-found', 'Organization not found.');
  }
  const org = orgSnap.data();
  if (
    !(org.createdBy === uid || org.adminId === uid) ||
    userSnap.data()?.role !== 'Administrator'
  ) {
    throw new HttpsError(
      'permission-denied',
      "Only this organization's administrator can do this."
    );
  }
  return org;
}

// The same ownership check as requireOrgOwner, but inside a transaction:
// the org and caller are read through `tx`, so if either changes before the
// transaction commits (say, ownership moved to someone else a moment ago),
// Firestore retries it and the check runs again against the fresh data. That
// closes the gap where a check done *before* the writes could act on stale
// ownership. Also refuses an org that's being deleted (see
// deleteOrganization). Returns the org's data.
async function requireOrgOwnerTx(tx, db, orgId, uid, { allowDeleting = false } = {}) {
  if (typeof orgId !== 'string' || !orgId) {
    throw new HttpsError('invalid-argument', 'orgId is required.');
  }
  const [orgSnap, userSnap] = await Promise.all([
    tx.get(db.doc(`organizations/${orgId}`)),
    tx.get(db.doc(`users/${uid}`)),
  ]);
  if (!orgSnap.exists) throw new HttpsError('not-found', 'Organization not found.');
  const org = orgSnap.data();
  if (
    !(org.createdBy === uid || org.adminId === uid) ||
    userSnap.data()?.role !== 'Administrator'
  ) {
    throw new HttpsError(
      'permission-denied',
      "Only this organization's administrator can do this."
    );
  }
  if (org.status === 'deleting' && !allowDeleting) {
    throw new HttpsError('failed-precondition', 'This organization is being deleted.');
  }
  return org;
}

// Members of the caller's organization, for OrganizationalSettingsScreen's
// "Transfer administrator" picker. A function rather than a client query
// because firestore.rules only let a user read their own users doc. Returns
// only what the picker shows — never emails or PIN hashes.
exports.listOrgMembers = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  requireVerified(request);
  const db = getAdmin().firestore();
  const orgId = request.data?.orgId;
  await requireOrgOwner(db, orgId, request.auth.uid);
  const [snap, residents, pendingSnap] = await Promise.all([
    db.collection('users').where('orgId', '==', orgId).get(),
    db.collection('residents').where('facilityId', '==', orgId).get(),
    // People who used the invite code and are waiting for approval (see
    // joinOrganization) — shown at the top of Manage Users.
    db.collection('users').where('pendingOrgId', '==', orgId).get(),
  ]);
  // How many of the facility's residents each member is assigned to — shown
  // on Manage Users so an admin can review who has access to whom.
  const assignedCount = {};
  for (const r of residents.docs) {
    for (const id of r.data().assignedCaregivers ?? []) {
      assignedCount[id] = (assignedCount[id] ?? 0) + 1;
    }
  }
  return {
    members: snap.docs
      .filter((d) => d.id !== request.auth.uid)
      .map((d) => ({
        uid: d.id,
        name: d.data().fullName || d.data().username || 'Unnamed member',
        role: d.data().role ?? '',
        assignedResidents: assignedCount[d.id] ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    pending: pendingSnap.docs
      .map((d) => ({
        uid: d.id,
        name: d.data().fullName || d.data().username || 'Unnamed member',
        role: d.data().role ?? '',
        requestedAt: d.data().pendingSince?.toMillis?.() ?? null,
      }))
      // Oldest request first, so nobody waits at the bottom of the list.
      .sort((a, b) => (a.requestedAt ?? 0) - (b.requestedAt ?? 0)),
  };
});

// Approves a join request (Manage Users → Approve): the person's
// pendingOrgId becomes their orgId, which is what every org-scoped rule
// trusts, so only from this moment can they see the facility's residents.
// Owner-only and checked in one transaction against current data, so a
// request that was cancelled, denied or replaced a moment ago isn't
// approved by mistake. A Family Caregiver on a personal organization moves
// to this one, the same as joining used to do.
exports.approveOrgMember = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  requireVerified(request);
  const { orgId, memberUid } = request.data ?? {};
  if (typeof memberUid !== 'string' || !memberUid) {
    throw new HttpsError('invalid-argument', 'memberUid is required.');
  }
  const db = getAdmin().firestore();
  const { FieldValue } = require('firebase-admin/firestore');
  const memberRef = db.doc(`users/${memberUid}`);
  await db.runTransaction(async (tx) => {
    await requireOrgOwnerTx(tx, db, orgId, request.auth.uid);
    const member = (await tx.get(memberRef)).data();
    if (!member || member.pendingOrgId !== orgId) {
      throw new HttpsError('not-found', 'That request is no longer waiting for approval.');
    }
    // They may have created or been approved into another real org since
    // asking (this reads the member's doc, not the caller's).
    await readUserRequiringNoRealOrg(
      tx,
      db,
      memberUid,
      'This person has already joined another organization.'
    );
    tx.update(memberRef, {
      orgId,
      pendingOrgId: FieldValue.delete(),
      pendingSince: FieldValue.delete(),
    });
  });
  await logAudit(db, {
    orgId,
    action: ACTIONS.memberApproved,
    actorUid: request.auth.uid,
    targetUid: memberUid,
  });
  return { ok: true };
});

// Declines a join request (Manage Users → Deny). Only the request is
// cleared; the person keeps their account and could ask again with the
// code, so an admin who wants them kept out should also replace the code.
exports.denyOrgMember = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  requireVerified(request);
  const { orgId, memberUid } = request.data ?? {};
  if (typeof memberUid !== 'string' || !memberUid) {
    throw new HttpsError('invalid-argument', 'memberUid is required.');
  }
  const db = getAdmin().firestore();
  const { FieldValue } = require('firebase-admin/firestore');
  const memberRef = db.doc(`users/${memberUid}`);
  await db.runTransaction(async (tx) => {
    await requireOrgOwnerTx(tx, db, orgId, request.auth.uid);
    const member = (await tx.get(memberRef)).data();
    if (!member || member.pendingOrgId !== orgId) {
      throw new HttpsError('not-found', 'That request is no longer waiting for approval.');
    }
    tx.update(memberRef, {
      pendingOrgId: FieldValue.delete(),
      pendingSince: FieldValue.delete(),
    });
  });
  await logAudit(db, {
    orgId,
    action: ACTIONS.memberDenied,
    actorUid: request.auth.uid,
    targetUid: memberUid,
  });
  return { ok: true };
});

// Removes someone from the organization (Manage Users → Remove). Their
// account stays; they just lose all access to this facility:
// - their orgId is cleared, so every org-scoped rule stops matching them,
//   and on their next sign-in they're asked to join or create an org;
// - they're taken off every resident's assignedCaregivers;
// - residents THEY created in this facility are handed to the org's
//   administrator (createdBy/caregiverId), because the rules also grant a
//   resident's creator access — without this, a removed member would still
//   see those residents in their own list.
// Owner-only, re-checked inside a transaction, and needs a recent password
// entry (it's destructive). Every cleanup write is checked; the member's
// orgId is cleared last, so a failed run can simply be retried.
exports.removeOrgMember = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  requireVerified(request);
  requireRecentLogin(request);
  const { orgId, memberUid } = request.data ?? {};
  const ownerUid = request.auth.uid;
  if (typeof memberUid !== 'string' || !memberUid || memberUid === ownerUid) {
    throw new HttpsError('invalid-argument', "You can't remove yourself this way.");
  }
  const db = getAdmin().firestore();
  const { FieldValue } = require('firebase-admin/firestore');
  const memberRef = db.doc(`users/${memberUid}`);

  // Check ownership and membership together, against current data.
  await db.runTransaction(async (tx) => {
    await requireOrgOwnerTx(tx, db, orgId, ownerUid);
    const member = await tx.get(memberRef);
    if (!member.exists || member.data().orgId !== orgId) {
      throw new HttpsError('not-found', 'That person is not a member of this organization.');
    }
  });

  // One simple query for the facility's residents, filtered here — combining
  // facilityId with another filter could need a composite index in
  // production (the emulator wouldn't catch that).
  const residents = await db.collection('residents').where('facilityId', '==', orgId).get();
  const touched = residents.docs.filter((snap) => {
    const r = snap.data();
    return (
      (r.assignedCaregivers ?? []).includes(memberUid) ||
      r.createdBy === memberUid ||
      r.caregiverId === memberUid
    );
  });

  const writer = trackedBulkWriter(db, 'removeOrgMember');
  for (const snap of touched) {
    const data = snap.data();
    const update = { assignedCaregivers: FieldValue.arrayRemove(memberUid) };
    if (data.createdBy === memberUid) update.createdBy = ownerUid;
    if (data.caregiverId === memberUid) update.caregiverId = ownerUid;
    writer.update(snap.ref, update);
  }
  await writer.finish();

  // Last: clear their organization link.
  await memberRef.update({ orgId: FieldValue.delete() });
  await logAudit(db, {
    orgId,
    action: ACTIONS.memberRemoved,
    actorUid: ownerUid,
    targetUid: memberUid,
  });
  return { ok: true, residentsUpdated: touched.length };
});

// Hands the organization to another member: they become its owner
// (createdBy/adminId, so they can edit or delete it) and get the
// Administrator role if they didn't have it. The previous owner keeps
// their Administrator role — they're just no longer the only admin, which
// is what lets deleteAccount go ahead for them afterwards.
exports.transferOrgAdmin = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  requireVerified(request);
  requireRecentLogin(request);
  const db = getAdmin().firestore();
  const { orgId, newAdminUid } = request.data ?? {};
  if (typeof newAdminUid !== 'string' || !newAdminUid || newAdminUid === request.auth.uid) {
    throw new HttpsError('invalid-argument', 'That person is not a member of this organization.');
  }
  // One transaction: the ownership and membership checks read the same
  // data the writes depend on, so two admins acting at once can't both win
  // — whichever commits second is retried and fails the ownership check.
  await db.runTransaction(async (tx) => {
    await requireOrgOwnerTx(tx, db, orgId, request.auth.uid);
    const targetRef = db.doc(`users/${newAdminUid}`);
    const target = await tx.get(targetRef);
    if (!target.exists || target.data().orgId !== orgId) {
      throw new HttpsError('invalid-argument', 'That person is not a member of this organization.');
    }
    tx.update(db.doc(`organizations/${orgId}`), { createdBy: newAdminUid, adminId: newAdminUid });
    tx.update(targetRef, { role: 'Administrator' });
  });
  await logAudit(db, {
    orgId,
    action: ACTIONS.adminTransferred,
    actorUid: request.auth.uid,
    targetUid: newAdminUid,
  });
  return { ok: true };
});

// Deletes an organization and everything scoped to it, called from
// OrganizationalSettingsScreen. Server-side because the client can't do
// this under firestore.rules (e.g. clearing orgId on other members' user
// docs), and so a half-finished delete can't be left behind by a dropped
// connection mid-way through.
//
// Only the organization's own Administrator may call it — checked here
// against both the org doc (createdBy/adminId) and the caller's role, since
// the Admin SDK bypasses firestore.rules entirely.
//
// - Every resident with facilityId == this org is deleted, along with its
//   life story.
// - Every facility-scoped musicLibrary entry is deleted (the "global"
//   baseline is untouched — it's never scoped to an org).
// - orgId is cleared from every member's user doc, so on their next
//   sign-in App.js routes them to JoinCreateOrganization. Their accounts
//   themselves are kept.
exports.deleteOrganization = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  requireVerified(request);
  requireRecentLogin(request);
  const orgId = request.data?.orgId;
  const admin = getAdmin();
  const db = admin.firestore();
  // Imported from the firestore subpath — admin.firestore.FieldValue is
  // undefined in firebase-admin v12's namespace export.
  const { FieldValue } = require('firebase-admin/firestore');
  const orgRef = db.doc(`organizations/${orgId}`);

  // Step 1 — mark the org as deleting, re-checking ownership inside the
  // same transaction (so it can't act on stale ownership). From this moment
  // firestore.rules refuse new residents and library entries for it, and
  // joinOrganization / regenerateInviteCode refuse it too, so nothing new
  // can appear while it's being cleaned up. Re-running on an org that's
  // already marked is fine: that's how a failed deletion is resumed.
  await db.runTransaction(async (tx) => {
    await requireOrgOwnerTx(tx, db, orgId, request.auth.uid, { allowDeleting: true });
    tx.update(orgRef, { status: 'deleting', deletingAt: FieldValue.serverTimestamp() });
  });

  // Step 2 — clean up in passes. A pass finds everything still pointing at
  // the org and removes it, checking every write (trackedBulkWriter). A
  // write that was already in flight when the org was marked could still
  // land just after the first pass looked, so it keeps going until a pass
  // finds nothing — normally the second pass.
  let residentsDeleted = 0;
  let membersRemoved = 0;
  for (let pass = 1; ; pass += 1) {
    const [residents, music, movies, members, codes, familyCodes, audit] = await Promise.all([
      db.collection('residents').where('facilityId', '==', orgId).get(),
      db.collection('musicLibrary').where('facilityId', '==', orgId).get(),
      db.collection('movieLibrary').where('facilityId', '==', orgId).get(),
      db.collection('users').where('orgId', '==', orgId).get(),
      db.collection('inviteCodes').where('orgId', '==', orgId).get(),
      db.collection('familyCodes').where('facilityId', '==', orgId).get(),
      db.collection('auditLog').where('orgId', '==', orgId).get(),
    ]);
    // People still waiting for approval: their request is dropped so they
    // aren't left on the pending screen for an org that no longer exists.
    const pending = await db.collection('users').where('pendingOrgId', '==', orgId).get();
    const found =
      residents.size +
      music.size +
      movies.size +
      members.size +
      pending.size +
      codes.size +
      familyCodes.size +
      audit.size;
    if (found === 0) break;
    if (pass > 5) {
      throw new HttpsError(
        'aborted',
        'The organization kept changing while it was being deleted. Please try again.'
      );
    }
    const writer = trackedBulkWriter(db, 'deleteOrganization');
    for (const snap of residents.docs) {
      // Each resident's private life story too (subcollections aren't
      // removed automatically with their parent doc).
      // Both private docs: the life story and the safety notes.
      writer.delete(snap.ref.collection('private').doc('lifeStory'));
      writer.delete(snap.ref.collection('private').doc('safety'));
      // And the photo album (Storage files + photos/* docs).
      await deleteResidentPhotos(admin, writer, snap.ref);
      writer.delete(snap.ref);
    }
    for (const snap of music.docs) writer.delete(snap.ref);
    for (const snap of movies.docs) writer.delete(snap.ref);
    for (const snap of members.docs) writer.update(snap.ref, { orgId: FieldValue.delete() });
    for (const snap of pending.docs) {
      writer.update(snap.ref, {
        pendingOrgId: FieldValue.delete(),
        pendingSince: FieldValue.delete(),
      });
    }
    // Its invite codes go too, so an old code can't point at a deleted org.
    for (const snap of codes.docs) writer.delete(snap.ref);
    // And its residents' family codes (familyCodes/*).
    for (const snap of familyCodes.docs) writer.delete(snap.ref);
    // Its activity log too — nobody could read it once the org is gone.
    for (const snap of audit.docs) writer.delete(snap.ref);
    await writer.finish();
    residentsDeleted += residents.size;
    membersRemoved += members.size;
  }

  // Step 3 — only once nothing points at it: the private invite doc, then
  // the org itself. Until here the org stays in place (marked deleting), so
  // a failure at any point can be resumed by calling this again.
  await db.doc(`organizations/${orgId}/private/invite`).delete();
  await orgRef.delete();

  return { ok: true, residentsDeleted, membersRemoved };
});

// ---------------------------------------------------------------------------
// Organizations and invite codes
//
// Invite codes are never stored on the organization doc (which any signed-in
// user can fetch by id). Instead:
//   inviteCodes/{CODE}  { orgId, createdBy, createdAt, revoked, uses,
//                         expiresAt?, maxUses? } — lookup table with no
//                         client access at all (see firestore.rules).
//   organizations/{orgId}/private/invite  { code } — the current code,
//                         readable only by the org's own members, so
//                         OrgIdBadge and the settings screens can show it.
// Both are written only here, which is why creating an organization and
// upgrading a personal one are Cloud Functions too.
// ---------------------------------------------------------------------------

// Invite codes are 8 characters (decided over the original 6-character
// spec, for the reasons below) from a 31-character alphabet with look-alikes
// removed (no 0/O, 1/I/L), shown as two groups of four, e.g. "MGK7-4TXR".
// That's 31^8 ≈ 850 billion possibilities, drawn with crypto.randomInt (a
// cryptographically secure source) — Math.random is predictable, and the
// old "MG-4821" format had only ~5.8 million codes. Codes organizations
// already have keep working (see normalizeInviteCode).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function randomInviteCode() {
  const { randomInt } = require('crypto');
  const chars = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

// Turns whatever someone typed into the stored form of a code, or '' if it
// can't be one: dashes, spaces and case don't matter. Accepts both the new
// 8-character codes ("MGK7-4TXR") and the old "MG-4821" ones.
function normalizeInviteCode(input) {
  const cleaned = String(input ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (/^[A-Z]{2}\d{4}$/.test(cleaned)) return `${cleaned.slice(0, 2)}-${cleaned.slice(2)}`;
  if (/^[A-Z0-9]{8}$/.test(cleaned)) return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
  return '';
}

// Each flow below runs as ONE Firestore transaction: all reads happen first,
// then every write is committed together — or, if anything throws, none of
// them are. So a failure can never leave an organization with nobody linked
// to it, or an invite code reserved for an org that was never created.
// Firestore also retries the whole transaction automatically if another
// request changes something it read (e.g. two orgs drawing the same code at
// the same moment), which is what makes the code check race-free.

// How many random codes to try before giving up. Every one is checked
// inside the transaction; if all collide we throw rather than ever use an
// unchecked code.
const MAX_CODE_ATTEMPTS = 5;

// Transaction step (reads only): draws random codes until one isn't taken.
// Must run before the transaction's writes — Firestore requires all reads
// in a transaction to come first.
async function pickFreeInviteCode(tx, db) {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = randomInviteCode();
    const snap = await tx.get(db.doc(`inviteCodes/${code}`));
    if (!snap.exists) return code;
  }
  throw new HttpsError(
    'resource-exhausted',
    "We couldn't create an invite code just now. Please try again."
  );
}

// Transaction step (writes only): reserves `code` for `orgId`, makes it the
// org's current code, and revokes the previous one if there was one.
function writeInviteCode(tx, db, { orgId, code, uid, previous }) {
  const { FieldValue } = require('firebase-admin/firestore');
  // create() (not set) — fails the whole transaction if the code somehow
  // exists after all, instead of silently overwriting another org's code.
  tx.create(db.doc(`inviteCodes/${code}`), {
    orgId,
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
    revoked: false,
    uses: 0,
  });
  tx.set(db.doc(`organizations/${orgId}/private/invite`), {
    code,
    updatedAt: FieldValue.serverTimestamp(),
  });
  if (previous && previous !== code) {
    tx.set(db.doc(`inviteCodes/${previous}`), { revoked: true }, { merge: true });
  }
}

// Transaction step (reads only): throws if the user is already in a real
// (non-personal) organization — shared by joining and creating, so nobody
// hops between facilities. Returns the user's doc data.
async function readUserRequiringNoRealOrg(tx, db, uid, message) {
  const user = (await tx.get(db.doc(`users/${uid}`))).data() ?? {};
  if (user.orgId) {
    const org = await tx.get(db.doc(`organizations/${user.orgId}`));
    if (org.exists && org.data().isPersonal !== true) {
      throw new HttpsError('failed-precondition', message);
    }
  }
  return user;
}

// Creates a real (non-personal) organization owned by the caller and links
// them to it. Server-side because the org needs an invite code minted in
// the same step, and firestore.rules only let the app create personal orgs.
// One transaction: org doc + invite code + private copy + user's orgId.
exports.createOrganization = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  requireVerified(request);
  const uid = request.auth.uid;
  const { name, type, province, city } = request.data ?? {};
  if (typeof name !== 'string' || !name.trim()) {
    throw new HttpsError('invalid-argument', 'Please enter an organization name.');
  }
  const db = getAdmin().firestore();
  const { FieldValue } = require('firebase-admin/firestore');
  const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  // The org id is picked up front (nothing written yet) so the transaction
  // can reference it in every write.
  const orgRef = db.collection('organizations').doc();

  const code = await db.runTransaction(async (tx) => {
    // Reads
    await readUserRequiringNoRealOrg(tx, db, uid, "You're already part of an organization.");
    const newCode = await pickFreeInviteCode(tx, db);
    // Writes (all-or-nothing)
    tx.create(orgRef, {
      name: name.trim(),
      type: str(type),
      province: str(province),
      city: str(city),
      // No email: the org doc is readable by anyone signed in who knows its
      // id (firestore.rules), so contact details aren't stored on it.
      isPersonal: false,
      createdBy: uid,
      adminId: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    writeInviteCode(tx, db, { orgId: orgRef.id, code: newCode, uid, previous: null });
    // Creating their own org replaces any request waiting elsewhere.
    tx.set(
      db.doc(`users/${uid}`),
      { orgId: orgRef.id, pendingOrgId: FieldValue.delete(), pendingSince: FieldValue.delete() },
      { merge: true }
    );
    return newCode;
  });
  return { orgId: orgRef.id, inviteCode: code };
});

// Turns the caller's personal organization into a real, shareable one in
// place (same orgId, so its residents and library entries carry over).
// One transaction: rename + un-personal the org + its first invite code.
exports.upgradePersonalOrganization = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  requireVerified(request);
  const uid = request.auth.uid;
  const name = typeof request.data?.name === 'string' ? request.data.name.trim() : '';
  if (!name) {
    throw new HttpsError('invalid-argument', 'Please enter an organization name.');
  }
  const db = getAdmin().firestore();

  return db.runTransaction(async (tx) => {
    // Reads
    const orgId = (await tx.get(db.doc(`users/${uid}`))).data()?.orgId;
    const orgRef = orgId ? db.doc(`organizations/${orgId}`) : null;
    const org = orgRef ? (await tx.get(orgRef)).data() : null;
    if (!org || org.createdBy !== uid) {
      throw new HttpsError('failed-precondition', 'No organization to upgrade.');
    }
    if (org.isPersonal !== true) {
      throw new HttpsError('failed-precondition', 'Your organization has already been upgraded.');
    }
    const code = await pickFreeInviteCode(tx, db);
    // Writes
    tx.update(orgRef, { name, isPersonal: false });
    // Now running their own org, so drop any request waiting elsewhere.
    const { FieldValue } = require('firebase-admin/firestore');
    tx.update(db.doc(`users/${uid}`), {
      pendingOrgId: FieldValue.delete(),
      pendingSince: FieldValue.delete(),
    });
    writeInviteCode(tx, db, { orgId, code, uid, previous: null });
    return { orgId, inviteCode: code };
  });
});

// Revokes the organization's current invite code and issues a new one —
// e.g. if the old code was shared too widely. Anyone who already joined
// stays joined; the old code just stops working for new people.
// One transaction: new code + private copy + old code revoked.
exports.regenerateInviteCode = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  requireVerified(request);
  const db = getAdmin().firestore();
  const orgId = request.data?.orgId;
  const code = await db.runTransaction(async (tx) => {
    // Ownership re-checked inside the transaction (and refused while the
    // org is being deleted) — see requireOrgOwnerTx.
    const org = await requireOrgOwnerTx(tx, db, orgId, request.auth.uid);
    if (org.isPersonal === true) {
      throw new HttpsError(
        'failed-precondition',
        'Personal organizations do not have invite codes.'
      );
    }
    const previous = (await tx.get(db.doc(`organizations/${orgId}/private/invite`))).data()?.code;
    const newCode = await pickFreeInviteCode(tx, db);
    writeInviteCode(tx, db, { orgId, code: newCode, uid: request.auth.uid, previous });
    return newCode;
  });
  // The code itself is never logged — the log is readable by every
  // administrator, and an old code is still a secret until it expires.
  await logAudit(db, {
    orgId,
    action: ACTIONS.inviteCodeRegenerated,
    actorUid: request.auth.uid,
  });
  return { inviteCode: code };
});

// Username look-ups allowed per network address per window, so the
// username → email mapping can't be harvested by trying names in bulk.
const SIGNIN_LOOKUP_MAX = 20;
const SIGNIN_LOOKUP_WINDOW_MS = 15 * 60 * 1000;

// Sign-in with a username: returns the email the app should pass to
// Firebase Auth. Replaces reading usernames/{name}.email directly, which
// made every account's email public. Here:
// - the email comes from Firebase Auth itself (never from a stored field
//   someone could have set to anything);
// - it only answers for the account's CURRENT username (the one on its
//   profile), so leftover or misleading claims don't resolve;
// - it's rate-limited per network address (a hashed IP, not stored raw);
// - unknown names get the same not-found as a wrong username would, and
//   the app shows its usual "incorrect email or password".
// Callable without being signed in — the person is signing in.
exports.resolveSignInEmail = onCall(async (request) => {
  const key =
    typeof request.data?.username === 'string' ? request.data.username.trim().toLowerCase() : '';
  const notFound = new HttpsError('not-found', 'No account with that username.');
  if (!key || key.includes('/')) throw notFound;
  const admin = getAdmin();
  const db = admin.firestore();

  const forwarded = request.rawRequest?.headers?.['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string' ? forwarded.split(',')[0] : request.rawRequest?.ip) || 'unknown';
  const ipKey = require('crypto').createHash('sha256').update(ip).digest('hex').slice(0, 32);
  const limitRef = db.doc(`rateLimits/signin_${ipKey}`);
  await db.runTransaction(async (tx) => {
    const now = Date.now();
    const data = (await tx.get(limitRef)).data();
    const inWindow = !!data && now - data.windowStart < SIGNIN_LOOKUP_WINDOW_MS;
    const count = inWindow ? data.count : 0;
    if (count >= SIGNIN_LOOKUP_MAX) {
      throw new HttpsError('resource-exhausted', 'Too many attempts. Please try again later.');
    }
    tx.set(limitRef, { windowStart: inWindow ? data.windowStart : now, count: count + 1 });
  });

  const claim = (await db.doc(`usernames/${key}`).get()).data();
  if (!claim?.uid) throw notFound;
  const profile = (await db.doc(`users/${claim.uid}`).get()).data();
  if (
    String(profile?.username ?? '')
      .trim()
      .toLowerCase() !== key
  )
    throw notFound;
  let email;
  try {
    email = (await admin.auth().getUser(claim.uid)).email;
  } catch {
    throw notFound;
  }
  if (!email) throw notFound;
  return { email };
});

// Join attempts allowed per user per window, so invite codes (about 5
// million possibilities) can't be brute-forced through this function.
const JOIN_MAX_ATTEMPTS = 10;
const JOIN_WINDOW_MS = 15 * 60 * 1000;

// Asks to join an organization by its invite code. The code alone doesn't
// grant access: it records a join request (pendingOrgId) that the
// organization's administrator approves or denies in Manage Users
// (approveOrgMember / denyOrgMember). Only approval sets orgId, the field
// every org-scoped rule trusts, so a pending user is a non-member
// everywhere without any rule needing to know about pending status.
// firestore.rules refuse client writes of pendingOrgId (except clearing it
// to cancel), so a request can only be made with a valid code.
exports.joinOrganization = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  requireVerified(request);
  const uid = request.auth.uid;
  const code = normalizeInviteCode(request.data?.code);
  if (!code) {
    throw new HttpsError(
      'invalid-argument',
      'Please enter the 8-character code from your organization, like MGK7-4TXR.'
    );
  }
  const db = getAdmin().firestore();
  const { FieldValue, Timestamp } = require('firebase-admin/firestore');

  // Rate limit — its own transaction, deliberately committed even when the
  // join below fails, since failed attempts are exactly what it counts.
  // rateLimits/* has no client access (see firestore.rules).
  const limitRef = db.doc(`rateLimits/join_${uid}`);
  await db.runTransaction(async (tx) => {
    const now = Date.now();
    const data = (await tx.get(limitRef)).data();
    const inWindow = !!data && now - data.windowStart < JOIN_WINDOW_MS;
    const count = inWindow ? data.count : 0;
    if (count >= JOIN_MAX_ATTEMPTS) {
      throw new HttpsError(
        'resource-exhausted',
        'Too many attempts. Please wait 15 minutes and try again.'
      );
    }
    tx.set(limitRef, { windowStart: inWindow ? data.windowStart : now, count: count + 1 });
  });

  // One message for every "this code doesn't work" case, so the response
  // doesn't reveal whether a code exists but was revoked or expired.
  const notFound = new HttpsError(
    'not-found',
    'No organization found with that code. Please check it and try again.'
  );
  const codeRef = db.doc(`inviteCodes/${code}`);

  // The request itself — one transaction: record it + count the code's use.
  const result = await db.runTransaction(async (tx) => {
    // Reads
    await readUserRequiringNoRealOrg(
      tx,
      db,
      uid,
      "You're already part of an organization. Contact an administrator if you need to switch."
    );
    const invite = (await tx.get(codeRef)).data();
    if (!invite || invite.revoked === true) throw notFound;
    if (invite.expiresAt && invite.expiresAt.toMillis() < Timestamp.now().toMillis()) {
      throw notFound;
    }
    if (typeof invite.maxUses === 'number' && (invite.uses ?? 0) >= invite.maxUses) {
      throw notFound;
    }
    // A deleted org, or one being deleted right now, can't be joined.
    const targetOrg = await tx.get(db.doc(`organizations/${invite.orgId}`));
    if (!targetOrg.exists || targetOrg.data().status === 'deleting') throw notFound;
    // Writes. A new request replaces any earlier one (to this org or
    // another), so each person waits on at most one organization.
    tx.set(
      db.doc(`users/${uid}`),
      { pendingOrgId: invite.orgId, pendingSince: FieldValue.serverTimestamp() },
      { merge: true }
    );
    tx.update(codeRef, { uses: FieldValue.increment(1) });
    return { orgId: invite.orgId, orgName: targetOrg.data().name ?? null };
  });

  // A successful request clears the counter, so honest typos don't pile up.
  await limitRef.delete();
  await logAudit(db, { orgId: result.orgId, action: ACTIONS.memberRequested, actorUid: uid });
  return { orgId: result.orgId, orgName: result.orgName, pending: true };
});

// ---------------------------------------------------------------------------
// Family codes — how a Family Caregiver gets linked to a facility resident.
//
// A Caregiver/Administrator of the resident's facility creates a code on the
// resident's profile (FamilyAccessCard) and gives it to the family member,
// who enters it on Family Mode → My Residents. Redeeming adds them to the
// resident's `familyMembers` list, which firestore.rules / storage.rules
// treat as view-only access plus photo uploads — never profile edits (that
// list is deliberately in none of the residents update branches).
//
// Because a code could be passed on to someone else, each one is
// single-use, expires after FAMILY_CODE_TTL_MS, and making a new code for a
// resident revokes any unused old one. Staff can see and remove every
// linked family member (listFamilyMembers / unlinkFamilyMember).
//
//   familyCodes/{CODE}  { residentId, facilityId, createdBy, createdAt,
//                         expiresAt, used, usedBy?, usedAt?, revoked }
//   — server-only, like inviteCodes (no client access in firestore.rules).
// ---------------------------------------------------------------------------

const FAMILY_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Redeem attempts per user per window — same budget as joinOrganization.
const FAMILY_REDEEM_MAX_ATTEMPTS = 10;
const FAMILY_REDEEM_WINDOW_MS = 15 * 60 * 1000;

// Checks the caller is a Caregiver/Administrator in the resident's own
// facility. The Admin SDK bypasses firestore.rules, so these functions must
// authorise themselves. Returns the resident's data.
async function requireResidentStaff(db, residentId, uid) {
  if (typeof residentId !== 'string' || !residentId || residentId.includes('/')) {
    throw new HttpsError('invalid-argument', 'residentId is required.');
  }
  const [residentSnap, userSnap] = await Promise.all([
    db.doc(`residents/${residentId}`).get(),
    db.doc(`users/${uid}`).get(),
  ]);
  const resident = residentSnap.data();
  const user = userSnap.data() ?? {};
  if (!resident) throw new HttpsError('not-found', 'This resident could not be found.');
  if (
    !['Caregiver', 'Administrator'].includes(user.role) ||
    !resident.facilityId ||
    user.orgId !== resident.facilityId
  ) {
    throw new HttpsError(
      'permission-denied',
      "Only caregivers and administrators in this resident's organization can do this."
    );
  }
  return resident;
}

// Creates a new single-use family code for a resident, revoking any unused
// earlier one. Returns the code and when it expires (ms since epoch).
exports.createFamilyCode = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  requireVerified(request);
  const uid = request.auth.uid;
  const residentId = request.data?.residentId;
  const db = getAdmin().firestore();
  const { FieldValue, Timestamp } = require('firebase-admin/firestore');
  const resident = await requireResidentStaff(db, residentId, uid);
  const expiresAt = Timestamp.fromMillis(Date.now() + FAMILY_CODE_TTL_MS);

  const code = await db.runTransaction(async (tx) => {
    // Reads: the org (refused while being deleted), the resident's earlier
    // codes to revoke, and a free code. A single-field query, so no
    // composite index is needed; used/revoked are filtered here.
    const org = await tx.get(db.doc(`organizations/${resident.facilityId}`));
    if (!org.exists || org.data().status === 'deleting') {
      throw new HttpsError('failed-precondition', 'This organization is being deleted.');
    }
    const previous = await tx.get(
      db.collection('familyCodes').where('residentId', '==', residentId)
    );
    let newCode = null;
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS && !newCode; attempt += 1) {
      const candidate = randomInviteCode();
      if (!(await tx.get(db.doc(`familyCodes/${candidate}`))).exists) newCode = candidate;
    }
    if (!newCode) {
      throw new HttpsError(
        'resource-exhausted',
        "We couldn't create a family code just now. Please try again."
      );
    }
    // Writes
    for (const snap of previous.docs) {
      const d = snap.data();
      if (!d.used && !d.revoked) tx.update(snap.ref, { revoked: true });
    }
    tx.create(db.doc(`familyCodes/${newCode}`), {
      residentId,
      facilityId: resident.facilityId,
      createdBy: uid,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt,
      used: false,
      revoked: false,
    });
    return newCode;
  });

  // The code itself is never logged (see regenerateInviteCode).
  await logAudit(db, {
    orgId: resident.facilityId,
    action: ACTIONS.familyCodeCreated,
    actorUid: uid,
    detail: resident.name ?? null,
  });
  return { code, expiresAt: expiresAt.toMillis() };
});

// Links the calling Family Caregiver to the resident a family code belongs
// to. Rate-limited like joinOrganization, and every "doesn't work" case
// (unknown, used, revoked, expired, resident gone) gets the same message.
exports.redeemFamilyCode = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  requireVerified(request);
  const uid = request.auth.uid;
  const code = normalizeInviteCode(request.data?.code);
  if (!code) {
    throw new HttpsError(
      'invalid-argument',
      "Please enter the 8-character family code from the resident's care team."
    );
  }
  const db = getAdmin().firestore();
  const { FieldValue, Timestamp } = require('firebase-admin/firestore');

  // Only Family Caregivers: staff get access through their facility, and a
  // Volunteer must not be able to give themselves a direct link this way.
  const role = (await db.doc(`users/${uid}`).get()).data()?.role;
  if (role !== 'Family Caregiver') {
    throw new HttpsError('permission-denied', 'Family codes are for family members.');
  }

  // Rate limit — committed even when the redeem fails (see joinOrganization).
  const limitRef = db.doc(`rateLimits/family_${uid}`);
  await db.runTransaction(async (tx) => {
    const now = Date.now();
    const data = (await tx.get(limitRef)).data();
    const inWindow = !!data && now - data.windowStart < FAMILY_REDEEM_WINDOW_MS;
    const count = inWindow ? data.count : 0;
    if (count >= FAMILY_REDEEM_MAX_ATTEMPTS) {
      throw new HttpsError(
        'resource-exhausted',
        'Too many attempts. Please wait 15 minutes and try again.'
      );
    }
    tx.set(limitRef, { windowStart: inWindow ? data.windowStart : now, count: count + 1 });
  });

  const notFound = new HttpsError(
    'not-found',
    "That family code didn't work. It may have been used already or expired. Ask the care team for a new one."
  );
  const codeRef = db.doc(`familyCodes/${code}`);

  const resident = await db.runTransaction(async (tx) => {
    // Reads
    const entry = (await tx.get(codeRef)).data();
    if (!entry || entry.used || entry.revoked) throw notFound;
    if (entry.expiresAt.toMillis() < Timestamp.now().toMillis()) throw notFound;
    const residentRef = db.doc(`residents/${entry.residentId}`);
    const residentSnap = await tx.get(residentRef);
    const org = await tx.get(db.doc(`organizations/${entry.facilityId}`));
    if (!residentSnap.exists || !org.exists || org.data().status === 'deleting') throw notFound;
    // Writes: link and use up the code, together.
    tx.update(residentRef, { familyMembers: FieldValue.arrayUnion(uid) });
    tx.update(codeRef, { used: true, usedBy: uid, usedAt: FieldValue.serverTimestamp() });
    return { id: residentSnap.id, name: residentSnap.data().name ?? null, orgId: entry.facilityId };
  });

  await limitRef.delete();
  await logAudit(db, {
    orgId: resident.orgId,
    action: ACTIONS.familyLinked,
    actorUid: uid,
    detail: resident.name,
  });
  return { residentId: resident.id, residentName: resident.name };
});

// The family members linked to a resident, for FamilyAccessCard. A function
// because firestore.rules only let users read their own profile. Names only.
exports.listFamilyMembers = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  requireVerified(request);
  const db = getAdmin().firestore();
  const resident = await requireResidentStaff(db, request.data?.residentId, request.auth.uid);
  const uids = Array.isArray(resident.familyMembers) ? resident.familyMembers : [];
  const snaps = uids.length ? await db.getAll(...uids.map((id) => db.doc(`users/${id}`))) : [];
  return {
    members: snaps
      .map((s) => ({
        uid: s.id,
        name: (s.exists && (s.data().fullName || s.data().username)) || 'Unnamed family member',
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
});

// Removes a family member's link to a resident (FamilyAccessCard → Remove).
exports.unlinkFamilyMember = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  requireVerified(request);
  const { residentId, memberUid } = request.data ?? {};
  if (typeof memberUid !== 'string' || !memberUid) {
    throw new HttpsError('invalid-argument', 'memberUid is required.');
  }
  const db = getAdmin().firestore();
  const { FieldValue } = require('firebase-admin/firestore');
  const resident = await requireResidentStaff(db, residentId, request.auth.uid);
  await db
    .doc(`residents/${residentId}`)
    .update({ familyMembers: FieldValue.arrayRemove(memberUid) });
  await logAudit(db, {
    orgId: resident.facilityId,
    action: ACTIONS.familyUnlinked,
    actorUid: request.auth.uid,
    targetUid: memberUid,
    detail: resident.name ?? null,
  });
  return { ok: true };
});
