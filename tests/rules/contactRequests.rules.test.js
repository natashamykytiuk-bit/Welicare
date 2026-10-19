// Firestore security-rules tests for contactRequests, the public website's
// Contact form (web/src/pages/ContactPage.tsx). Same setup as
// suggestionFeedback.rules.test.js: the real firestore.rules in the local
// emulator. Visitors are signed out, so creates run unauthenticated; reads
// are closed to everyone, including Administrators (see the rules comment).
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

/** A valid submission, as ContactPage.tsx writes it. Details are made up. */
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
    // One existing submission, for the read tests.
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

describe('contactRequests: create', () => {
  test('a signed-out visitor can send a valid request', async () => {
    await assertSucceeds(addDoc(requests(as(null)), request()));
  });

  test('organization may be empty', async () => {
    await assertSucceeds(addDoc(requests(as(null)), request({ organization: '' })));
  });

  test('a missing field is rejected', async () => {
    const { email, ...noEmail } = request();
    await assertFails(addDoc(requests(as(null)), noEmail));
  });

  test('an empty name is rejected', async () => {
    await assertFails(addDoc(requests(as(null)), request({ name: '' })));
  });

  test('an extra field is rejected', async () => {
    await assertFails(addDoc(requests(as(null)), request({ isAdmin: true })));
  });

  test('a message over 3000 characters is rejected', async () => {
    await assertFails(addDoc(requests(as(null)), request({ message: 'a'.repeat(3001) })));
  });

  test('an unknown role is rejected', async () => {
    await assertFails(addDoc(requests(as(null)), request({ role: 'Administrator' })));
  });

  test('a status other than "new" is rejected', async () => {
    await assertFails(addDoc(requests(as(null)), request({ status: 'done' })));
  });

  test('a client-chosen createdAt is rejected', async () => {
    await assertFails(addDoc(requests(as(null)), request({ createdAt: new Date('2020-01-01') })));
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
