// One-off migration: stamps facilityId: "global" onto every existing
// musicLibrary doc that doesn't already have a facilityId field — i.e.
// everything seeded by scripts/seedMusicLibrary.js before facility scoping
// existed. Going forward, new entries added through
// screens/MusicLibraryScreen.js get the adding caregiver's own
// organization id instead (see firestore.rules and
// utils/musicLibraryQuery.js).
//
// Idempotent: a doc that already has a facilityId is assumed already
// migrated (or added post-scoping with a real org id) and is skipped, so
// running this twice never overwrites a real organization id with
// "global".
//
// Same REST API + gcloud access-token approach as the other
// seed/migration scripts (not firebase-admin) — see
// scripts/seedMusicLibrary.js's header comment for why.
//
// Usage:
//   node scripts/migrateMusicLibraryFacilityScope.js
//
// Requires the gcloud CLI, authenticated with access to the "welicare"
// project's Firestore — run `gcloud auth application-default login`
// first if `gcloud auth print-access-token` doesn't already work.
const { execSync } = require('child_process');
const https = require('https');

const PROJECT_ID = 'welicare';

function getAccessToken() {
  return execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
}

function firestoreRequest(accessToken, method, path, body) {
  const payload = body ? JSON.stringify(body) : null;
  const options = {
    hostname: 'firestore.googleapis.com',
    path,
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data ? JSON.parse(data) : {});
        } else {
          reject(new Error(`Firestore API error (${res.statusCode}): ${data}`));
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function loadAllDocuments(accessToken) {
  const documents = [];
  let pageToken;
  do {
    const params = new URLSearchParams({ pageSize: '100' });
    if (pageToken) params.set('pageToken', pageToken);
    const result = await firestoreRequest(
      accessToken,
      'GET',
      `/v1/projects/${PROJECT_ID}/databases/(default)/documents/musicLibrary?${params.toString()}`
    );
    documents.push(...(result.documents ?? []));
    pageToken = result.nextPageToken;
  } while (pageToken);
  return documents;
}

// PATCH with an explicit updateMask so only facilityId is touched — every
// other field on the doc is left exactly as-is.
function patchFacilityId(accessToken, documentName) {
  const params = new URLSearchParams();
  params.append('updateMask.fieldPaths', 'facilityId');
  const body = { fields: { facilityId: { stringValue: 'global' } } };
  return firestoreRequest(accessToken, 'PATCH', `/v1/${documentName}?${params.toString()}`, body);
}

async function migrate() {
  const accessToken = getAccessToken();
  const documents = await loadAllDocuments(accessToken);

  let migrated = 0;
  let skipped = 0;
  for (const document of documents) {
    const fields = document.fields ?? {};
    const title = fields.title?.stringValue ?? document.name;

    if (fields.facilityId?.stringValue) {
      console.log(`Skipped "${title}" (already has facilityId: ${fields.facilityId.stringValue})`);
      skipped += 1;
      continue;
    }

    await patchFacilityId(accessToken, document.name);
    console.log(`Migrated "${title}"`);
    migrated += 1;
  }

  console.log(`Done: ${migrated} migrated, ${skipped} already up to date.`);
}

migrate().catch((e) => {
  console.error('Failed to migrate musicLibrary facility scope:', e.message);
  process.exit(1);
});
