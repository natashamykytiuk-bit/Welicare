// Infrastructure shared by the account, organization and resident
// functions: the lazily-initialised Admin SDK, a BulkWriter that reports
// failed writes, and resident photo cleanup.
const { HttpsError } = require('firebase-functions/v2/https');

// A BulkWriter that remembers the outcome of every write it's given.
//
// BulkWriter.close() resolves once everything has been attempted, but never
// rejects — a write that failed (after BulkWriter's own retries) only shows
// up on that write's own promise. finish() waits for all of them and throws
// if ANY failed, so callers can refuse to carry on to their final,
// irreversible step (deleting the account or the organization) until every
// cleanup write is confirmed. Each promise gets a handler immediately, so a
// failure can't surface as an unhandled rejection before finish() runs.
// All the writes used with it are safe to repeat, so a failed run can just
// be retried.
function trackedBulkWriter(db, label) {
  const writer = db.bulkWriter();
  const outcomes = [];
  const track = (promise, what) =>
    outcomes.push(
      promise.then(
        () => null,
        (error) => ({ what, error })
      )
    );
  return {
    delete: (ref) => track(writer.delete(ref), `delete ${ref.path}`),
    update: (ref, data) => track(writer.update(ref, data), `update ${ref.path}`),
    async finish() {
      await writer.close();
      const failures = (await Promise.all(outcomes)).filter(Boolean);
      if (failures.length) {
        for (const f of failures) console.error(`[${label}] ${f.what} failed:`, f.error);
        throw new HttpsError(
          'internal',
          'Something went wrong partway through. Nothing important was lost — please try again.',
          { reason: 'cleanup-incomplete', failed: failures.length }
        );
      }
    },
  };
}

// The Admin SDK, initialised on first use rather than at load, so functions
// that never touch it (AI suggestions, YouTube search) don't pay for it on
// cold start.
//
// firebase-admin 13+ has no admin.firestore() / admin.auth() namespace any
// more: each service comes from its own subpath (firebase-admin/firestore,
// …). getAdmin() returns the same three accessors the rest of this file
// already calls, so callers read the same as before.
let adminApp = null;
function getAdmin() {
  // getApps()[0]: ai.js / youtube.js may have initialised the default app
  // already (for their usage limits) if they ran first on this instance.
  if (!adminApp) {
    const { getApps, initializeApp } = require('firebase-admin/app');
    adminApp = getApps()[0] ?? initializeApp();
  }
  return {
    firestore: () => require('firebase-admin/firestore').getFirestore(adminApp),
    auth: () => require('firebase-admin/auth').getAuth(adminApp),
    storage: () => require('firebase-admin/storage').getStorage(adminApp),
  };
}

// Removes a resident's files and photo album: EVERYTHING under
// residents/{residentId}/ in Cloud Storage (the album's photos/ and the
// profile.jpg profile photo), and every residents/{residentId}/photos/*
// doc queued on `writer` (deleting the resident doc doesn't delete its
// subcollections). Files first, so if that fails the docs are still there
// and a retry finds everything again. deleteFiles on a prefix with nothing
// under it is a no-op, so this is safe to repeat. See
// utils/residentPhotos.js and utils/profilePhotos.js for the layout.
async function deleteResidentPhotos(admin, writer, residentRef) {
  await admin
    .storage()
    .bucket()
    .deleteFiles({ prefix: `residents/${residentRef.id}/` });
  const photos = await residentRef.collection('photos').get();
  for (const photo of photos.docs) writer.delete(photo.ref);
}

module.exports = { trackedBulkWriter, getAdmin, deleteResidentPhotos };
