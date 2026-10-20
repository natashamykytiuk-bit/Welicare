// Firestore security-rules tests for contactRequests, the public website's
// Contact form (web/src/pages/ContactPage.tsx). Same setup as
// suggestionFeedback.rules.test.js: the real firestore.rules in the local
// emulator. Submissions go through the submitContactRequest Cloud Function
// (rate-limited, see functions/contactRequest.js), so the rules refuse every
// client write, even a well-formed one, and every read, including
// Administrators' (see the rules comment). The field checks themselves are
// unit-tested in tests/contactRequest.test.js.
//
// Run with `npm run test:rules`.

const fs = require('fs');
const path = require('path');
const {
  assertFails,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  setLogLevel,
} = require('firebase/firestore');

let env;

/** Firestore as a signed-in, email-verified user, or signed out for null. */
function as(uid) {
  return uid
    ? env.authenticatedContext(uid, { email_verified: true }).firestore()
    : env.unauthenticatedContext().firestore();
}

/** A well-formed submission, as the website used to write it. Details are made up. */
function request(overrides = {}) {
  return {
    name: 'Pat Example',
    email: 'pat@example.com',
    organization: 'Maple Grove Care',
    role: 'Care home administrator',
    message: 'We’d like to hear more about a pilot.',
    wantsPilot: true,
    createdAt: serverTimestamp(),
    status: 'new',
    ...overrides,
  };
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
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', 'adminA'), { role: 'Administrator', orgId: 'orgA' });
    // One existing submission, for the read and update tests.
    await setDoc(doc(db, 'contactRequests', 'req1'), {
      ...request(),
      createdAt: new Date('2026-10-01T10:00:00Z'),
    });
  });
});

afterAll(async () => {
  await env.cleanup();
});

const requests = (db) => collection(db, 'contactRequests');

describe('contactRequests: write', () => {
  // The bypass the function exists to close: writing directly with the
  // site's public config would skip the rate limit.
  test('a signed-out visitor cannot write directly, even a valid request', async () => {
    await assertFails(addDoc(requests(as(null)), request()));
  });

  test('a signed-in user cannot write directly either', async () => {
    await assertFails(addDoc(requests(as('adminA')), request()));
  });

  test('nobody can change or delete a submission', async () => {
    await assertFails(setDoc(doc(as('adminA'), 'contactRequests', 'req1'), { status: 'done' }, { merge: true }));
  });
});

describe('contactRequests: read', () => {
  test('a signed-out visitor cannot read submissions', async () => {
    await assertFails(getDoc(doc(as(null), 'contactRequests', 'req1')));
    await assertFails(getDocs(requests(as(null))));
  });

  // Anyone can sign up as an Administrator, so that role alone must not
  // reveal other people's names and emails.
  test('an organization Administrator cannot read submissions either', async () => {
    await assertFails(getDoc(doc(as('adminA'), 'contactRequests', 'req1')));
    await assertFails(getDocs(requests(as('adminA'))));
  });
});
