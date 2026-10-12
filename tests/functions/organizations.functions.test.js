// Tests for the organization Cloud Functions, focused on the transaction
// guarantee: every flow either writes everything or nothing.
//
// Run with `npm run test:functions`. It starts the Auth, Firestore and
// Functions emulators under the "demo-welicare" project (which can never
// reach real data), runs this file, and shuts them down.
//
// Two ways this file talks to the emulators:
// - As an app user: the regular Firebase client SDK, signed in as a test
//   user, calling the functions exactly like the app does.
// - As an admin: firebase-admin (from functions/node_modules), to seed data
//   and to inspect what was actually written, bypassing the rules.
//
// "Nothing was written" checks work by counting documents before and after
// a call that's expected to fail.

const path = require('path');
const { initializeApp } = require('firebase/app');
const {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
} = require('firebase/auth');
const { connectFunctionsEmulator, getFunctions, httpsCallable } = require('firebase/functions');

const fromFunctions = (id) =>
  require(require.resolve(id, { paths: [path.join(__dirname, '..', '..', 'functions')] }));
// firebase-admin 13+ has no admin.firestore() namespace: each service is
// imported from its own subpath.
const { initializeApp: initializeAdminApp, deleteApp } = fromFunctions('firebase-admin/app');
const { getFirestore, Timestamp } = fromFunctions('firebase-admin/firestore');

const PROJECT = 'demo-welicare';

// Admin-level Auth operations go straight to the Auth emulator's REST API
// (the "owner" token is its admin credential) rather than through
// firebase-admin/auth: that module pulls in an ES-module-only dependency
// (jose) that Jest can't load without extra transform config.
async function authEmulator(method, body) {
  const res = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:${method}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) throw new Error(`Auth emulator ${method} failed: ${await res.text()}`);
  return res.json();
}
let adminApp;
let adminDb;
let auth;
let functions;
let userCount = 0;

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('Run these through `npm run test:functions` so the emulators are running.');
  }
  adminApp = initializeAdminApp({ projectId: PROJECT });
  adminDb = getFirestore(adminApp);
  const app = initializeApp({ projectId: PROJECT, apiKey: 'fake-key-for-emulator' });
  auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, {
    disableWarnings: true,
  });
  functions = getFunctions(app, 'northamerica-northeast1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
});

afterAll(async () => {
  await signOut(auth);
  await deleteApp(adminApp);
});

/** Signs up a fresh test user with the given users/{uid} data; returns uid. */
async function newUser(data, { verified = true } = {}) {
  await signOut(auth);
  userCount += 1;
  const { user } = await createUserWithEmailAndPassword(
    auth,
    `fn-${Date.now()}-${userCount}@example.test`,
    'test-password'
  );
  await adminDb.doc(`users/${user.uid}`).set(data);
  // The organization functions require a verified email. Mark the test
  // user verified, then refresh their token so it carries the claim.
  if (verified) {
    await authEmulator('update', { localId: user.uid, emailVerified: true });
    await user.getIdToken(true);
  }
  return user.uid;
}

const call = (name, data) => httpsCallable(functions, name)(data);
/** Resolves to the error's code ("functions/not-found", …) or "ok". */
const outcome = (promise) =>
  promise.then(
    () => 'ok',
    (e) => e.code
  );
const count = async (collection) => (await adminDb.collection(collection).get()).size;

describe('createOrganization', () => {
  it('writes the org, its invite code, the private copy and the user link together', async () => {
    const uid = await newUser({ role: 'Administrator' });
    const { orgId, inviteCode } = (await call('createOrganization', { name: 'Maple' })).data;

    const org = (await adminDb.doc(`organizations/${orgId}`).get()).data();
    expect(org).toMatchObject({ name: 'Maple', isPersonal: false, createdBy: uid });
    // Org docs are readable by id, so the creator's email isn't stored.
    expect(org).not.toHaveProperty('email');
    expect((await adminDb.doc(`inviteCodes/${inviteCode}`).get()).data().orgId).toBe(orgId);
    expect((await adminDb.doc(`organizations/${orgId}/private/invite`).get()).data().code).toBe(
      inviteCode
    );
    expect((await adminDb.doc(`users/${uid}`).get()).data().orgId).toBe(orgId);
  });

  it('writes nothing at all when it fails partway', async () => {
    // A user already in a real org is refused inside the transaction.
    const realOrg = adminDb.collection('organizations').doc();
    await realOrg.set({ name: 'Existing', isPersonal: false, createdBy: 'someone' });
    await newUser({ role: 'Administrator', orgId: realOrg.id });

    const orgsBefore = await count('organizations');
    const codesBefore = await count('inviteCodes');
    expect(await outcome(call('createOrganization', { name: 'Second' }))).toBe(
      'functions/failed-precondition'
    );
    expect(await count('organizations')).toBe(orgsBefore);
    expect(await count('inviteCodes')).toBe(codesBefore);
  });
});

describe('joinOrganization', () => {
  let orgId;
  let code;
  beforeAll(async () => {
    await newUser({ role: 'Administrator' });
    ({ orgId, inviteCode: code } = (await call('createOrganization', { name: 'Oak' })).data);
  });

  it('records a request (not membership) and counts the use in one step', async () => {
    const uid = await newUser({ role: 'Caregiver' });
    const result = (await call('joinOrganization', { code })).data;
    expect(result).toMatchObject({ orgId, orgName: 'Oak', pending: true });
    const user = (await adminDb.doc(`users/${uid}`).get()).data();
    // Waiting for approval: no orgId yet, so no org-scoped access.
    expect(user.orgId).toBeUndefined();
    expect(user.pendingOrgId).toBe(orgId);
    expect(user.pendingSince).toBeTruthy();
    expect((await adminDb.doc(`inviteCodes/${code}`).get()).data().uses).toBe(1);
  });

  it('leaves the user and the code untouched when the code is revoked', async () => {
    const revoked = 'RV-1234';
    await adminDb.doc(`inviteCodes/${revoked}`).set({ orgId, revoked: true, uses: 0 });
    const uid = await newUser({ role: 'Caregiver' });

    expect(await outcome(call('joinOrganization', { code: revoked }))).toBe('functions/not-found');
    expect((await adminDb.doc(`users/${uid}`).get()).data().orgId).toBeUndefined();
    expect((await adminDb.doc(`users/${uid}`).get()).data().pendingOrgId).toBeUndefined();
    expect((await adminDb.doc(`inviteCodes/${revoked}`).get()).data().uses).toBe(0);
  });

  it('refuses someone already in a real organization, without moving them', async () => {
    const otherOrg = adminDb.collection('organizations').doc();
    await otherOrg.set({ name: 'Elm', isPersonal: false, createdBy: 'x' });
    const uid = await newUser({ role: 'Caregiver', orgId: otherOrg.id });

    expect(await outcome(call('joinOrganization', { code }))).toBe('functions/failed-precondition');
    expect((await adminDb.doc(`users/${uid}`).get()).data().orgId).toBe(otherOrg.id);
  });
});

describe('join approval (approveOrgMember / denyOrgMember)', () => {
  it('the owner sees requests, and approving makes the person a member', async () => {
    const ownerUid = await newUser({ role: 'Administrator' });
    const owner = auth.currentUser;
    const { orgId, inviteCode } = (await call('createOrganization', { name: 'Rowan' })).data;
    const uid = await newUser({ role: 'Volunteer', fullName: 'Vera' });
    await call('joinOrganization', { code: inviteCode });

    // The person asking can't approve themselves.
    expect(await outcome(call('approveOrgMember', { orgId, memberUid: uid }))).toBe(
      'functions/permission-denied'
    );

    await signOut(auth);
    await auth.updateCurrentUser(owner);
    const listed = (await call('listOrgMembers', { orgId })).data;
    expect(listed.members).toEqual([]);
    expect(listed.pending).toMatchObject([{ uid, name: 'Vera', role: 'Volunteer' }]);

    expect(await outcome(call('approveOrgMember', { orgId, memberUid: uid }))).toBe('ok');
    const user = (await adminDb.doc(`users/${uid}`).get()).data();
    expect(user.orgId).toBe(orgId);
    expect(user.pendingOrgId).toBeUndefined();
    expect(user.pendingSince).toBeUndefined();
    // Approving again finds nothing waiting.
    expect(await outcome(call('approveOrgMember', { orgId, memberUid: uid }))).toBe(
      'functions/not-found'
    );
    expect(ownerUid).toBeTruthy();
  });

  it('denying clears the request and grants nothing', async () => {
    await newUser({ role: 'Administrator' });
    const owner = auth.currentUser;
    const { orgId, inviteCode } = (await call('createOrganization', { name: 'Yew' })).data;
    const uid = await newUser({ role: 'Caregiver' });
    await call('joinOrganization', { code: inviteCode });

    await signOut(auth);
    await auth.updateCurrentUser(owner);
    expect(await outcome(call('denyOrgMember', { orgId, memberUid: uid }))).toBe('ok');
    const user = (await adminDb.doc(`users/${uid}`).get()).data();
    expect(user.orgId).toBeUndefined();
    expect(user.pendingOrgId).toBeUndefined();
  });

  it("can't approve a request made to a different organization", async () => {
    await newUser({ role: 'Administrator' });
    const ownerA = auth.currentUser;
    const orgA = (await call('createOrganization', { name: 'Alder' })).data.orgId;
    await newUser({ role: 'Administrator' });
    const { inviteCode: codeB } = (await call('createOrganization', { name: 'Beech' })).data;
    const uid = await newUser({ role: 'Caregiver' });
    await call('joinOrganization', { code: codeB });

    await signOut(auth);
    await auth.updateCurrentUser(ownerA);
    expect(await outcome(call('approveOrgMember', { orgId: orgA, memberUid: uid }))).toBe(
      'functions/not-found'
    );
    expect((await adminDb.doc(`users/${uid}`).get()).data().orgId).toBeUndefined();
  });

  it('deleting the organization drops requests waiting on it', async () => {
    await newUser({ role: 'Administrator' });
    const owner = auth.currentUser;
    const { orgId, inviteCode } = (await call('createOrganization', { name: 'Larch' })).data;
    const uid = await newUser({ role: 'Caregiver' });
    await call('joinOrganization', { code: inviteCode });

    await signOut(auth);
    await auth.updateCurrentUser(owner);
    expect(await outcome(call('deleteOrganization', { orgId }))).toBe('ok');
    expect((await adminDb.doc(`users/${uid}`).get()).data().pendingOrgId).toBeUndefined();
  });
});

describe('regenerateInviteCode', () => {
  it('issues a new code and revokes the old one together', async () => {
    await newUser({ role: 'Administrator' });
    const { orgId, inviteCode: oldCode } = (await call('createOrganization', { name: 'Birch' }))
      .data;

    const { inviteCode: newCode } = (await call('regenerateInviteCode', { orgId })).data;

    expect(newCode).not.toBe(oldCode);
    expect((await adminDb.doc(`inviteCodes/${oldCode}`).get()).data().revoked).toBe(true);
    expect((await adminDb.doc(`inviteCodes/${newCode}`).get()).data()).toMatchObject({
      orgId,
      revoked: false,
    });
    expect((await adminDb.doc(`organizations/${orgId}/private/invite`).get()).data().code).toBe(
      newCode
    );
  });
});

// A Family Caregiver's organization is always their own family one. They
// never join or create a facility — they connect one resident at a time
// (family codes, or the resident moves below) — and the old "upgrade my
// personal organization" function is gone.
describe('family accounts and organizations', () => {
  it('a Family Caregiver cannot join an organization with its invite code', async () => {
    await newUser({ role: 'Administrator' });
    const { inviteCode } = (await call('createOrganization', { name: 'Cedar' })).data;
    const uid = await newUser({ role: 'Family Caregiver' });

    expect(await outcome(call('joinOrganization', { code: inviteCode }))).toBe(
      'functions/permission-denied'
    );
    const user = (await adminDb.doc(`users/${uid}`).get()).data();
    expect(user.pendingOrgId).toBeUndefined();
    expect((await adminDb.doc(`inviteCodes/${inviteCode}`).get()).data().uses).toBe(0);
  });

  it('a Family Caregiver cannot create an organization', async () => {
    const uid = await newUser({ role: 'Family Caregiver' });
    const orgsBefore = await count('organizations');
    expect(await outcome(call('createOrganization', { name: 'Mine' }))).toBe(
      'functions/permission-denied'
    );
    expect(await count('organizations')).toBe(orgsBefore);
    expect((await adminDb.doc(`users/${uid}`).get()).data().orgId).toBeUndefined();
  });

  it('there is no way to turn a family organization into a real one', async () => {
    const personal = adminDb.collection('organizations').doc();
    const uid = await newUser({ role: 'Family Caregiver', orgId: personal.id });
    await personal.set({ name: null, isPersonal: true, createdBy: uid, adminId: uid });

    expect(await outcome(call('upgradePersonalOrganization', { name: 'Home' }))).toBe(
      'functions/not-found'
    );
    expect((await personal.get()).data().isPersonal).toBe(true);
  });
});

// Moving one at-home resident into a facility: the family member asks with
// the facility's invite code (after a confirmation step that writes
// nothing), and the facility's administrator approves.
describe('moving an at-home resident into an organization', () => {
  // A facility with its owner signed in last-but-one, and a family member
  // (signed in last) with a family organization and one at-home resident.
  async function scene() {
    const ownerUid = await newUser({ role: 'Administrator', fullName: 'Olive' });
    const owner = auth.currentUser;
    const { orgId, inviteCode } = (await call('createOrganization', { name: 'Maple Court' })).data;

    const famOrg = adminDb.collection('organizations').doc();
    const famUid = await newUser({ role: 'Family Caregiver', fullName: 'Susan', orgId: famOrg.id });
    const family = auth.currentUser;
    await famOrg.set({ name: null, isPersonal: true, createdBy: famUid, adminId: famUid });
    const residentRef = adminDb.collection('residents').doc();
    await residentRef.set({
      name: 'Dad',
      caregiverId: famUid,
      createdBy: famUid,
      facilityId: famOrg.id,
      assignedCaregivers: [famUid],
    });
    const resident = async () => (await residentRef.get()).data();
    const as = async (user) => {
      await signOut(auth);
      await auth.updateCurrentUser(user);
    };
    return {
      ownerUid,
      owner,
      orgId,
      inviteCode,
      famOrgId: famOrg.id,
      famUid,
      family,
      residentId: residentRef.id,
      resident,
      as,
    };
  }

  it('the first call only names the organization — nothing is written until confirmed', async () => {
    const { inviteCode, residentId, resident, famOrgId } = await scene();
    const preview = (await call('requestResidentMove', { residentId, code: inviteCode })).data;
    expect(preview).toEqual({ needsConfirmation: true, pending: false, orgName: 'Maple Court' });
    expect((await resident()).pendingFacilityId).toBeUndefined();
    expect((await resident()).facilityId).toBe(famOrgId);
    expect((await adminDb.doc(`inviteCodes/${inviteCode}`).get()).data().uses).toBe(0);
  });

  it('confirming records a request; the resident stays at home until approved', async () => {
    const { inviteCode, residentId, resident, famOrgId, famUid, orgId, owner, as } = await scene();
    const sent = (
      await call('requestResidentMove', { residentId, code: inviteCode, confirmed: true })
    ).data;
    expect(sent).toEqual({ needsConfirmation: false, pending: true, orgName: 'Maple Court' });
    expect(await resident()).toMatchObject({
      facilityId: famOrgId,
      createdBy: famUid,
      pendingFacilityId: orgId,
      pendingMoveBy: famUid,
    });

    // The administrator sees it in Manage Users, by name only.
    await as(owner);
    const listed = (await call('listOrgMembers', { orgId })).data;
    expect(listed.pendingMoves).toMatchObject([
      { residentId, residentName: 'Dad', requestedByUid: famUid, requestedByName: 'Susan' },
    ]);
  });

  it('approving moves the resident and leaves the family member view-only', async () => {
    const s = await scene();
    await call('requestResidentMove', {
      residentId: s.residentId,
      code: s.inviteCode,
      confirmed: true,
    });
    // The family member can't approve their own request.
    expect(
      await outcome(call('approveResidentMove', { orgId: s.orgId, residentId: s.residentId }))
    ).toBe('functions/permission-denied');

    await s.as(s.owner);
    expect(
      await outcome(call('approveResidentMove', { orgId: s.orgId, residentId: s.residentId }))
    ).toBe('ok');
    const moved = await s.resident();
    expect(moved).toMatchObject({
      facilityId: s.orgId,
      // Ownership passes to the facility; the family member keeps only the
      // view-only link a family code gives.
      createdBy: s.ownerUid,
      caregiverId: s.ownerUid,
      assignedCaregivers: [],
      familyMembers: [s.famUid],
    });
    expect(moved.pendingFacilityId).toBeUndefined();
    expect(moved.pendingMoveBy).toBeUndefined();
    // Approving again finds nothing waiting.
    expect(
      await outcome(call('approveResidentMove', { orgId: s.orgId, residentId: s.residentId }))
    ).toBe('functions/not-found');
  });

  it('denying, or the family member cancelling, leaves the resident at home', async () => {
    const s = await scene();
    const request = () =>
      call('requestResidentMove', {
        residentId: s.residentId,
        code: s.inviteCode,
        confirmed: true,
      });
    await request();
    expect(await outcome(call('cancelResidentMove', { residentId: s.residentId }))).toBe('ok');
    expect((await s.resident()).pendingFacilityId).toBeUndefined();

    await request();
    await s.as(s.owner);
    expect(
      await outcome(call('denyResidentMove', { orgId: s.orgId, residentId: s.residentId }))
    ).toBe('ok');
    expect(await s.resident()).toMatchObject({
      facilityId: s.famOrgId,
      createdBy: s.famUid,
      assignedCaregivers: [s.famUid],
    });
    expect((await s.resident()).pendingFacilityId).toBeUndefined();
  });

  it("only the family member who added an at-home resident can ask, and only with a real facility's code", async () => {
    const s = await scene();
    // A bad code gets the same answer as an unknown one.
    expect(
      await outcome(
        call('requestResidentMove', {
          residentId: s.residentId,
          code: 'ZZZZ-9999',
          confirmed: true,
        })
      )
    ).toBe('functions/not-found');

    // Another family member can't move someone else's resident.
    await newUser({ role: 'Family Caregiver' });
    expect(
      await outcome(
        call('requestResidentMove', {
          residentId: s.residentId,
          code: s.inviteCode,
          confirmed: true,
        })
      )
    ).toBe('functions/permission-denied');

    // Nor can staff use this to pull in a resident.
    await s.as(s.owner);
    expect(
      await outcome(
        call('requestResidentMove', {
          residentId: s.residentId,
          code: s.inviteCode,
          confirmed: true,
        })
      )
    ).toBe('functions/permission-denied');
    expect((await s.resident()).pendingFacilityId).toBeUndefined();
  });

  it('a resident already in a facility cannot be moved again', async () => {
    const s = await scene();
    await adminDb.doc(`residents/${s.residentId}`).update({ facilityId: s.orgId });
    expect(
      await outcome(
        call('requestResidentMove', {
          residentId: s.residentId,
          code: s.inviteCode,
          confirmed: true,
        })
      )
    ).toBe('functions/failed-precondition');
  });
});

// Permanent deletion goes through deleteResident, because the app can't
// reach everything that has to go (firestore.rules refuse client deletes).
describe('deleteResident', () => {
  async function facilityResident() {
    const adminUid = await newUser({ role: 'Administrator', fullName: 'Olive' });
    const admin = auth.currentUser;
    const { orgId } = (await call('createOrganization', { name: 'Rowan House' })).data;
    const ref = adminDb.collection('residents').doc();
    await ref.set({ name: 'Gus', facilityId: orgId, createdBy: adminUid, assignedCaregivers: [] });
    await ref.collection('private').doc('lifeStory').set({ career: 'Farmer' });
    await ref.collection('private').doc('safety').set({ topicsToAvoid: 'War' });
    await ref.collection('photos').doc('p1').set({ caption: 'Garden' });
    await adminDb.doc(`familyCodes/GUS${Date.now() % 10}-CODE`).set({ residentId: ref.id });
    const session = adminDb.collection('activitySessions').doc();
    await session.set({
      facilityId: orgId,
      residentId: ref.id,
      isGuest: false,
      activityId: 'music',
      durationSeconds: 600,
      userId: 'vol-1',
    });
    return { adminUid, admin, orgId, ref, session };
  }

  it('removes the resident and everything held about them, but keeps anonymised activity time', async () => {
    const { adminUid, orgId, ref, session } = await facilityResident();
    expect(await outcome(call('deleteResident', { residentId: ref.id }))).toBe('ok');

    expect((await ref.get()).exists).toBe(false);
    expect((await ref.collection('private').get()).size).toBe(0);
    expect((await ref.collection('photos').get()).size).toBe(0);
    expect(
      (await adminDb.collection('familyCodes').where('residentId', '==', ref.id).get()).size
    ).toBe(0);
    // The visit still counts towards the facility's totals and the
    // volunteer's hours, but no longer points at the resident.
    expect((await session.get()).data()).toMatchObject({
      residentId: null,
      durationSeconds: 600,
      userId: 'vol-1',
      facilityId: orgId,
    });

    // Recorded once in the activity log, naming who did it.
    const entries = (
      await adminDb.collection('auditLog').where('orgId', '==', orgId).get()
    ).docs.map((d) => d.data());
    expect(entries.filter((e) => e.action === 'resident.deleted')).toMatchObject([
      { actorUid: adminUid, actorName: 'Olive', targetName: 'Gus' },
    ]);
  });

  it('only an Administrator of the facility can — not caregivers, volunteers or other facilities', async () => {
    const { orgId, ref } = await facilityResident();
    for (const user of [
      { role: 'Caregiver', orgId },
      { role: 'Volunteer', orgId },
      { role: 'Administrator', orgId: 'another-org' },
      { role: 'Family Caregiver' },
    ]) {
      await newUser(user);
      expect(await outcome(call('deleteResident', { residentId: ref.id }))).toBe(
        'functions/permission-denied'
      );
    }
    expect((await ref.get()).exists).toBe(true);
    expect((await ref.collection('private').get()).size).toBe(2);
  });

  it('a Family Caregiver can delete their own at-home resident, but not one that moved into a facility', async () => {
    const famUid = await newUser({ role: 'Family Caregiver' });
    const home = adminDb.collection('residents').doc();
    await home.set({ name: 'Dad', facilityId: null, createdBy: famUid, caregiverId: famUid });
    const moved = adminDb.collection('residents').doc();
    await moved.set({ name: 'Mum', facilityId: 'some-facility', familyMembers: [famUid] });

    expect(await outcome(call('deleteResident', { residentId: moved.id }))).toBe(
      'functions/permission-denied'
    );
    expect(await outcome(call('deleteResident', { residentId: home.id }))).toBe('ok');
    expect((await home.get()).exists).toBe(false);
    expect((await moved.get()).exists).toBe(true);
  });

  it("answers the same for a resident that doesn't exist", async () => {
    await newUser({ role: 'Administrator', orgId: 'x' });
    expect(await outcome(call('deleteResident', { residentId: 'no-such-resident' }))).toBe(
      'functions/permission-denied'
    );
  });
});

describe('recent sign-in required for destructive actions', () => {
  // The server refuses delete account / delete organization / transfer
  // administrator unless the caller typed their password in the last few
  // minutes (auth_time in the ID token). To simulate "signed in an hour
  // ago", this builds a token by hand. The emulator accepts unsigned tokens
  // (alg "none"); production Firebase never does.
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  function staleToken(uid) {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: `https://securetoken.google.com/${PROJECT}`,
      aud: PROJECT,
      sub: uid,
      user_id: uid,
      auth_time: now - 60 * 60, // an hour ago
      iat: now,
      exp: now + 3600,
      email_verified: true,
      firebase: { sign_in_provider: 'password', identities: {} },
    };
    return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.`;
  }
  async function callWithToken(name, token, data) {
    const res = await fetch(`http://127.0.0.1:5001/${PROJECT}/northamerica-northeast1/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ data }),
    });
    return res.json();
  }

  it('refuses to delete an organization with an old sign-in, and deletes nothing', async () => {
    const uid = await newUser({ role: 'Administrator' });
    const { orgId } = (await call('createOrganization', { name: 'Willow' })).data;

    const reply = await callWithToken('deleteOrganization', staleToken(uid), { orgId });

    expect(reply.error?.status).toBe('FAILED_PRECONDITION');
    expect(reply.error?.details?.reason).toBe('requires-recent-login');
    expect((await adminDb.doc(`organizations/${orgId}`).get()).exists).toBe(true);
  });

  it('refuses account deletion and admin transfer with an old sign-in', async () => {
    const uid = await newUser({ role: 'Caregiver' });
    const del = await callWithToken('deleteAccount', staleToken(uid), {});
    const transfer = await callWithToken('transferOrgAdmin', staleToken(uid), {
      orgId: 'x',
      newAdminUid: 'y',
    });
    expect(del.error?.details?.reason).toBe('requires-recent-login');
    expect(transfer.error?.details?.reason).toBe('requires-recent-login');
    expect((await adminDb.doc(`users/${uid}`).get()).exists).toBe(true);
  });

  it('allows it right after signing in', async () => {
    await newUser({ role: 'Administrator' }); // just signed in → fresh auth_time
    const { orgId } = (await call('createOrganization', { name: 'Aspen' })).data;
    expect(await outcome(call('deleteOrganization', { orgId }))).toBe('ok');
    expect((await adminDb.doc(`organizations/${orgId}`).get()).exists).toBe(false);
  });
});

describe('verified email and invite code format (security fixes)', () => {
  it('refuses organization functions for an unverified email', async () => {
    await newUser({ role: 'Administrator' }, { verified: false });
    const err = await call('createOrganization', { name: 'Nope' }).catch((e) => e);
    expect(err.code).toBe('functions/permission-denied');
    expect(err.details?.reason).toBe('email-not-verified');
  });

  it('issues new 8-character codes that can be typed in any case, with or without the dash', async () => {
    await newUser({ role: 'Administrator' });
    const { orgId, inviteCode } = (await call('createOrganization', { name: 'Cedar' })).data;
    // 4 + 4 characters from the no-look-alikes alphabet.
    expect(inviteCode).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);

    await newUser({ role: 'Caregiver' });
    const typed = inviteCode.toLowerCase().replace('-', ' ');
    expect((await call('joinOrganization', { code: typed })).data.orgId).toBe(orgId);
  });

  it('still accepts old-format codes', async () => {
    const org = adminDb.collection('organizations').doc();
    await org.set({ name: 'Old', isPersonal: false, createdBy: 'x' });
    await adminDb.doc('inviteCodes/OL-4821').set({ orgId: org.id, revoked: false, uses: 0 });
    await newUser({ role: 'Caregiver' });
    expect((await call('joinOrganization', { code: 'ol4821' })).data.orgId).toBe(org.id);
  });
});

describe('resolveSignInEmail (sign-in with a username)', () => {
  // Looks up the email for the account's CURRENT username, from Firebase
  // Auth itself — not from any stored field — and nothing for stale or
  // unknown names.
  it("returns the account's real email for its current username", async () => {
    const uid = await newUser({ role: 'Caregiver', username: 'Ann.Smith' });
    await adminDb.doc('usernames/ann.smith').set({ uid });
    const { email } = (await call('resolveSignInEmail', { username: ' ANN.smith ' })).data;
    expect(email).toBe((await authEmulator('lookup', { localId: [uid] })).users[0].email);
  });

  it('does not resolve a username that is no longer on the profile', async () => {
    const uid = await newUser({ role: 'Caregiver', username: 'new.name' });
    await adminDb.doc('usernames/old.name').set({ uid });
    expect(await outcome(call('resolveSignInEmail', { username: 'old.name' }))).toBe(
      'functions/not-found'
    );
  });

  it('gives the same answer for a username that does not exist', async () => {
    expect(await outcome(call('resolveSignInEmail', { username: 'nobody.here' }))).toBe(
      'functions/not-found'
    );
  });
});

describe('deleting an organization safely (concurrency)', () => {
  it('marks the org as deleting, refuses joins meanwhile, and finishes a resumed deletion', async () => {
    await newUser({ role: 'Administrator' });
    const { orgId, inviteCode } = (await call('createOrganization', { name: 'Pine' })).data;
    await adminDb
      .doc('residents/pine1')
      .set({ name: 'Pat', facilityId: orgId, assignedCaregivers: [] });

    // Simulate a deletion that stopped partway: the org is already marked.
    await adminDb.doc(`organizations/${orgId}`).update({ status: 'deleting' });

    const admin1 = auth.currentUser;
    await newUser({ role: 'Caregiver' });
    expect(await outcome(call('joinOrganization', { code: inviteCode }))).toBe(
      'functions/not-found'
    );

    // The owner runs it again: it resumes and completes.
    await signOut(auth);
    await auth.updateCurrentUser(admin1);
    expect(await outcome(call('deleteOrganization', { orgId }))).toBe('ok');
    expect((await adminDb.doc(`organizations/${orgId}`).get()).exists).toBe(false);
    expect((await adminDb.doc('residents/pine1').get()).exists).toBe(false);
  });

  it('refuses to transfer or replace the code of an org being deleted', async () => {
    const owner = await newUser({ role: 'Administrator' });
    const { orgId } = (await call('createOrganization', { name: 'Spruce' })).data;
    await adminDb.doc(`organizations/${orgId}`).update({ status: 'deleting' });
    const other = adminDb.collection('users').doc();
    await other.set({ role: 'Caregiver', orgId });
    expect(await outcome(call('transferOrgAdmin', { orgId, newAdminUid: other.id }))).toBe(
      'functions/failed-precondition'
    );
    expect(await outcome(call('regenerateInviteCode', { orgId }))).toBe(
      'functions/failed-precondition'
    );
    expect((await adminDb.doc(`organizations/${orgId}`).get()).data().createdBy).toBe(owner);
  });
});

describe('removeOrgMember (Manage Users)', () => {
  it('removes a member: org link cleared, unassigned, their residents handed to the admin', async () => {
    const ownerUid = await newUser({ role: 'Administrator' });
    const { orgId } = (await call('createOrganization', { name: 'Birchwood' })).data;
    const owner = auth.currentUser;
    const member = adminDb.collection('users').doc();
    await member.set({ role: 'Caregiver', orgId, fullName: 'Casey' });
    await adminDb.doc('residents/theirs').set({
      name: 'Ann',
      facilityId: orgId,
      createdBy: member.id,
      caregiverId: member.id,
      assignedCaregivers: [member.id],
    });
    await adminDb.doc('residents/shared').set({
      name: 'Bo',
      facilityId: orgId,
      createdBy: ownerUid,
      caregiverId: ownerUid,
      assignedCaregivers: [ownerUid, member.id],
    });

    const listed = (await call('listOrgMembers', { orgId })).data.members;
    expect(listed).toEqual([
      { uid: member.id, name: 'Casey', role: 'Caregiver', assignedResidents: 2 },
    ]);

    await auth.updateCurrentUser(owner);
    expect(await outcome(call('removeOrgMember', { orgId, memberUid: member.id }))).toBe('ok');

    expect((await member.get()).data().orgId).toBeUndefined();
    const theirs = (await adminDb.doc('residents/theirs').get()).data();
    expect(theirs).toMatchObject({
      createdBy: ownerUid,
      caregiverId: ownerUid,
      assignedCaregivers: [],
    });
    expect((await adminDb.doc('residents/shared').get()).data().assignedCaregivers).toEqual([
      ownerUid,
    ]);
  });

  it('only the owner can remove, and not themselves or non-members', async () => {
    await newUser({ role: 'Administrator' });
    const { orgId } = (await call('createOrganization', { name: 'Hazel' })).data;
    const owner = auth.currentUser;
    const outsider = adminDb.collection('users').doc();
    await outsider.set({ role: 'Caregiver', orgId: 'elsewhere' });
    expect(await outcome(call('removeOrgMember', { orgId, memberUid: owner.uid }))).toBe(
      'functions/invalid-argument'
    );
    expect(await outcome(call('removeOrgMember', { orgId, memberUid: outsider.id }))).toBe(
      'functions/not-found'
    );

    // A regular member (signed in now) can't remove another member.
    const colleague = adminDb.collection('users').doc();
    await colleague.set({ role: 'Caregiver', orgId });
    await newUser({ role: 'Caregiver', orgId });
    expect(await outcome(call('removeOrgMember', { orgId, memberUid: colleague.id }))).toBe(
      'functions/permission-denied'
    );
  });
});

// Review item: the organization activity log (functions/auditLog.js).
describe('activity log', () => {
  // Entries for an org, oldest first (only a handful exist per test).
  const entriesFor = async (orgId) =>
    (await adminDb.collection('auditLog').where('orgId', '==', orgId).get()).docs
      .map((d) => d.data())
      .sort((a, b) => (a.at?.toMillis() ?? 0) - (b.at?.toMillis() ?? 0));

  // Triggers run asynchronously after the write, so poll briefly for them.
  async function waitForEntry(orgId, action) {
    for (let i = 0; i < 40; i++) {
      const found = (await entriesFor(orgId)).find((e) => e.action === action);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  }

  it('records member removal and invite-code changes, without the code itself', async () => {
    const ownerUid = await newUser({ role: 'Administrator', fullName: 'Olive' });
    const { orgId, inviteCode } = (await call('createOrganization', { name: 'Elm' })).data;
    const member = adminDb.collection('users').doc();
    await member.set({ role: 'Volunteer', orgId, fullName: 'Vic' });

    await call('removeOrgMember', { orgId, memberUid: member.id });
    await call('regenerateInviteCode', { orgId });

    const entries = await entriesFor(orgId);
    expect(entries.map((e) => e.action)).toEqual(['member.removed', 'inviteCode.regenerated']);
    expect(entries[0]).toMatchObject({
      actorUid: ownerUid,
      actorName: 'Olive',
      targetUid: member.id,
      targetName: 'Vic',
    });
    expect(JSON.stringify(entries)).not.toContain(inviteCode);
  });

  // The auditResidentDeleted trigger only records deletes made directly by
  // an app user (which firestore.rules no longer allow). A server-side
  // delete like this one must NOT add an entry, or deleteResident — which
  // writes its own, see the deleteResident tests — would be logged twice.
  it('does not log server-side resident deletes through the trigger', async () => {
    await newUser({ role: 'Administrator' });
    const { orgId } = (await call('createOrganization', { name: 'Ash' })).data;
    await adminDb.doc('residents/gone').set({ name: 'Gus', facilityId: orgId });
    await adminDb.doc('residents/gone').delete();
    // Give the trigger time to run, then make something else happen and
    // check it's the only entry.
    await new Promise((r) => setTimeout(r, 3000));
    await call('regenerateInviteCode', { orgId });
    expect(await waitForEntry(orgId, 'inviteCode.regenerated')).toBeTruthy();
    expect((await entriesFor(orgId)).map((e) => e.action)).toEqual(['inviteCode.regenerated']);
  });

  it('deleting the organization removes its activity log too', async () => {
    await newUser({ role: 'Administrator' });
    const { orgId } = (await call('createOrganization', { name: 'Yew' })).data;
    await call('regenerateInviteCode', { orgId });
    expect((await entriesFor(orgId)).length).toBe(1);

    await call('deleteOrganization', { orgId });
    expect(await entriesFor(orgId)).toEqual([]);
  });
});

describe('family codes (createFamilyCode / redeemFamilyCode)', () => {
  // A facility with one resident; returns ids. Each newUser() call signs in
  // as that user, so calls go out as whoever was created last.
  async function facility() {
    const orgId = `org-fam-${Date.now()}-${userCount}`;
    await adminDb.doc(`organizations/${orgId}`).set({ name: 'Maple', isPersonal: false });
    const residentRef = adminDb.collection('residents').doc();
    await residentRef.set({ name: 'Margaret', facilityId: orgId, assignedCaregivers: [] });
    return { orgId, residentId: residentRef.id };
  }

  it('links a family member once; the code then stops working', async () => {
    const { orgId, residentId } = await facility();
    await newUser({ role: 'Caregiver', orgId });
    const { code, expiresAt } = (await call('createFamilyCode', { residentId })).data;
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(expiresAt).toBeGreaterThan(Date.now());

    const famUid = await newUser({ role: 'Family Caregiver' });
    const result = (await call('redeemFamilyCode', { code: code.toLowerCase() })).data;
    expect(result).toEqual({ residentId, residentName: 'Margaret' });
    expect((await adminDb.doc(`residents/${residentId}`).get()).data().familyMembers).toEqual([
      famUid,
    ]);

    // Single-use: a second family member gets nothing from the same code.
    const otherFam = await newUser({ role: 'Family Caregiver' });
    expect(await outcome(call('redeemFamilyCode', { code }))).toBe('functions/not-found');
    expect((await adminDb.doc(`residents/${residentId}`).get()).data().familyMembers).not.toContain(
      otherFam
    );
  });

  it('a new code cancels an unused old one; expired codes fail', async () => {
    const { orgId, residentId } = await facility();
    await newUser({ role: 'Administrator', orgId });
    const first = (await call('createFamilyCode', { residentId })).data.code;
    const second = (await call('createFamilyCode', { residentId })).data.code;
    await adminDb
      .doc(`familyCodes/${second}`)
      .update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    await newUser({ role: 'Family Caregiver' });
    expect(await outcome(call('redeemFamilyCode', { code: first }))).toBe('functions/not-found');
    expect(await outcome(call('redeemFamilyCode', { code: second }))).toBe('functions/not-found');
  });

  it('only facility staff make codes, and only family members redeem them', async () => {
    const { orgId, residentId } = await facility();
    await newUser({ role: 'Volunteer', orgId });
    expect(await outcome(call('createFamilyCode', { residentId }))).toBe(
      'functions/permission-denied'
    );
    await newUser({ role: 'Caregiver', orgId: 'some-other-org' });
    expect(await outcome(call('createFamilyCode', { residentId }))).toBe(
      'functions/permission-denied'
    );
    await newUser({ role: 'Caregiver', orgId });
    const { code } = (await call('createFamilyCode', { residentId })).data;
    await newUser({ role: 'Volunteer', orgId });
    expect(await outcome(call('redeemFamilyCode', { code }))).toBe('functions/permission-denied');
  });

  it('staff can list and remove linked family members', async () => {
    const { orgId, residentId } = await facility();
    const famUid = await newUser({ role: 'Family Caregiver', fullName: 'Susan' });
    await adminDb.doc(`residents/${residentId}`).update({ familyMembers: [famUid] });
    await newUser({ role: 'Caregiver', orgId });
    expect((await call('listFamilyMembers', { residentId })).data.members).toEqual([
      { uid: famUid, name: 'Susan' },
    ]);
    await call('unlinkFamilyMember', { residentId, memberUid: famUid });
    expect((await adminDb.doc(`residents/${residentId}`).get()).data().familyMembers).toEqual([]);
  });
});

// The usage limits on the paid functions (functions/rateLimit.js), run
// against the real Firestore emulator. The unit tests cover the counting
// with a stand-in database; this checks the same code inside a real
// transaction — in particular that a refusal comes straight back (Firestore
// doesn't retry it) and writes nothing.
describe('usage limits against Firestore', () => {
  const { enforceUsageLimits } = require('../../functions/rateLimit');

  it('refuses past the hourly limit and leaves the counters untouched', async () => {
    const uid = `limit-test-${Date.now()}`;
    const options = {
      feature: 'testfeature',
      uid,
      perHour: 2,
      perDay: 10,
      globalPerDay: 1000,
      label: 'suggestions',
    };
    await enforceUsageLimits(adminDb, options);
    await enforceUsageLimits(adminDb, options);
    await expect(enforceUsageLimits(adminDb, options)).rejects.toMatchObject({
      rateLimited: true,
    });
    const hour = (await adminDb.doc(`rateLimits/testfeature_hour_${uid}`).get()).data();
    const day = (await adminDb.doc(`rateLimits/testfeature_day_${uid}`).get()).data();
    expect(hour.count).toBe(2);
    expect(day.count).toBe(2);
  });
});

// The YouTube search cache (functions/searchCache.js) against the real
// Firestore emulator: results written for a search come back for the same
// search typed differently, as the plain data the app expects.
describe('search cache against Firestore', () => {
  const { readCachedSearch, writeCachedSearch } = require('../../functions/searchCache');

  it('round-trips saved results', async () => {
    const query = `Vera Lynn ${Date.now()}`;
    const results = [
      { videoId: 'abc12345678', title: "We'll Meet Again", channelTitle: 'Vera', thumbnailUrl: '' },
    ];
    expect(await readCachedSearch(adminDb, 'music', query)).toBeNull();
    await writeCachedSearch(adminDb, 'music', query, results);
    expect(await readCachedSearch(adminDb, 'music', `  ${query.toUpperCase()} `)).toEqual(results);
    expect(await readCachedSearch(adminDb, 'video', query)).toBeNull();
  });
});

// What generateSuggestions loads about a resident (functions/
// residentAccess.js), against the real Firestore emulator and the Admin
// SDK's own snapshots — the unit tests use a stand-in for both.
describe('resident context for AI suggestions', () => {
  const { loadResidentContext } = require('../../functions/residentAccess');

  it('loads the life story and safety notes for staff, and refuses outsiders', async () => {
    const orgId = `org-ctx-${Date.now()}`;
    const residentRef = adminDb.collection('residents').doc();
    await residentRef.set({ name: 'Ann', facilityId: orgId, createdBy: 'someone-else' });
    await residentRef.collection('private').doc('lifeStory').set({ career: 'Farmer' });
    await residentRef.collection('private').doc('safety').set({ topicsToAvoid: 'No water' });
    await adminDb.doc(`users/staff-${orgId}`).set({ role: 'Caregiver', orgId });
    await adminDb.doc(`users/vol-${orgId}`).set({ role: 'Volunteer', orgId });
    await adminDb.doc(`users/out-${orgId}`).set({ role: 'Caregiver', orgId: 'another-org' });

    expect(await loadResidentContext(adminDb, residentRef.id, `staff-${orgId}`)).toEqual({
      lifeStory: { career: 'Farmer' },
      topicsToAvoid: 'No water',
    });
    // No organizations doc at all here: a volunteer still gets the notes.
    expect(await loadResidentContext(adminDb, residentRef.id, `vol-${orgId}`)).toEqual({
      lifeStory: null,
      topicsToAvoid: 'No water',
    });
    await expect(
      loadResidentContext(adminDb, residentRef.id, `out-${orgId}`)
    ).rejects.toMatchObject({ denied: true });
  });
});
