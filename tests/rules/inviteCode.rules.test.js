// Security-rules tests for organizations/{orgId}/private/invite, the org's
// join code. Only the org's own Caregivers and Administrators may read it:
// volunteers don't invite people (OrgIdBadge hides for them), and other
// orgs' members never see it.
// Run with `npm run test:rules` (Firestore emulator).

const fs = require('fs');
const path = require('path');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, setLogLevel } = require('firebase/firestore');

let env;

const USERS = {
  adminA: { role: 'Administrator', orgId: 'orgA' },
  caregiverA: { role: 'Caregiver', orgId: 'orgA' },
  volunteerA: { role: 'Volunteer', orgId: 'orgA' },
  caregiverB: { role: 'Caregiver', orgId: 'orgB' },
};

const fsAs = (uid) => env.authenticatedContext(uid, { email_verified: true }).firestore();
const inviteDoc = (uid) => doc(fsAs(uid), 'organizations', 'orgA', 'private', 'invite');

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
    await setDoc(doc(db, 'organizations', 'orgA'), { name: 'Maple', createdBy: 'adminA' });
    await setDoc(doc(db, 'organizations', 'orgA', 'private', 'invite'), { code: 'ABC123' });
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe('reading the invite code', () => {
  it("the org's Administrators and Caregivers can", async () => {
    await assertSucceeds(getDoc(inviteDoc('adminA')));
    await assertSucceeds(getDoc(inviteDoc('caregiverA')));
  });

  it("the org's Volunteers cannot", async () => {
    await assertFails(getDoc(inviteDoc('volunteerA')));
  });

  it("another org's staff cannot", async () => {
    await assertFails(getDoc(inviteDoc('caregiverB')));
  });

  it('nobody can write it from the app', async () => {
    await assertFails(setDoc(inviteDoc('adminA'), { code: 'HACKED' }));
  });
});
