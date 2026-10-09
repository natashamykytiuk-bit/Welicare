// Firestore security-rules tests for suggestionFeedback, the good/bad
// ratings on AI suggestions (see utils/suggestionFeedback.js). Same setup as
// activitySessions.rules.test.js: the real firestore.rules in the local
// emulator, with users of every role. Suggestion text is fictional.
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
  serverTimestamp,
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
  adminB: { role: 'Administrator', orgId: 'orgB' },
};

/** Firestore as a signed-in, email-verified user. */
function as(uid, { verified = true } = {}) {
  return uid
    ? env.authenticatedContext(uid, { email_verified: verified }).firestore()
    : env.unauthenticatedContext().firestore();
}

/** A valid rating by `uid`, as utils/suggestionFeedback.js would write it. */
function rating(uid, overrides = {}) {
  return {
    facilityId: USERS[uid]?.orgId ?? 'orgA',
    kind: 'conversation',
    promptVersion: 'v2',
    itemText: 'Big band music — try "That\'s a lovely tune, isn\'t it?"',
    rating: 'good',
    userId: uid,
    userRole: USERS[uid]?.role ?? 'Caregiver',
    createdAt: serverTimestamp(),
    ...overrides,
  };
}

async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, data] of Object.entries(USERS)) {
      await setDoc(doc(db, 'users', uid), data);
    }
    // One existing rating in orgA, for the read tests.
    await setDoc(doc(db, 'suggestionFeedback', 'ratingA'), {
      ...rating('caregiverA'),
      createdAt: new Date('2026-10-01T10:00:00Z'),
    });
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

const ratings = (db) => collection(db, 'suggestionFeedback');

describe('suggestionFeedback: create', () => {
  it('lets facility staff rate a suggestion in their own facility', async () => {
    for (const uid of ['adminA', 'caregiverA', 'volunteerA']) {
      await assertSucceeds(addDoc(ratings(as(uid)), rating(uid)));
    }
    await assertSucceeds(addDoc(ratings(as('caregiverA')), rating('caregiverA', { rating: 'bad' })));
  });

  it('refuses family caregivers, signed-out and unverified users', async () => {
    await assertFails(addDoc(ratings(as('familyA')), rating('familyA')));
    await assertFails(addDoc(ratings(as(null)), rating('caregiverA')));
    await assertFails(addDoc(ratings(as('caregiverA', { verified: false })), rating('caregiverA')));
  });

  it('refuses rating as someone else, another role, or another facility', async () => {
    const db = as('caregiverA');
    await assertFails(addDoc(ratings(db), rating('caregiverA', { userId: 'adminA' })));
    await assertFails(addDoc(ratings(db), rating('caregiverA', { userRole: 'Administrator' })));
    await assertFails(addDoc(ratings(db), rating('caregiverA', { facilityId: 'orgB' })));
  });

  it('refuses extra or missing fields and badly shaped values', async () => {
    const db = as('caregiverA');
    // No resident details may ride along.
    await assertFails(addDoc(ratings(db), rating('caregiverA', { residentId: 'residentA' })));
    const missing = rating('caregiverA');
    delete missing.promptVersion;
    await assertFails(addDoc(ratings(db), missing));
    await assertFails(addDoc(ratings(db), rating('caregiverA', { rating: 'meh' })));
    await assertFails(addDoc(ratings(db), rating('caregiverA', { kind: 'Ann likes it!' })));
    await assertFails(addDoc(ratings(db), rating('caregiverA', { promptVersion: 'v 2 !' })));
    await assertFails(addDoc(ratings(db), rating('caregiverA', { itemText: '' })));
    await assertFails(addDoc(ratings(db), rating('caregiverA', { itemText: 'x'.repeat(501) })));
    // The server's clock only.
    await assertFails(addDoc(ratings(db), rating('caregiverA', { createdAt: new Date() })));
  });
});

describe('suggestionFeedback: read', () => {
  it("lets only the facility's administrators read and list ratings", async () => {
    const db = as('adminA');
    await assertSucceeds(getDoc(doc(db, 'suggestionFeedback', 'ratingA')));
    await assertSucceeds(getDocs(query(ratings(db), where('facilityId', '==', 'orgA'))));
  });

  it('refuses other roles and other facilities', async () => {
    for (const uid of ['caregiverA', 'volunteerA', 'familyA', 'adminB']) {
      await assertFails(getDoc(doc(as(uid), 'suggestionFeedback', 'ratingA')));
    }
    await assertFails(
      getDocs(query(ratings(as('adminB')), where('facilityId', '==', 'orgA')))
    );
  });
});

describe('suggestionFeedback: immutable', () => {
  it('refuses every update and delete, even by an administrator', async () => {
    const db = as('adminA');
    await assertFails(updateDoc(doc(db, 'suggestionFeedback', 'ratingA'), { rating: 'bad' }));
    await assertFails(deleteDoc(doc(db, 'suggestionFeedback', 'ratingA')));
  });
});
