// Firestore security-rules tests for facility-scoped residents. Unlike the
// app tests, nothing is mocked: @firebase/rules-unit-testing loads the real
// firestore.rules into the local Firestore emulator and we try reads and
// writes as different users.
//
// Run with `npm run test:rules` — it starts the emulator (project
// "demo-welicare", which can never reach real data), runs this file, and
// shuts the emulator down.
//
// Pattern for each test:
//   const db = as('some-uid');                       // pick who is asking
//   await assertSucceeds(getDoc(doc(db, ...)));      // should be allowed
//   await assertFails(updateDoc(doc(db, ...), ...)); // should be denied
// Test data is written with rules switched off (seed()), so setup never
// depends on the rules being tested.

const fs = require('fs');
const path = require('path');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const {
  addDoc,
  collection,
  deleteDoc,
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

// Two facilities, a user of every role in facility A, and one caregiver in
// facility B who should never see A's residents.
const USERS = {
  adminA: { role: 'Administrator', orgId: 'orgA' },
  caregiverA: { role: 'Caregiver', orgId: 'orgA' },
  volunteerA: { role: 'Volunteer', orgId: 'orgA' },
  familyA: { role: 'Family Caregiver', orgId: 'orgA' },
  caregiverB: { role: 'Caregiver', orgId: 'orgB' },
};

/** Firestore as seen by a signed-in user (or signed-out if uid is null). */
function as(uid) {
  return uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();
}

/** Writes test data with rules disabled, so setup can't be blocked by them. */
async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, data] of Object.entries(USERS)) {
      await setDoc(doc(db, 'users', uid), data);
    }
    // Created by caregiverA, only assigned to them.
    await setDoc(doc(db, 'residents', 'residentA'), {
      name: 'Ann',
      caregiverId: 'caregiverA',
      createdBy: 'caregiverA',
      facilityId: 'orgA',
      assignedCaregivers: ['caregiverA'],
      lifeStory: null,
    });
    // Assigned to the family member, to check what an assigned Family
    // Caregiver can do.
    await setDoc(doc(db, 'residents', 'residentFamily'), {
      name: 'Fay',
      caregiverId: 'caregiverA',
      createdBy: 'caregiverA',
      facilityId: 'orgA',
      assignedCaregivers: ['caregiverA', 'familyA'],
      lifeStory: null,
    });
    await setDoc(doc(db, 'residents', 'residentB'), {
      name: 'Bob',
      caregiverId: 'caregiverB',
      createdBy: 'caregiverB',
      facilityId: 'orgB',
      assignedCaregivers: ['caregiverB'],
      lifeStory: null,
    });
  });
}

beforeAll(async () => {
  // Every denied write is also logged by the Firestore SDK as a warning;
  // those are the expected failures, so keep the test output readable.
  setLogLevel('silent');
  env = await initializeTestEnvironment({
    projectId: 'demo-welicare',
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8'),
    },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed();
});

afterAll(async () => {
  await env.cleanup();
});

describe('own facility', () => {
  it('a caregiver can read residents in their own facility, assigned or not', async () => {
    await assertSucceeds(getDoc(doc(as('adminA'), 'residents', 'residentA')));
    await assertSucceeds(getDoc(doc(as('volunteerA'), 'residents', 'residentA')));
  });

  it('can list their facility’s residents (My Residents query)', async () => {
    const q = query(collection(as('caregiverA'), 'residents'), where('facilityId', '==', 'orgA'));
    await assertSucceeds(getDocs(q));
  });

  it('a caregiver or admin can edit profile fields of any resident in the facility', async () => {
    await assertSucceeds(
      updateDoc(doc(as('adminA'), 'residents', 'residentA'), {
        name: 'Annie',
        lifeStory: { career: 'Farmer' },
      })
    );
  });

  it('can create a resident in their own facility', async () => {
    await assertSucceeds(
      addDoc(collection(as('caregiverA'), 'residents'), {
        name: 'New',
        caregiverId: 'caregiverA',
        createdBy: 'caregiverA',
        facilityId: 'orgA',
        assignedCaregivers: ['caregiverA'],
      })
    );
  });

  it('nobody can change ownership or facility fields, even the creator', async () => {
    const db = as('caregiverA');
    await assertFails(updateDoc(doc(db, 'residents', 'residentA'), { facilityId: 'orgB' }));
    await assertFails(updateDoc(doc(db, 'residents', 'residentA'), { createdBy: 'someoneElse' }));
    await assertFails(
      updateDoc(doc(db, 'residents', 'residentA'), { assignedCaregivers: ['caregiverA', 'x'] })
    );
  });
});

describe('other facility', () => {
  it('cannot read a resident from another facility', async () => {
    await assertFails(getDoc(doc(as('caregiverB'), 'residents', 'residentA')));
  });

  it('cannot list another facility’s residents', async () => {
    const q = query(collection(as('caregiverB'), 'residents'), where('facilityId', '==', 'orgA'));
    await assertFails(getDocs(q));
  });

  it('cannot edit or delete a resident from another facility', async () => {
    const db = as('caregiverB');
    await assertFails(updateDoc(doc(db, 'residents', 'residentA'), { name: 'Hacked' }));
    await assertFails(deleteDoc(doc(db, 'residents', 'residentA')));
  });

  it('cannot create a resident inside another facility', async () => {
    await assertFails(
      addDoc(collection(as('caregiverB'), 'residents'), {
        name: 'Planted',
        caregiverId: 'caregiverB',
        createdBy: 'caregiverB',
        facilityId: 'orgA',
        assignedCaregivers: ['caregiverB'],
      })
    );
  });
});

describe('unauthenticated', () => {
  it('is denied every read and write', async () => {
    const db = as(null);
    await assertFails(getDoc(doc(db, 'residents', 'residentA')));
    await assertFails(
      getDocs(query(collection(db, 'residents'), where('facilityId', '==', 'orgA')))
    );
    await assertFails(updateDoc(doc(db, 'residents', 'residentA'), { name: 'x' }));
    await assertFails(
      addDoc(collection(db, 'residents'), { name: 'x', caregiverId: 'x', facilityId: null })
    );
  });
});

describe('role restrictions the rules enforce today', () => {
  it('only an Administrator of the same facility can delete a resident', async () => {
    await assertFails(deleteDoc(doc(as('caregiverA'), 'residents', 'residentA')));
    await assertSucceeds(deleteDoc(doc(as('adminA'), 'residents', 'residentA')));
  });

  it('a Volunteer in the facility can read but not edit a resident they are not assigned to', async () => {
    const db = as('volunteerA');
    await assertSucceeds(getDoc(doc(db, 'residents', 'residentA')));
    await assertFails(updateDoc(doc(db, 'residents', 'residentA'), { name: 'x' }));
  });

  it('a Family Caregiver cannot edit residents they are not assigned to', async () => {
    await assertFails(updateDoc(doc(as('familyA'), 'residents', 'residentA'), { name: 'x' }));
  });

  // Documents current behaviour, which may not match what the app assumes:
  // Family Mode is described as read-only ("View resident stats"), but the
  // rules let an *assigned* Family Caregiver edit that resident's profile
  // fields. Flagged for a decision — not changed here.
  it('FLAG: an assigned Family Caregiver CAN edit profile fields (rules are not read-only for Family)', async () => {
    await assertSucceeds(
      updateDoc(doc(as('familyA'), 'residents', 'residentFamily'), {
        lifeStory: { career: 'Teacher' },
      })
    );
  });

  it('a user cannot change their own role', async () => {
    await assertFails(
      updateDoc(doc(as('volunteerA'), 'users', 'volunteerA'), { role: 'Administrator' })
    );
  });

  it('a user cannot point their orgId at another organization', async () => {
    await assertFails(updateDoc(doc(as('caregiverB'), 'users', 'caregiverB'), { orgId: 'orgA' }));
  });
});
