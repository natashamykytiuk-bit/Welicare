// Reusable seed script: adds new entries to the shared musicLibrary
// collection (see firestore.rules and MusicLibraryScreen) so there's
// something in Music before a caregiver curates it manually. Safe to
// re-run as new batches are appended below — anything already in
// musicLibrary (matched by videoId) is skipped rather than duplicated.
//
// Talks to the Firestore REST API directly with Node's built-in `https`
// module rather than the firebase-admin SDK: firebase-admin's bundled
// google-auth-library fetches OAuth tokens via gaxios, which on newer Node
// versions (confirmed on Node 24) fails against oauth2.googleapis.com with
// "Invalid response body ... Premature close" — a known gaxios/undici
// incompatibility, unrelated to credentials. `gcloud` itself isn't
// affected (different HTTP stack), so this script shells out to it for the
// access token instead.
//
// Usage:
//   node scripts/seedMusicLibrary.js
//
// Requires the gcloud CLI, authenticated with access to the "welicare"
// project's Firestore — run `gcloud auth application-default login`
// first if `gcloud auth print-access-token` doesn't already work.
const { execSync } = require('child_process');
const https = require('https');

const PROJECT_ID = 'welicare';

function getAccessToken() {
  // execSync (not execFileSync) so this resolves `gcloud` through the
  // shell — on Windows the executable is actually gcloud.cmd, which
  // execFileSync can't invoke directly without shell involvement.
  return execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
}

// Track shape matches the current musicLibrary schema (see
// scripts/migrateMusicLibrarySchema.js): artist is a display name separate
// from channelTitle, genres is an array. channelTitle is optional per
// entry below — when omitted, toFirestoreFields falls back to artist,
// since for hand-curated batches there's often no meaningfully different
// YouTube channel name to record.
//
// Genre values are matched against MUSIC_GENRE_OPTIONS
// (screens/BuildProfileScreen.js) so these entries show up correctly under
// Music Library's filter chips.
const STARTER_TRACKS = [
  {
    videoId: 'JYuyWrkwpok',
    title: 'Fly Me To The Moon',
    channelTitle: 'Frank Sinatra',
    artist: 'Frank Sinatra',
    genres: ['Big Band'],
    decade: '1950s',
  },
  {
    videoId: 'UvTnTXKl69Q',
    title: 'Unforgettable',
    channelTitle: 'Nat King Cole',
    artist: 'Nat King Cole',
    genres: ['Jazz'],
    decade: '1950s',
  },
  {
    videoId: 'O-aavAlSYgc',
    title: "Can't Help Falling In Love",
    channelTitle: 'Elvis Presley',
    artist: 'Elvis Presley',
    genres: ['Classic Rock'],
    decade: '1960s',
  },
  {
    videoId: 'rBrd_3VMC3c',
    title: 'What A Wonderful World',
    channelTitle: 'Louis Armstrong',
    artist: 'Louis Armstrong',
    genres: ['Jazz'],
    decade: '1960s',
  },
  {
    videoId: 'xFrGuyw1V8s',
    title: 'Dancing Queen',
    channelTitle: 'ABBA',
    artist: 'ABBA',
    genres: ['Pop'],
    decade: '1970s',
  },
];

const SEED_BATCH_2 = [
  {
    videoId: 'YWKeuYcDAoo',
    title: 'Crazy',
    channelTitle: 'Patsy Cline',
    artist: 'Patsy Cline',
    genres: ['Country'],
    decade: '1960s',
  },
  {
    videoId: '4B6ruPZ3v0c',
    title: 'Smoke Gets In Your Eyes',
    channelTitle: 'The Platters',
    artist: 'The Platters',
    genres: ['Jazz/Doo-wop'],
    decade: '1950s',
  },
  {
    videoId: '2EisY-kIhTU',
    title: "You'll Never Never Know",
    channelTitle: 'The Platters',
    artist: 'The Platters',
    genres: ['R&B/Doo-wop'],
    decade: '1950s',
  },
  {
    videoId: 'BoitbfaVjH0',
    title: "You're No Good",
    channelTitle: 'Linda Ronstadt',
    artist: 'Linda Ronstadt',
    genres: ['Pop/Rock'],
    decade: '1970s',
  },
  {
    videoId: 'ydHlFjKegTU',
    title: 'Only You (And You Alone)',
    channelTitle: 'The Platters',
    artist: 'The Platters',
    genres: ['Doo-wop'],
    decade: '1950s',
  },
  {
    videoId: 'DtVBCG6ThDk',
    title: 'Rocket Man',
    channelTitle: 'Elton John',
    artist: 'Elton John',
    genres: ['Pop/Rock'],
    decade: '1970s',
  },
  {
    videoId: '6IQqlJ4YRRQ',
    title: 'Dream A Little Dream Of Me',
    channelTitle: 'Ella Fitzgerald & Louis Armstrong',
    artist: 'Ella Fitzgerald & Louis Armstrong',
    genres: ['Jazz'],
    decade: '1950s',
  },
  {
    videoId: 'QBDem6bffyo',
    title: 'Be My Baby',
    channelTitle: 'The Ronettes',
    artist: 'The Ronettes',
    genres: ['Pop/R&B'],
    decade: '1960s',
  },
  {
    videoId: 'y3KJ7d2qBoA',
    title: 'My Girl',
    channelTitle: 'The Temptations',
    artist: 'The Temptations',
    genres: ['Motown/Soul'],
    decade: '1960s',
  },
  {
    videoId: 'recWodX-uUo',
    title: 'At Last',
    channelTitle: 'Etta James',
    artist: 'Etta James',
    genres: ['Jazz/Blues'],
    decade: '1950s',
  },
  {
    videoId: 'O-aavAlSYgc',
    title: "Can't Help Falling In Love",
    channelTitle: 'Elvis Presley',
    artist: 'Elvis Presley',
    genres: ['Rock & Roll/Pop'],
    decade: '1960s',
  },
];

// Note: "What A Wonderful World" (Louis Armstrong) is already in
// STARTER_TRACKS above — the videoId-based dedup in seed() skips it
// automatically, so it's not repeated here.
const SEED_BATCH_3 = [
  { videoId: 'qQzdAsjWGPg', title: 'My Way', artist: 'Frank Sinatra', genres: ['Jazz', 'Pop'], decade: '1960s' },
  {
    videoId: 'YFham2Xu6nA',
    title: 'The Way You Look Tonight',
    artist: 'Frank Sinatra',
    genres: ['Jazz', 'Traditional Pop'],
    decade: '1960s',
  },
  {
    videoId: 'WrMGGouem3c',
    title: 'Suspicious Minds',
    artist: 'Elvis Presley',
    genres: ['Rock & Roll', 'Pop'],
    decade: '1960s',
  },
  {
    videoId: 'RUz1pZ_LujU',
    title: "That's Amore",
    artist: 'Dean Martin',
    genres: ['Traditional Pop'],
    decade: '1950s',
  },
  {
    videoId: '3tuJ34YgW0c',
    title: 'Moon River',
    artist: 'Andy Williams',
    genres: ['Traditional Pop'],
    decade: '1960s',
  },
  { videoId: 'gZYtes1RO_w', title: 'L-O-V-E', artist: 'Nat King Cole', genres: ['Jazz'], decade: '1960s' },
  {
    videoId: 't6wjCcWC2aE',
    title: 'Non, je ne regrette rien',
    artist: 'Édith Piaf',
    genres: ['Chanson', 'French Pop'],
    decade: '1960s',
  },
  {
    videoId: 'hOc4ThXE5Ag',
    title: 'La Vie en rose',
    artist: 'Édith Piaf',
    genres: ['Chanson', 'French Pop'],
    decade: '1940s',
  },
  {
    videoId: 'l6U1JB7z-I8',
    title: 'Ladyfingers',
    artist: 'Herb Alpert & The Tijuana Brass',
    genres: ['Jazz', 'Easy Listening'],
    decade: '1960s',
  },
];

const SEED_BATCH_4 = [
  { videoId: '3jL4S4X97sQ', title: 'Vienna', artist: 'Billy Joel', genres: ['Pop', 'Rock'], decade: '1970s' },
  {
    videoId: 'GlPlfCy1urI',
    title: 'Your Song',
    artist: 'Elton John',
    genres: ['Traditional Pop', 'Soft Rock'],
    decade: '1970s',
  },
  {
    videoId: 'mrudT410TAI',
    title: 'Killing Me Softly With His Song',
    artist: 'Roberta Flack',
    genres: ['R&B', 'Soul'],
    decade: '1970s',
  },
  {
    videoId: 'sfPOD2zrQSI',
    title: 'A Sunday Kind Of Love',
    artist: 'Etta James',
    genres: ['Jazz', 'Blues'],
    decade: '1960s',
  },
  {
    videoId: 'lGfeCe0DHtI',
    title: 'Cheek To Cheek',
    artist: 'Ella Fitzgerald & Louis Armstrong',
    genres: ['Jazz'],
    decade: '1950s',
  },
  {
    videoId: 'wy709iNG6i8',
    title: 'Goodbye Yellow Brick Road',
    artist: 'Elton John',
    genres: ['Pop', 'Rock'],
    decade: '1970s',
  },
  {
    videoId: '1BZkYfqa4Fs',
    title: 'Beautiful Boy (Darling Boy)',
    artist: 'John Lennon',
    genres: ['Pop', 'Rock'],
    decade: '1980s',
  },
  {
    videoId: 'GjRLwYs-FXE',
    title: 'Unchained Melody',
    artist: 'The Righteous Brothers',
    genres: ['Pop', 'R&B'],
    decade: '1960s',
  },
  { videoId: 'CGj85pVzRJs', title: 'Let It Be', artist: 'The Beatles', genres: ['Rock'], decade: '1970s' },
];

// Note: this "La Vie en rose" (Louis Armstrong, RQ_33knoPRg) is a
// different video from the Édith Piaf version already in SEED_BATCH_3
// (hOc4ThXE5Ag) — different videoId, so the dedupe check treats it as a
// distinct track rather than a duplicate.
const SEED_BATCH_5 = [
  { videoId: 'k-HdGnzYdFQ', title: "It's Not Unusual", artist: 'Tom Jones', genres: ['Pop'], decade: '1960s' },
  {
    videoId: 'RJi4iDdxY5M',
    title: 'All You Need Is Love',
    artist: 'The Beatles',
    genres: ['Rock', 'Psychedelic Pop'],
    decade: '1960s',
  },
  {
    videoId: 'TDyiREoBw0o',
    title: 'I Say a Little Prayer',
    artist: 'Aretha Franklin',
    genres: ['Soul'],
    decade: '1960s',
  },
  {
    videoId: 'z5i9vT8wGY8',
    title: 'Stand By Me',
    artist: 'Ben E. King',
    genres: ['R&B', 'Soul'],
    decade: '1960s',
  },
  {
    videoId: 'HR43hf2hJhg',
    title: 'Edelweiss',
    artist: 'Bill Lee & Charmian Carr',
    genres: ['Musical', 'Traditional'],
    decade: '1960s',
  },
  { videoId: 'RQ_33knoPRg', title: 'La Vie en rose', artist: 'Louis Armstrong', genres: ['Jazz'], decade: '1950s' },
  {
    videoId: 'HbA71FO3TRs',
    title: 'Everybody Loves Somebody',
    artist: 'Dean Martin',
    genres: ['Traditional Pop'],
    decade: '1960s',
  },
  {
    videoId: 'z0qW9P-uYfM',
    title: "Don't Go Breaking My Heart",
    artist: 'Elton John & Kiki Dee',
    genres: ['Pop', 'Disco'],
    decade: '1970s',
  },
  { videoId: 'TQemQRL_YVQ', title: 'Yesterday', artist: 'The Beatles', genres: ['Rock', 'Pop'], decade: '1960s' },
  {
    videoId: 'XT4pwRi2JmY',
    title: 'I Want To Hold Your Hand',
    artist: 'The Beatles',
    genres: ['Rock and Roll'],
    decade: '1960s',
  },
  {
    videoId: 'AcQjM7gV6mI',
    title: 'Golden Slumbers',
    artist: 'The Beatles',
    genres: ['Rock', 'Soft Rock'],
    decade: '1960s',
  },
];

const SEED_BATCH_6 = [
  {
    videoId: 'DYwQy_9JPtQ',
    title: "Can't Take My Eyes Off You",
    artist: 'Frankie Valli',
    genres: ['Soul', 'Pop'],
    decade: '1960s',
  },
  {
    videoId: 'XpqqjU7u5Yc',
    title: 'How Deep Is Your Love',
    artist: 'Bee Gees',
    genres: ['Soft Rock', 'R&B'],
    decade: '1970s',
  },
  { videoId: 'XvfImv9NseY', title: "That's Life", artist: 'Frank Sinatra', genres: ['Jazz', 'Pop'], decade: '1960s' },
  {
    videoId: 'BTOeRwIUnG0',
    title: 'Strangers In The Night',
    artist: 'Frank Sinatra',
    genres: ['Traditional Pop'],
    decade: '1960s',
  },
  {
    videoId: '5GVStT3aVmo',
    title: 'Emotions',
    artist: 'Brenda Lee',
    genres: ['Country', 'Pop'],
    decade: '1960s',
  },
  {
    videoId: 'TfY8hR5frEQ',
    title: 'Love Grows (Where My Rosemary Goes)',
    artist: 'Edison Lighthouse',
    genres: ['Pop', 'Bubblegum'],
    decade: '1970s',
  },
  {
    videoId: '1sMovtNBnF4',
    title: 'Hopelessly Devoted To You',
    artist: 'Olivia Newton-John',
    genres: ['Pop', 'Country'],
    decade: '1970s',
  },
  {
    videoId: 'YSNsG6glf_U',
    title: 'Dedicated To The One I Love',
    artist: 'The Mamas & The Papas',
    genres: ['Pop', 'Folk Rock'],
    decade: '1960s',
  },
  {
    videoId: 'NI6aOFI7hms',
    title: 'Lovefool',
    artist: 'The Cardigans',
    genres: ['Pop Rock'],
    decade: '1990s',
  },
  {
    videoId: 'o0WWaA3oFa4',
    title: 'A Man Without Love',
    artist: 'Engelbert Humperdinck',
    genres: ['Traditional Pop'],
    decade: '1960s',
  },
  { videoId: '-vTBV-9Y4fQ', title: "She's Got You", artist: 'Patsy Cline', genres: ['Country'], decade: '1960s' },
];

// Note: "(What A) Wonderful World" (Sam Cooke, vizl2aAONVY) is a different
// song from "What A Wonderful World" (Louis Armstrong, already in
// STARTER_TRACKS) despite the similar title — different videoId, so it's
// added as its own distinct track rather than deduped away.
const SEED_BATCH_7 = [
  {
    videoId: 'd0nxki7eGg8',
    title: 'Twilight Time',
    artist: 'The Platters',
    genres: ['Doo-wop', 'Traditional Pop'],
    decade: '1950s',
  },
  {
    videoId: 'FWDFGYMNv3Q',
    title: "It's Been a Long, Long Time",
    artist: 'Harry James & His Orchestra, Kitty Kallen',
    genres: ['Big Band'],
    decade: '1940s',
  },
  {
    videoId: 'KALDQZSTSdk',
    title: 'My Prayer',
    artist: 'The Platters',
    genres: ['Doo-wop', 'Traditional Pop'],
    decade: '1950s',
  },
  { videoId: 'h3JFEfdK_Ls', title: 'My Life', artist: 'Billy Joel', genres: ['Pop', 'Rock'], decade: '1970s' },
  {
    videoId: '6dYWe1c3OyU',
    title: 'I Will Survive',
    artist: 'Gloria Gaynor',
    genres: ['Disco', 'Soul'],
    decade: '1970s',
  },
  {
    videoId: 'vizl2aAONVY',
    title: '(What A) Wonderful World',
    artist: 'Sam Cooke',
    genres: ['R&B', 'Soul'],
    decade: '1960s',
  },
  {
    videoId: 'PSddD6w5SKc',
    title: 'Under the Boardwalk',
    artist: 'The Drifters',
    genres: ['Pop-Soul'],
    decade: '1960s',
  },
  {
    videoId: 'vupwAFMXLkA',
    title: 'Top Of The World',
    artist: 'Carpenters',
    genres: ['Soft Rock', 'Pop'],
    decade: '1970s',
  },
  { videoId: '7hx4gdlfamo', title: 'The Gambler', artist: 'Kenny Rogers', genres: ['Country'], decade: '1970s' },
  {
    videoId: 'LgR6UNeQxXE',
    title: 'Lucy In The Sky With Diamonds',
    artist: 'The Beatles',
    genres: ['Psychedelic Pop', 'Rock'],
    decade: '1960s',
  },
  {
    videoId: 'dthgRdTf0Ds',
    title: 'The World We Knew (Over And Over)',
    artist: 'Frank Sinatra',
    genres: ['Traditional Pop'],
    decade: '1960s',
  },
];

// Note: this "Dream A Little Dream Of Me" (The Mamas & The Papas,
// v8I5vDewcZo) is a different recording from the Ella Fitzgerald & Louis
// Armstrong version already in SEED_BATCH_3 (6IQqlJ4YRRQ) — different
// videoId, so both coexist rather than deduping against each other.
const SEED_BATCH_8 = [
  {
    videoId: 'CFhFyvk0yS8',
    title: "Brandy (You're a Fine Girl)",
    artist: 'Looking Glass',
    genres: ['Soft Rock', 'Pop'],
    decade: '1970s',
  },
  {
    videoId: 'A_J2bcNx3Gw',
    title: 'Summer Nights',
    artist: 'John Travolta & Olivia Newton-John',
    genres: ['Pop', 'Musical'],
    decade: '1970s',
  },
  {
    videoId: 'ujfUtqMQaZk',
    title: 'Bound',
    artist: 'The Ponderosa Twins Plus One',
    genres: ['Soul', 'R&B'],
    decade: '1970s',
  },
  {
    videoId: 'Y_t2gNCXYbY',
    title: "Somethin' Stupid",
    artist: 'Frank Sinatra & Nancy Sinatra',
    genres: ['Jazz Pop'],
    decade: '1960s',
  },
  {
    videoId: 'v8I5vDewcZo',
    title: 'Dream A Little Dream Of Me',
    artist: 'The Mamas & The Papas',
    genres: ['Pop', 'Folk Rock'],
    decade: '1960s',
  },
  {
    videoId: '5jSAeAN37WU',
    title: 'Zanzibar',
    artist: 'Billy Joel',
    genres: ['Rock', 'Jazz Fusion'],
    decade: '1970s',
  },
  {
    videoId: '6VzRpY1e0Lw',
    title: 'Forever',
    artist: 'The Little Dippers',
    genres: ['Easy Listening'],
    decade: '1960s',
  },
  {
    videoId: 'mTUhnIY3oRM',
    title: 'December, 1963 (Oh What a Night!)',
    artist: 'The Four Seasons',
    genres: ['Disco', 'Pop'],
    decade: '1970s',
  },
  {
    videoId: 'JxvcjyymMcs',
    title: 'The Longest Time',
    artist: 'Billy Joel',
    genres: ['Doo-wop'],
    decade: '1980s',
  },
  {
    videoId: '0eHBLHVHjWg',
    title: 'Dancing in the Moonlight',
    artist: 'King Harvest',
    genres: ['Pop', 'Rock'],
    decade: '1970s',
  },
  { videoId: 'VQHDVGhnoHU', title: 'Solitude', artist: 'Billie Holiday', genres: ['Jazz'], decade: '1950s' },
];

// Add new SEED_BATCH_N arrays above and list them here — everything gets
// combined and deduped by videoId below, so appending a new batch and
// re-running the script only ever writes what's actually new.
const SEED_BATCHES = [
  STARTER_TRACKS,
  SEED_BATCH_2,
  SEED_BATCH_3,
  SEED_BATCH_4,
  SEED_BATCH_5,
  SEED_BATCH_6,
  SEED_BATCH_7,
  SEED_BATCH_8,
];
const ALL_TRACKS = SEED_BATCHES.flat();

// Firestore REST documents use typed value wrappers rather than plain JSON.
function toFirestoreFields(entry) {
  return {
    videoId: { stringValue: entry.videoId },
    title: { stringValue: entry.title },
    channelTitle: { stringValue: entry.channelTitle ?? entry.artist },
    artist: { stringValue: entry.artist },
    thumbnailUrl: { stringValue: `https://img.youtube.com/vi/${entry.videoId}/mqdefault.jpg` },
    genres: { arrayValue: { values: entry.genres.map((g) => ({ stringValue: g })) } },
    decade: { stringValue: entry.decade },
    // Every entry seeded by this script is part of the shared admin-curated
    // baseline (see firestore.rules) — stamped here rather than on each
    // SEED_BATCH_N entry so future batches get it automatically.
    facilityId: { stringValue: 'global' },
    addedAt: { timestampValue: new Date().toISOString() },
    addedByUid: { nullValue: null },
  };
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

function createDocument(accessToken, entry) {
  return firestoreRequest(
    accessToken,
    'POST',
    `/v1/projects/${PROJECT_ID}/databases/(default)/documents/musicLibrary`,
    { fields: toFirestoreFields(entry) }
  );
}

// Fetches every existing videoId already in the library, one page at a
// time, so the seed loop can check "have we already added this?" against
// an in-memory Set instead of firing a query per track.
async function loadExistingVideoIds(accessToken) {
  const existing = new Set();
  let pageToken;
  do {
    const params = new URLSearchParams({ pageSize: '100' });
    if (pageToken) params.set('pageToken', pageToken);
    const result = await firestoreRequest(
      accessToken,
      'GET',
      `/v1/projects/${PROJECT_ID}/databases/(default)/documents/musicLibrary?${params.toString()}`
    );
    for (const document of result.documents ?? []) {
      const videoId = document.fields?.videoId?.stringValue;
      if (videoId) existing.add(videoId);
    }
    pageToken = result.nextPageToken;
  } while (pageToken);
  return existing;
}

async function seed() {
  const accessToken = getAccessToken();
  const existingVideoIds = await loadExistingVideoIds(accessToken);

  let added = 0;
  let skipped = 0;
  for (const track of ALL_TRACKS) {
    if (existingVideoIds.has(track.videoId)) {
      console.log(`Skipped "${track.title}" (already in library)`);
      skipped += 1;
      continue;
    }
    await createDocument(accessToken, track);
    // Track newly-added videoIds too, so a duplicate within this same run
    // (e.g. the same track listed in two batches) is also skipped.
    existingVideoIds.add(track.videoId);
    console.log(`Added "${track.title}"`);
    added += 1;
  }

  console.log(`Done: ${added} added, ${skipped} skipped as duplicates.`);
}

seed().catch((e) => {
  console.error('Failed to seed musicLibrary:', e.message);
  process.exit(1);
});
