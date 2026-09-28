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
const admin = fromFunctions('firebase-admin');

const PROJECT = 'demo-welicare';
let adminDb;
let auth;
let functions;
let userCount = 0;

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('Run these through `npm run test:functions` so the emulators are running.');
  }
  admin.initializeApp({ projectId: PROJECT });
  adminDb = admin.firestore();
  const app = initializeApp({ projectId: PROJECT, apiKey: 'fake-key-for-emulator' });
  auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, {
    disableWarnings: true,
  });
  functions = getFunctions(app);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
});

afterAll(async () => {
  await signOut(auth);
  await admin.app().delete();
});

/** Signs up a fresh test user with the given users/{uid} data; returns uid. */
async function newUser(data) {
  await signOut(auth);
  userCount += 1;
  const { user } = await createUserWithEmailAndPassword(
    auth,
    `fn-${Date.now()}-${userCount}@example.test`,
    'test-password'
  );
  await adminDb.doc(`users/${user.uid}`).set(data);
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

  it('links the user and counts the use in one step', async () => {
    const uid = await newUser({ role: 'Caregiver' });
    expect((await call('joinOrganization', { code })).data.orgId).toBe(orgId);
    expect((await adminDb.doc(`users/${uid}`).get()).data().orgId).toBe(orgId);
    expect((await adminDb.doc(`inviteCodes/${code}`).get()).data().uses).toBe(1);
  });

  it('leaves the user and the code untouched when the code is revoked', async () => {
    const revoked = 'RV-1234';
    await adminDb.doc(`inviteCodes/${revoked}`).set({ orgId, revoked: true, uses: 0 });
    const uid = await newUser({ role: 'Caregiver' });

    expect(await outcome(call('joinOrganization', { code: revoked }))).toBe('functions/not-found');
    expect((await adminDb.doc(`users/${uid}`).get()).data().orgId).toBeUndefined();
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
      firebase: { sign_in_provider: 'password', identities: {} },
    };
    return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.`;
  }
  async function callWithToken(name, token, data) {
    const res = await fetch(`http://127.0.0.1:5001/${PROJECT}/us-central1/${name}`, {
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
