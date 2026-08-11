// One-off research helper: looks up several YouTube candidates per song so
// a caregiver can pick the right official upload before adding it to
// musicLibrary via MusicLibraryScreen (search or paste-URL) or a future
// SEED_BATCH_N in scripts/seedMusicLibrary.js.
//
// Doesn't call the deployed searchYouTube Cloud Function directly — that
// function is a Firebase callable, gated on `request.auth` being a real
// Firebase Auth ID token (see functions/index.js). Every other script in
// this repo authenticates via a `gcloud` OAuth2 access token, which is a
// GCP IAM credential, not a Firebase Auth one — it bypasses Firestore
// *security rules* (which is why the seed/migration scripts work), but
// searchYouTube's auth check is in the function's own code, not a rule, so
// IAM access doesn't satisfy it. Getting a genuine ID token would mean
// signing in with a real account's password from a script.
//
// Instead, this pulls the same YOUTUBE_API_KEY secret the deployed
// function uses (via `firebase functions:secrets:access`, using the
// already-authenticated Firebase CLI session) and mirrors its query shape
// exactly (part=snippet, type=video, videoCategoryId=10 for the music
// category) — same key, same quota, just called locally instead of
// through the function's HTTP endpoint.
//
// Usage:
//   node scripts/bulkLookupMusicCandidates.js
//
// Requires the Firebase CLI, logged in with access to the "welicare"
// project's secrets (the same session `firebase deploy` already uses).
const { execSync } = require('child_process');
const fs = require('fs');
const https = require('https');
const path = require('path');

const RESULTS_PER_SONG = 5;
const DELAY_MS = 300;

const SONGS = [
  { title: "Boot Scootin' Boogie", artist: 'Brooks & Dunn' },
  { title: 'Fishin\' in the Dark', artist: 'Nitty Gritty Dirt Band' },
  { title: 'Forever and Ever, Amen', artist: 'Randy Travis' },
  { title: 'Head Over Boots', artist: 'Jon Pardi' },
  { title: 'Red Dirt Road', artist: 'Brooks & Dunn' },
  { title: 'Neon Moon', artist: 'Brooks & Dunn' },
  { title: "All My Ex's Live In Texas", artist: 'George Strait' },
  { title: "Mammas Don't Let Your Babies Grow up to Be Cowboys", artist: 'Waylon Jennings, Willie Nelson' },
  { title: 'Wagon Wheel', artist: 'Darius Rucker' },
  { title: 'Copperhead Road', artist: 'Steve Earle' },
  { title: 'Friends in Low Places', artist: 'Garth Brooks' },
  { title: 'Red River Valley', artist: 'Marty Robbins' },
  { title: 'Lovesick Blues', artist: 'Hank Williams' },
  { title: 'Drift Away', artist: 'Dobie Gray' },
  { title: "Thank God I'm a Country Boy", artist: 'John Denver' },
  { title: 'Ring of Fire', artist: 'Johnny Cash' },
  { title: 'Have I Told You Lately That I Love You', artist: 'Randy Travis' },
  { title: '9 to 5', artist: 'Dolly Parton' },
  { title: 'Take Me Home, Country Roads', artist: 'John Denver' },
  { title: "Drinkin' Problem", artist: 'Midland' },
];

function getYouTubeApiKey() {
  return execSync('firebase functions:secrets:access YOUTUBE_API_KEY', { encoding: 'utf8' }).trim();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mirrors functions/index.js's searchYouTube: category 'music' scopes
// results to videoCategoryId=10 so an artist's name doesn't surface
// interviews, news clips, etc.
function searchYouTube(apiKey, query) {
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    maxResults: String(RESULTS_PER_SONG),
    videoCategoryId: '10',
    q: query,
    key: apiKey,
  });

  return new Promise((resolve, reject) => {
    https
      .get(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`YouTube API error (${res.statusCode}): ${data}`));
            return;
          }
          const parsed = JSON.parse(data);
          const results = (parsed.items ?? [])
            .filter((item) => item.id?.videoId)
            .map((item) => ({
              videoId: item.id.videoId,
              title: item.snippet?.title ?? '',
              channelTitle: item.snippet?.channelTitle ?? '',
            }));
          resolve(results);
        });
      })
      .on('error', reject);
  });
}

async function run() {
  const apiKey = getYouTubeApiKey();
  const results = [];

  for (let i = 0; i < SONGS.length; i += 1) {
    const { title, artist } = SONGS[i];
    const query = `${artist} ${title} official`;
    const candidates = await searchYouTube(apiKey, query);
    results.push({ title, artist, candidates });
    console.log(`Searched ${i + 1}/${SONGS.length}: ${title}`);
    if (i < SONGS.length - 1) await delay(DELAY_MS);
  }

  const outDir = path.join(__dirname, 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'music-candidates.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Wrote ${results.length} entries to ${outPath}`);
}

run().catch((e) => {
  console.error('Failed to look up music candidates:', e.message);
  process.exit(1);
});
