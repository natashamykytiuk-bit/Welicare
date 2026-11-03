// Account-level callables: deleting your own account, and resolving a
// username to its email for sign-in.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { requireRecentLogin } = require('./authChecks');
const { ACTIONS, logAudit, orgIsLogged } = require('./auditLog');
const { otherAdmins } = require('./organizations');
const { deleteResidentPhotos, getAdmin, trackedBulkWriter } = require('./shared');

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

// Username sign-in attempts allowed per window: per network address, so
// names and passwords can't be tried in bulk from one place, and per
// username, so one account's password can't be guessed from many places.
const SIGNIN_LOOKUP_MAX = 20;
const SIGNIN_USERNAME_MAX = 10;
const SIGNIN_LOOKUP_WINDOW_MS = 15 * 60 * 1000;

// The project's web API key — the same public value the app ships in
// firebaseConfig.js (it identifies the project; it isn't a secret). Needed
// to ask Firebase Auth to check a password, which the Admin SDK can't do.
const WEB_API_KEY = 'AIzaSyDwkxmWCgv7QMUEVj-1Br6gOOu_qfL_b6E';

// Counts one attempt against rateLimits/{id}, refusing with
// resource-exhausted once `max` is reached in the window. Its own
// transaction, committed even when the sign-in then fails — failed attempts
// are exactly what it counts (see joinOrganization). Returns the counter's
// ref so a caller can clear it after a success.
async function countSignInAttempt(db, id, max) {
  const limitRef = db.doc(`rateLimits/${id}`);
  await db.runTransaction(async (tx) => {
    const now = Date.now();
    const data = (await tx.get(limitRef)).data();
    const inWindow = !!data && now - data.windowStart < SIGNIN_LOOKUP_WINDOW_MS;
    const count = inWindow ? data.count : 0;
    if (count >= max) {
      throw new HttpsError('resource-exhausted', 'Too many attempts. Please try again later.');
    }
    tx.set(limitRef, { windowStart: inWindow ? data.windowStart : now, count: count + 1 });
  });
  return limitRef;
}

// Asks Firebase Auth whether `password` is right for `email`, through the
// same sign-in endpoint the app itself uses (against the Auth emulator in
// tests). Returns true/false; throws resource-exhausted if Firebase is
// throttling the account, and unavailable if the check couldn't be made —
// a failed check must never be mistaken for a correct password. The
// password is only passed on, never logged or stored.
async function passwordIsCorrect(email, password) {
  const emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const base = emulator
    ? `http://${emulator}/identitytoolkit.googleapis.com`
    : 'https://identitytoolkit.googleapis.com';
  let res;
  try {
    res = await fetch(`${base}/v1/accounts:signInWithPassword?key=${WEB_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // returnSecureToken: false — only the yes/no is wanted, not a session.
      body: JSON.stringify({ email, password, returnSecureToken: false }),
    });
  } catch (e) {
    console.error('[resolveSignInEmail] password check could not be made:', e?.message);
    throw new HttpsError('unavailable', 'Sign-in is unavailable right now. Please try again.');
  }
  if (res.ok) return true;
  const reason = String((await res.json().catch(() => null))?.error?.message ?? '');
  if (reason.startsWith('TOO_MANY_ATTEMPTS')) {
    throw new HttpsError('resource-exhausted', 'Too many attempts. Please try again later.');
  }
  // Wrong password, or an account that can't sign in this way (disabled,
  // no password): all simply "not correct".
  if (/^(INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND|USER_DISABLED)/.test(reason)) {
    return false;
  }
  console.error('[resolveSignInEmail] unexpected password check reply:', res.status, reason);
  throw new HttpsError('unavailable', 'Sign-in is unavailable right now. Please try again.');
}

// Sign-in with a username: checks the username AND password, and only then
// returns the email the app should pass to Firebase Auth.
//
// It used to answer with the email for any username, to anyone — so a
// person's email address could be looked up from their username alone. Now
// the email only goes to someone who already knows the account's password
// (and so could read it in Settings anyway). Also:
// - the email comes from Firebase Auth itself (never from a stored field
//   someone could have set to anything);
// - it only answers for the account's CURRENT username (the one on its
//   profile), so leftover or misleading claims don't resolve;
// - it's rate-limited per network address (a hashed IP, not stored raw)
//   and per username;
// - an unknown username and a wrong password get the same not-found, and
//   the app shows its usual "incorrect email or password".
// Callable without being signed in — the person is signing in. Builds from
// before this change send no password and so always get not-found; signing
// in with the email address still works for them.
exports.resolveSignInEmail = onCall(async (request) => {
  const key =
    typeof request.data?.username === 'string' ? request.data.username.trim().toLowerCase() : '';
  const password = request.data?.password;
  const notFound = new HttpsError('not-found', 'Incorrect username or password.');
  if (!key || key.includes('/') || key.length > 200) throw notFound;
  if (typeof password !== 'string' || !password || password.length > 1000) throw notFound;
  const admin = getAdmin();
  const db = admin.firestore();
  const hash = (value) =>
    require('crypto').createHash('sha256').update(value).digest('hex').slice(0, 32);

  // The LAST address in X-Forwarded-For, not the first: Google's front end
  // appends the address it actually saw to whatever the caller sent, so the
  // first entry is caller-chosen and a different made-up value per request
  // would get a fresh limit every time.
  const forwarded = request.rawRequest?.headers?.['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string' ? forwarded.split(',').pop().trim() : request.rawRequest?.ip) ||
    'unknown';
  await countSignInAttempt(db, `signin_${hash(ip)}`, SIGNIN_LOOKUP_MAX);
  // Counted whether or not the username exists, so the limit itself doesn't
  // reveal which names are real.
  const usernameLimitRef = await countSignInAttempt(
    db,
    `signinuser_${hash(key)}`,
    SIGNIN_USERNAME_MAX
  );

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
  if (!(await passwordIsCorrect(email, password))) throw notFound;
  // A correct sign-in clears this username's counter, so honest typos
  // don't pile up (the per-address one runs out by itself).
  await usernameLimitRef.delete();
  return { email };
});
