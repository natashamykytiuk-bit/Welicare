// Security-rules tests for join requests (joinOrganization in
// functions/index.js): a request is users/{uid}.pendingOrgId, set only by
// the server. The app may only clear it (cancel), and a pending user is a
// non-member everywhere because they have no orgId.
// Run with `npm run test:rules` (Firestore emulator).

const fs = require('fs');
const path = require('path');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  setLogLevel,
  updateDoc,
  where,
} = require('firebase/firestore');

let env;

const USERS = {
  caregiverA: { role: 'Caregiver', orgId: 'orgA' },
  // Asked to join orgA and is waiting for approval.
  pendingA: { role: 'Caregiver', pendingOrgId: 'orgA' },
  // Brand new, no request.
  newcomer: { role: 'Volunteer' },
};

const fsAs = (uid) => env.authenticatedContext(uid, { email_verified: true }).firestore();

beforeAll(async () => {
  setLogLevel('silent');
  const root = path.join(__dirname, '..', '..');
  env = await initializeTestEnvironment({
    projectId: 'demo-welicare',
    firestore: { rules: fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8') },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (admin) => {
    const db = admin.firestore();
    for (const [uid, data] of Object.entries(USERS)) await setDoc(doc(db, 'users', uid), data);
    await setDoc(doc(db, 'organizations', 'orgA'), { name: 'Maple', createdBy: 'someone' });
    await setDoc(doc(db, 'residents', 'r1'), {
      name: 'Ann',
      caregiverId: 'caregiverA',
      createdBy: 'caregiverA',
      facilityId: 'orgA',
      assignedCaregivers: ['caregiverA'],
    });
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe('join requests on the user doc', () => {
  it('nobody can make a request for themselves from the app', async () => {
    await assertFails(
      updateDoc(doc(fsAs('newcomer'), 'users', 'newcomer'), { pendingOrgId: 'orgA' })
    );
    // Nor switch an existing request to another org.
    await assertFails(
      updateDoc(doc(fsAs('pendingA'), 'users', 'pendingA'), { pendingOrgId: 'orgB' })
    );
  });

  it('a profile cannot be created with a request already on it', async () => {
    await assertFails(
      setDoc(doc(fsAs('brandNew'), 'users', 'brandNew'), {
        role: 'Caregiver',
        pendingOrgId: 'orgA',
      })
    );
  });

  it('a pending user can cancel their own request', async () => {
    await assertSucceeds(
      updateDoc(doc(fsAs('pendingA'), 'users', 'pendingA'), {
        pendingOrgId: deleteField(),
        pendingSince: deleteField(),
      })
    );
  });

  it('other profile edits still work while pending', async () => {
    await assertSucceeds(
      updateDoc(doc(fsAs('pendingA'), 'users', 'pendingA'), { fullName: 'Tomas' })
    );
  });
});

describe('a pending user is not a member', () => {
  it("cannot read the facility's residents or its invite code", async () => {
    await assertFails(getDoc(doc(fsAs('pendingA'), 'residents', 'r1')));
    await assertFails(
      getDocs(query(collection(fsAs('pendingA'), 'residents'), where('facilityId', '==', 'orgA')))
    );
    await assertFails(getDoc(doc(fsAs('pendingA'), 'organizations', 'orgA', 'private', 'invite')));
  });

  it('can still read the organization doc for its name', async () => {
    await assertSucceeds(getDoc(doc(fsAs('pendingA'), 'organizations', 'orgA')));
  });
});
