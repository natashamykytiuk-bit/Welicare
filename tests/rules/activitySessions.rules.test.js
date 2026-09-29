// Firestore security-rules tests for the activitySessions play-time log
// (see utils/activitySessions.js). Same setup as residents.rules.test.js:
// the real firestore.rules in the local emulator, with users of every role.
//
// Run with `npm run test:rules`.

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

const USERS = {
  adminA: { role: 'Administrator', orgId: 'orgA' },
  caregiverA: { role: 'Caregiver', orgId: 'orgA' },
  volunteerA: { role: 'Volunteer', orgId: 'orgA' },
  familyA: { role: 'Family Caregiver', orgId: 'orgA' },
  caregiverB: { role: 'Caregiver', orgId: 'orgB' },
};

/** Firestore as a signed-in, email-verified user. */
function as(uid, { verified = true } = {}) {
  return uid
    ? env.authenticatedContext(uid, { email_verified: verified }).firestore()
    : env.unauthenticatedContext().firestore();
}

/** A valid session for `uid`, as utils/activitySessions.js would write it. */
function session(uid, overrides = {}) {
  return {
    facilityId: USERS[uid]?.orgId ?? 'orgA',
    residentId: 'residentA',
    isGuest: false,
    activityType: 'game',
    activityId: 'molehunt',
    difficulty: 'gentle',
    roundsStarted: 2,
    roundsCompleted: 1,
    startedAt: new Date('2026-09-28T10:00:00Z'),
    endedAt: new Date('2026-09-28T10:05:00Z'),
    durationSeconds: 300,
    userId: uid,
    userRole: USERS[uid]?.role ?? 'Caregiver',
    ...overrides,
  };
}

async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, data] of Object.entries(USERS)) {
      await setDoc(doc(db, 'users', uid), data);
    }
    await setDoc(doc(db, 'residents', 'residentA'), {
      name: 'Ann',
      caregiverId: 'caregiverA',
      createdBy: 'caregiverA',
      facilityId: 'orgA',
      assignedCaregivers: ['caregiverA'],
    });
    await setDoc(doc(db, 'residents', 'residentB'), {
      name: 'Bob',
      caregiverId: 'caregiverB',
      createdBy: 'caregiverB',
      facilityId: 'orgB',
      assignedCaregivers: ['caregiverB'],
    });
    // One existing session in each facility, for the read tests.
    await setDoc(doc(db, 'activitySessions', 'sessionA'), session('caregiverA'));
    await setDoc(
      doc(db, 'activitySessions', 'sessionB'),
      session('caregiverB', { residentId: 'residentB' })
    );
  });
}

beforeAll(async () => {
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

const sessions = (db) => collection(db, 'activitySessions');

describe('activitySessions: create', () => {
  it('lets staff log a session for a resident in their facility', async () => {
    await assertSucceeds(addDoc(sessions(as('caregiverA')), session('caregiverA')));
    // A volunteer isn't assigned but sees the whole facility.
    await assertSucceeds(addDoc(sessions(as('volunteerA')), session('volunteerA')));
  });

  it('accepts every non-game Resident Mode activity (no difficulty)', async () => {
    const db = as('caregiverA');
    for (const type of ['music', 'movies', 'trivia', 'photoAlbum', 'meditation', 'conversation']) {
      await assertSucceeds(
        addDoc(
          sessions(db),
          session('caregiverA', { activityType: type, activityId: type, difficulty: null })
        )
      );
    }
  });

  it('lets anyone log a Guest Mode session in their own facility', async () => {
    await assertSucceeds(
      addDoc(sessions(as('familyA')), session('familyA', { residentId: null, isGuest: true }))
    );
  });

  it('refuses signed-out and unverified users', async () => {
    await assertFails(addDoc(sessions(as(null)), session('caregiverA')));
    await assertFails(
      addDoc(sessions(as('caregiverA', { verified: false })), session('caregiverA'))
    );
  });

  it('refuses logging as someone else, another role, or another facility', async () => {
    const db = as('caregiverA');
    await assertFails(addDoc(sessions(db), session('caregiverA', { userId: 'adminA' })));
    await assertFails(addDoc(sessions(db), session('caregiverA', { userRole: 'Administrator' })));
    await assertFails(addDoc(sessions(db), session('caregiverA', { facilityId: 'orgB' })));
  });

  it("refuses sessions for another facility's resident, or one you aren't linked to", async () => {
    await assertFails(
      addDoc(sessions(as('caregiverA')), session('caregiverA', { residentId: 'residentB' }))
    );
    // familyA is in orgA but not linked to residentA (families don't see the whole facility).
    await assertFails(addDoc(sessions(as('familyA')), session('familyA')));
  });

  it('refuses extra or missing fields and badly shaped values', async () => {
    const db = as('caregiverA');
    await assertFails(addDoc(sessions(db), session('caregiverA', { residentName: 'Ann' })));
    const missing = session('caregiverA');
    delete missing.difficulty;
    await assertFails(addDoc(sessions(db), missing));
    await assertFails(addDoc(sessions(db), session('caregiverA', { activityId: 'Ann likes it!' })));
    await assertFails(addDoc(sessions(db), session('caregiverA', { activityType: 'notes' })));
    await assertFails(addDoc(sessions(db), session('caregiverA', { difficulty: 'hard' })));
    await assertFails(addDoc(sessions(db), session('caregiverA', { durationSeconds: 5 })));
    await assertFails(addDoc(sessions(db), session('caregiverA', { roundsCompleted: 3 })));
    // A guest visit can't name a resident, and a resident visit must.
    await assertFails(addDoc(sessions(db), session('caregiverA', { isGuest: true })));
    await assertFails(addDoc(sessions(db), session('caregiverA', { residentId: null })));
  });
});

describe('activitySessions: read', () => {
  it('lets facility staff read and list their own facility', async () => {
    for (const uid of ['adminA', 'caregiverA', 'volunteerA']) {
      const db = as(uid);
      await assertSucceeds(getDoc(doc(db, 'activitySessions', 'sessionA')));
      await assertSucceeds(getDocs(query(sessions(db), where('facilityId', '==', 'orgA'))));
    }
  });

  it("refuses other facilities' sessions, and family members (for now)", async () => {
    await assertFails(getDoc(doc(as('caregiverA'), 'activitySessions', 'sessionB')));
    await assertFails(
      getDocs(query(sessions(as('caregiverA')), where('facilityId', '==', 'orgB')))
    );
    await assertFails(getDoc(doc(as('familyA'), 'activitySessions', 'sessionA')));
  });
});

describe('activitySessions: immutable', () => {
  it('refuses every update and delete, even by an administrator', async () => {
    const db = as('adminA');
    await assertFails(updateDoc(doc(db, 'activitySessions', 'sessionA'), { roundsStarted: 5 }));
    await assertFails(deleteDoc(doc(db, 'activitySessions', 'sessionA')));
  });
});
