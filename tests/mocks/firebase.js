// Shared Firebase mock for Jest. Tests never talk to real Firebase — every
// Firebase function the app calls is replaced with a jest.fn() here, and
// each test decides what it returns.
//
// How it's wired up: jest.setup.js calls jest.mock('firebase/firestore',
// ...) etc. and points them at the objects below, so when a screen does
// `import { getDoc } from 'firebase/firestore'` it gets `firestore.getDoc`
// from this file instead.
//
// In a test:
//   import { firestore, resetFirebaseMocks, docSnap } from '../mocks/firebase';
//   firestore.getDoc.mockResolvedValueOnce(docSnap({ role: 'Caregiver' }));  // success
//   firestore.getDoc.mockRejectedValueOnce(new Error('offline'));            // failure
//
// resetFirebaseMocks() runs before every test (see jest.setup.js), so one
// test's setup never leaks into the next.

/**
 * Builds a fake Firestore DocumentSnapshot — just the parts the app uses.
 * @param {object | undefined} data undefined → a document that doesn't exist.
 * @param {string} [id]
 */
function docSnap(data, id = 'doc-id') {
  return { id, exists: () => data !== undefined, data: () => data };
}

// Every writeBatch() the code creates, in order. Each records the writes
// queued on it (as ['set' | 'update' | 'delete', path, data]) and has a
// jest.fn commit(), so a test can check exactly what would be written
// together — and make commit() reject to simulate the batch failing.
const batches = [];
function newBatch() {
  const batch = {
    ops: [],
    set: jest.fn((ref, data) => batch.ops.push(['set', ref.path, data])),
    update: jest.fn((ref, data) => batch.ops.push(['update', ref.path, data])),
    delete: jest.fn((ref) => batch.ops.push(['delete', ref.path])),
    commit: jest.fn(async () => {}),
  };
  batches.push(batch);
  return batch;
}

const firestore = {
  // Reference builders just return a description of the path, so tests can
  // assert on what was read/written if they want to.
  // doc(collection(...)) with no id invents one, like the real SDK does.
  doc: jest.fn((base, ...path) =>
    path.length
      ? { path: path.join('/'), id: path[path.length - 1] }
      : { path: `${base.path}/new-id`, id: 'new-id' }
  ),
  collection: jest.fn((_db, ...path) => ({ path: path.join('/') })),
  query: jest.fn((ref) => ref),
  where: jest.fn(() => ({})),
  getDoc: jest.fn(),
  // Server-only read (skips the offline cache) — used to confirm whether a
  // slow write really landed.
  getDocFromServer: jest.fn(),
  getDocs: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  addDoc: jest.fn(),
  deleteDoc: jest.fn(),
  writeBatch: jest.fn(() => newBatch()),
  arrayUnion: jest.fn((...v) => ({ arrayUnion: v })),
  arrayRemove: jest.fn((...v) => ({ arrayRemove: v })),
  deleteField: jest.fn(() => ({ deleteField: true })),
  serverTimestamp: jest.fn(() => ({ serverTimestamp: true })),
  runTransaction: jest.fn(),
};

// runTransaction(db, fn) runs fn once with a transaction whose get / set /
// update go through the getDoc / setDoc / updateDoc mocks above — so tests
// set up reads and check writes the same way as for non-transaction code.
function runTransactionImpl(_db, fn) {
  return fn({
    get: (ref) => firestore.getDoc(ref),
    set: (ref, data) => firestore.setDoc(ref, data),
    update: (ref, data) => firestore.updateDoc(ref, data),
  });
}
firestore.runTransaction.mockImplementation(runTransactionImpl);

// The signed-in user every test starts with. Tests can change fields or set
// auth.currentUser = null to simulate being signed out.
const defaultUser = () => ({
  uid: 'test-uid',
  email: 'tester@example.com',
  emailVerified: true,
  getIdTokenResult: jest.fn(async () => ({ claims: {} })),
});

// Stands in for the `auth` object exported by firebaseConfig.js.
const auth = { currentUser: defaultUser() };

const authModule = {
  getAuth: jest.fn(() => auth),
  onAuthStateChanged: jest.fn(() => () => {}),
  signOut: jest.fn(async () => {}),
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  deleteUser: jest.fn(),
  sendEmailVerification: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  reauthenticateWithCredential: jest.fn(),
  EmailAuthProvider: { credential: jest.fn(() => ({})) },
};

// httpsCallable(functions, 'name') returns the same jest.fn per name, so a
// test can grab it with callable('generateSuggestions') and set its result.
const callables = {};
function callable(name) {
  if (!callables[name]) callables[name] = jest.fn();
  return callables[name];
}
const functionsModule = {
  getFunctions: jest.fn(() => ({})),
  httpsCallable: jest.fn((_functions, name) => callable(name)),
};

function resetFirebaseMocks() {
  for (const fn of [
    ...Object.values(firestore),
    ...Object.values(authModule),
    ...Object.values(callables),
  ]) {
    if (typeof fn?.mockReset === 'function') fn.mockReset();
  }
  // mockReset wipes the default implementations above, so restore the ones
  // that should keep working without per-test setup.
  firestore.doc.mockImplementation((base, ...path) =>
    path.length
      ? { path: path.join('/'), id: path[path.length - 1] }
      : { path: `${base.path}/new-id`, id: 'new-id' }
  );
  firestore.collection.mockImplementation((_db, ...path) => ({ path: path.join('/') }));
  firestore.query.mockImplementation((ref) => ref);
  firestore.where.mockImplementation(() => ({}));
  firestore.writeBatch.mockImplementation(() => newBatch());
  firestore.runTransaction.mockImplementation(runTransactionImpl);
  batches.length = 0;
  authModule.getAuth.mockImplementation(() => auth);
  authModule.onAuthStateChanged.mockImplementation(() => () => {});
  functionsModule.httpsCallable.mockImplementation((_functions, name) => callable(name));
  auth.currentUser = defaultUser();
}

module.exports = {
  batches,
  firestore,
  auth,
  authModule,
  functionsModule,
  callable,
  docSnap,
  resetFirebaseMocks,
};
