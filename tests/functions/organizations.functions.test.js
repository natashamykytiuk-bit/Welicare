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

describe('upgradePersonalOrganization', () => {
  it('turns a personal org into a real one with its first code', async () => {
    const personal = adminDb.collection('organizations').doc();
    const uid = await newUser({ role: 'Family Caregiver', orgId: personal.id });
    await personal.set({ name: null, isPersonal: true, createdBy: uid, adminId: uid });

    const { inviteCode } = (await call('upgradePersonalOrganization', { name: 'Home' })).data;

    expect((await personal.get()).data()).toMatchObject({ name: 'Home', isPersonal: false });
    expect((await adminDb.doc(`inviteCodes/${inviteCode}`).get()).data().orgId).toBe(personal.id);
  });

  it('writes nothing when the org is already upgraded', async () => {
    const real = adminDb.collection('organizations').doc();
    const uid = await newUser({ role: 'Administrator', orgId: real.id });
    await real.set({ name: 'Pine', isPersonal: false, createdBy: uid, adminId: uid });
    const codesBefore = await count('inviteCodes');

    expect(await outcome(call('upgradePersonalOrganization', { name: 'Renamed' }))).toBe(
      'functions/failed-precondition'
    );
    expect((await real.get()).data().name).toBe('Pine');
    expect(await count('inviteCodes')).toBe(codesBefore);
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

  it('records a resident deleted from the app (trigger)', async () => {
    await newUser({ role: 'Administrator' });
    const { orgId } = (await call('createOrganization', { name: 'Ash' })).data;
    await adminDb.doc('residents/gone').set({ name: 'Gus', facilityId: orgId });
    await adminDb.doc('residents/gone').delete();

    const entry = await waitForEntry(orgId, 'resident.deleted');
    expect(entry).toMatchObject({ targetName: 'Gus' });
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
