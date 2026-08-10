// One-off migration: converts existing musicLibrary docs (seeded with the
// old schema — a singular `genre` string, no `artist` field) to the new
// schema screens/MusicLibraryScreen.js, MusicSelectionScreen.js, and
// CurateResidentMusicScreen.js now read/write:
//   - artist defaults to the doc's current channelTitle.
//   - genre (string) becomes genres (string[] containing just that value).
// Everything else (decade, videoId, title, channelTitle, thumbnailUrl,
// addedAt, addedByUid) is left untouched — including the old `genre`
// field itself, which just goes unused after this runs rather than being
// deleted.
//
// Safe to re-run: a doc that already has an `artist` field is assumed
// already migrated and is skipped, so running this twice won't clobber an
// artist name a caregiver has since edited by hand.
//
// Same REST API + gcloud access-token approach as seedMusicLibrary.js (not
// firebase-admin) — see that script's header comment for why.
//
// Usage:
//   node scripts/migrateMusicLibrarySchema.js
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

// PATCH with an explicit updateMask so only artist/genres are touched —
// every other field on the doc (including the old `genre` string) is left
// exactly as-is.
function patchDocument(accessToken, documentName, artist, genres) {
  const params = new URLSearchParams();
  params.append('updateMask.fieldPaths', 'artist');
  params.append('updateMask.fieldPaths', 'genres');
  const body = {
    fields: {
      artist: { stringValue: artist },
      genres: { arrayValue: { values: genres.map((g) => ({ stringValue: g })) } },
    },
  };
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

    if (fields.artist?.stringValue) {
      console.log(`Skipped "${title}" (already migrated)`);
      skipped += 1;
      continue;
    }

    const channelTitle = fields.channelTitle?.stringValue ?? '';
    const genre = fields.genre?.stringValue;
    const genres = genre ? [genre] : [];

    await patchDocument(accessToken, document.name, channelTitle, genres);
    console.log(`Migrated "${title}"`);
    migrated += 1;
  }

  console.log(`Done: ${migrated} migrated, ${skipped} already up to date.`);
}

migrate().catch((e) => {
  console.error('Failed to migrate musicLibrary schema:', e.message);
  process.exit(1);
});
