// Resident operations that firestore.rules deliberately leave to the
// server: family codes (linking a Family Caregiver to a resident),
// permanent deletion, and moving an at-home resident into a facility.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { requireVerified } = require('./authChecks');
const { ACTIONS, logAudit, orgIsLogged } = require('./auditLog');
const { isAtHomeResident, mayDeleteResident } = require('./residentAccess');
const {
  JOIN_MAX_ATTEMPTS,
  JOIN_WINDOW_MS,
  MAX_CODE_ATTEMPTS,
  normalizeInviteCode,
  randomInviteCode,
  requireOrgOwnerTx,
} = require('./organizations');
const { deleteResidentPhotos, getAdmin, trackedBulkWriter } = require('./shared');

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

// ---------------------------------------------------------------------------
// Residents: permanent deletion, and moving an at-home resident into a
// facility.
//
// Both are Cloud Functions because the app can't do either under
// firestore.rules, on purpose:
// - Deleting has to remove far more than the resident doc (see
//   deleteResident), including files in Storage and other people's records.
// - Moving changes facilityId and who is linked to the resident — fields the
//   rules never let the app write, since they decide who has access.
// ---------------------------------------------------------------------------

// Checks a residentId from the app is a plain document id (never a path).
function requireResidentId(residentId) {
  if (typeof residentId !== 'string' || !residentId || residentId.includes('/')) {
    throw new HttpsError('invalid-argument', 'residentId is required.');
  }
  return residentId;
}

// Permanently deletes a resident and everything held about them:
// - the life story and safety notes (residents/{id}/private/*),
// - the photo album and profile photo: the photos/* docs and every file
//   under residents/{id}/ in Cloud Storage,
// - their family codes, so an unused code can't point at nothing,
// - the resident doc itself, last — so if anything above fails, the
//   resident is still there and the delete can simply be run again.
//
// Activity records (activitySessions) are kept, because the facility's
// totals and volunteers' hours are counted from them — but each one's
// residentId is cleared, so nothing in them points at the person any more.
// They never held a name or any profile details to begin with.
//
// Who may delete is decided by mayDeleteResident (residentAccess.js): an
// Administrator of the resident's facility, or the Family Caregiver who
// added an at-home resident. The app shows a "this is permanent" warning
// first; nothing here can be undone.
exports.deleteResident = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  requireVerified(request);
  const uid = request.auth.uid;
  const residentId = requireResidentId(request.data?.residentId);
  const admin = getAdmin();
  const db = admin.firestore();
  const residentRef = db.doc(`residents/${residentId}`);

  const [residentSnap, userSnap] = await Promise.all([
    residentRef.get(),
    db.doc(`users/${uid}`).get(),
  ]);
  const resident = residentSnap.data();
  // One message whether the resident doesn't exist or the caller isn't
  // allowed, so the reply doesn't confirm which ids are real.
  const refused = new HttpsError('permission-denied', "You can't delete this resident.");
  if (!resident) throw refused;
  const org = resident.facilityId
    ? ((await db.doc(`organizations/${resident.facilityId}`).get()).data() ?? null)
    : null;
  if (!mayDeleteResident(resident, userSnap.data(), uid, org)) throw refused;

  // Everything except the resident doc, every write checked
  // (trackedBulkWriter). All of it is safe to repeat.
  const writer = trackedBulkWriter(db, 'deleteResident');
  await deleteResidentPhotos(admin, writer, residentRef);
  writer.delete(residentRef.collection('private').doc('lifeStory'));
  writer.delete(residentRef.collection('private').doc('safety'));
  // Single-field queries, so no composite index is needed.
  const [codes, sessions] = await Promise.all([
    db.collection('familyCodes').where('residentId', '==', residentId).get(),
    db.collection('activitySessions').where('residentId', '==', residentId).get(),
  ]);
  for (const snap of codes.docs) writer.delete(snap.ref);
  for (const snap of sessions.docs) writer.update(snap.ref, { residentId: null });
  await writer.finish();

  // Only now the resident itself.
  await residentRef.delete();

  // Logged here (with who did it) rather than by the auditResidentDeleted
  // trigger, which can't tell who called a function.
  if (await orgIsLogged(db, resident.facilityId)) {
    await logAudit(db, {
      orgId: resident.facilityId,
      action: ACTIONS.residentDeleted,
      actorUid: uid,
      targetUid: null,
      targetName: resident.name ?? null,
    });
  }
  return { ok: true, sessionsKept: sessions.size };
});

// Clears a move request from a resident doc (cancelled, denied, or done).
function clearedMoveRequest(FieldValue) {
  return {
    pendingFacilityId: FieldValue.delete(),
    pendingMoveBy: FieldValue.delete(),
    pendingMoveAt: FieldValue.delete(),
  };
}

// Asks to move one at-home resident into a care facility, using the
// facility's invite code. This is how a Family Caregiver connects a relative
// they've been looking after at home to the care home they're moving into —
// per resident, so another relative can stay at home and fully theirs.
//
// Two steps, because the family member is giving something up:
//   1. Called without `confirmed`: checks everything and returns the
//      organization's name with needsConfirmation — nothing is written. The
//      app then shows the "you'll be able to view but not edit" warning.
//   2. Called again with confirmed: true: records the request on the
//      resident (pendingFacilityId / pendingMoveBy / pendingMoveAt).
// Even then nothing moves: the facility's administrator approves it in
// Manage Users (approveResidentMove), the same way a staff join request is
// approved — otherwise anyone holding a facility's code could push
// residents into it.
//
// Shares joinOrganization's rate limit, since both guess at invite codes,
// and gives the same reply for every "this code doesn't work" case.
exports.requestResidentMove = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  requireVerified(request);
  const uid = request.auth.uid;
  const residentId = requireResidentId(request.data?.residentId);
  const confirmed = request.data?.confirmed === true;
  const code = normalizeInviteCode(request.data?.code);
  if (!code) {
    throw new HttpsError(
      'invalid-argument',
      'Please enter the 8-character code from the organization, like MGK7-4TXR.'
    );
  }
  const db = getAdmin().firestore();
  const { FieldValue, Timestamp } = require('firebase-admin/firestore');

  // Rate limit — committed even when the request below fails (see
  // joinOrganization, whose counter this shares).
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

  const notFound = new HttpsError(
    'not-found',
    'No organization found with that code. Please check it and try again.'
  );
  const codeRef = db.doc(`inviteCodes/${code}`);
  const residentRef = db.doc(`residents/${residentId}`);

  const result = await db.runTransaction(async (tx) => {
    // Reads
    const [residentSnap, userSnap] = await Promise.all([
      tx.get(residentRef),
      tx.get(db.doc(`users/${uid}`)),
    ]);
    const resident = residentSnap.data();
    const isCreator = !!resident && (resident.createdBy === uid || resident.caregiverId === uid);
    if (userSnap.data()?.role !== 'Family Caregiver' || !isCreator) {
      throw new HttpsError(
        'permission-denied',
        'Only the family member who added this resident can move them.'
      );
    }
    const homeOrg = resident.facilityId
      ? ((await tx.get(db.doc(`organizations/${resident.facilityId}`))).data() ?? null)
      : null;
    if (!isAtHomeResident(resident, homeOrg, uid)) {
      throw new HttpsError(
        'failed-precondition',
        'This resident is already part of an organization.'
      );
    }
    if (resident.archived === true) {
      throw new HttpsError(
        'failed-precondition',
        'This resident is archived. Restore them before moving them.'
      );
    }
    const invite = (await tx.get(codeRef)).data();
    if (!invite || invite.revoked === true) throw notFound;
    if (invite.expiresAt && invite.expiresAt.toMillis() < Timestamp.now().toMillis()) {
      throw notFound;
    }
    if (typeof invite.maxUses === 'number' && (invite.uses ?? 0) >= invite.maxUses) {
      throw notFound;
    }
    // A deleted org, or one being deleted right now, can't take residents;
    // nor can somebody's family organization.
    const targetOrg = await tx.get(db.doc(`organizations/${invite.orgId}`));
    if (
      !targetOrg.exists ||
      targetOrg.data().status === 'deleting' ||
      targetOrg.data().isPersonal === true
    ) {
      throw notFound;
    }
    const orgName = targetOrg.data().name ?? null;
    // Step 1: everything checks out, but the family member hasn't seen the
    // warning yet — tell the app what to ask, and write nothing.
    if (!confirmed) return { needsConfirmation: true, pending: false, orgId: null, orgName };
    // Step 2 writes. A new request replaces an earlier one for this resident.
    tx.update(residentRef, {
      pendingFacilityId: invite.orgId,
      pendingMoveBy: uid,
      pendingMoveAt: FieldValue.serverTimestamp(),
    });
    tx.update(codeRef, { uses: FieldValue.increment(1) });
    return {
      needsConfirmation: false,
      pending: true,
      orgId: invite.orgId,
      orgName,
      residentName: resident.name ?? null,
    };
  });

  // A working code clears the counter, so honest typos don't pile up.
  await limitRef.delete();
  if (result.pending) {
    await logAudit(db, {
      orgId: result.orgId,
      action: ACTIONS.residentMoveRequested,
      actorUid: uid,
      detail: result.residentName,
    });
  }
  return {
    needsConfirmation: result.needsConfirmation,
    pending: result.pending,
    orgName: result.orgName,
  };
});

// Withdraws a move request that hasn't been decided yet (My Residents →
// Cancel request). Only the family member who made it; the resident simply
// stays at home.
exports.cancelResidentMove = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  requireVerified(request);
  const uid = request.auth.uid;
  const residentId = requireResidentId(request.data?.residentId);
  const db = getAdmin().firestore();
  const { FieldValue } = require('firebase-admin/firestore');
  const residentRef = db.doc(`residents/${residentId}`);
  await db.runTransaction(async (tx) => {
    const resident = (await tx.get(residentRef)).data();
    if (!resident || resident.pendingMoveBy !== uid || !resident.pendingFacilityId) {
      throw new HttpsError('not-found', 'That request is no longer waiting for approval.');
    }
    tx.update(residentRef, clearedMoveRequest(FieldValue));
  });
  return { ok: true };
});

// Approves a move request (Manage Users → Approve): the resident joins this
// facility, and from this moment its Caregivers and Administrators keep the
// profile.
// - facilityId becomes this organization, so staff (and volunteers) see the
//   resident like any other.
// - Ownership (createdBy / caregiverId) passes to the administrator and the
//   family member comes off assignedCaregivers — the rules treat a creator
//   specially, and the family member must not keep that.
// - The family member goes on familyMembers instead: exactly the view-only
//   link a family code gives (see redeemFamilyCode), which staff can see and
//   remove from the resident's Family access card.
// Owner-only, and checked in one transaction against current data, so a
// request that was cancelled a moment ago isn't approved by mistake.
exports.approveResidentMove = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  requireVerified(request);
  const ownerUid = request.auth.uid;
  const orgId = request.data?.orgId;
  const residentId = requireResidentId(request.data?.residentId);
  const db = getAdmin().firestore();
  const { FieldValue } = require('firebase-admin/firestore');
  const residentRef = db.doc(`residents/${residentId}`);
  const moved = await db.runTransaction(async (tx) => {
    await requireOrgOwnerTx(tx, db, orgId, ownerUid);
    const resident = (await tx.get(residentRef)).data();
    if (!resident || resident.pendingFacilityId !== orgId || !resident.pendingMoveBy) {
      throw new HttpsError('not-found', 'That request is no longer waiting for approval.');
    }
    // It may have been moved somewhere else since the request was made.
    const homeOrg = resident.facilityId
      ? ((await tx.get(db.doc(`organizations/${resident.facilityId}`))).data() ?? null)
      : null;
    if (!isAtHomeResident(resident, homeOrg, resident.pendingMoveBy)) {
      throw new HttpsError(
        'failed-precondition',
        'This resident is already part of an organization.'
      );
    }
    tx.update(residentRef, {
      facilityId: orgId,
      createdBy: ownerUid,
      caregiverId: ownerUid,
      assignedCaregivers: [],
      familyMembers: FieldValue.arrayUnion(resident.pendingMoveBy),
      ...clearedMoveRequest(FieldValue),
    });
    return { familyUid: resident.pendingMoveBy, name: resident.name ?? null };
  });
  await logAudit(db, {
    orgId,
    action: ACTIONS.residentMoved,
    actorUid: ownerUid,
    targetUid: moved.familyUid,
    detail: moved.name,
  });
  return { ok: true };
});

// Declines a move request (Manage Users → Deny). Only the request is
// cleared; the resident stays at home with their family member, unchanged.
exports.denyResidentMove = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  requireVerified(request);
  const orgId = request.data?.orgId;
  const residentId = requireResidentId(request.data?.residentId);
  const db = getAdmin().firestore();
  const { FieldValue } = require('firebase-admin/firestore');
  const residentRef = db.doc(`residents/${residentId}`);
  const denied = await db.runTransaction(async (tx) => {
    await requireOrgOwnerTx(tx, db, orgId, request.auth.uid);
    const resident = (await tx.get(residentRef)).data();
    if (!resident || resident.pendingFacilityId !== orgId) {
      throw new HttpsError('not-found', 'That request is no longer waiting for approval.');
    }
    tx.update(residentRef, clearedMoveRequest(FieldValue));
    return { familyUid: resident.pendingMoveBy ?? null, name: resident.name ?? null };
  });
  await logAudit(db, {
    orgId,
    action: ACTIONS.residentMoveDenied,
    actorUid: request.auth.uid,
    targetUid: denied.familyUid,
    detail: denied.name,
  });
  return { ok: true };
});
