// Shared setup for scripts/seed-test-org.js and scripts/teardown-test-org.js:
// connects the Firebase Admin SDK with a service account key and holds the
// few constants both scripts must agree on (which orgs and emails count as
// test data), so the teardown can never drift from what the seed creates.
//
// The key's path comes from GOOGLE_APPLICATION_CREDENTIALS — the variable
// the Admin SDK itself understands — and is never committed (.gitignore
// covers secrets/ and *service-account*.json). The project is the one the
// key belongs to, printed before anything is written.
//
// When the Firestore and Auth emulators are running (FIRESTORE_EMULATOR_HOST
// and FIREBASE_AUTH_EMULATOR_HOST set) no key is needed and the emulator's
// demo project is used, so the scripts can be tried without touching live
// data.

const fs = require('fs');
const path = require('path');

// firebase-admin is only installed under functions/ (like the other
// scripts in this folder), so resolve it from there.
const fromFunctions = (id) =>
  require(require.resolve(id, { paths: [path.join(__dirname, '..', 'functions')] }));
// firebase-admin 13+ has no admin.firestore() namespace: each service is
// imported from its own subpath.
const { initializeApp, cert } = fromFunctions('firebase-admin/app');
const { getAuth } = fromFunctions('firebase-admin/auth');
const { FieldValue, Timestamp, getFirestore } = fromFunctions('firebase-admin/firestore');

// Only organizations whose name starts with this are test data. The seed
// names its orgs "TEST …" and the teardown deletes nothing else.
const TEST_ORG_PREFIX = 'TEST';
// Every seeded account uses this (reserved, non-routable) email domain, so
// the teardown's safety net can find stragglers by email alone.
const TEST_EMAIL_DOMAIN = 'welicare-test.example';

/**
 * Initializes the Admin SDK and returns { db, auth, projectId }.
 * Exits with a message if no usable credentials are configured.
 */
function initAdmin() {
  const emulator = process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST;
  let projectId;
  let app;
  if (emulator) {
    projectId = process.env.GCLOUD_PROJECT || 'demo-welicare';
    app = initializeApp({ projectId });
  } else {
    const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!keyPath || !fs.existsSync(keyPath)) {
      console.error(
        'Set GOOGLE_APPLICATION_CREDENTIALS to the path of a Firebase service account key\n' +
          '(e.g. secrets\\welicare-service-account.json). See docs/TESTING.md.'
      );
      process.exit(1);
    }
    const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    projectId = key.project_id;
    app = initializeApp({ credential: cert(key), projectId });
  }
  console.log(`Firebase project: ${projectId}${emulator ? ' (emulator)' : ''}\n`);
  return { db: getFirestore(app), auth: getAuth(app), projectId };
}

module.exports = { initAdmin, FieldValue, Timestamp, TEST_ORG_PREFIX, TEST_EMAIL_DOMAIN };
