// YouTube search for the staff library screens (Music Library, Movie
// Library), server-side so the API key never ships in the app.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { requireVerified, requireUsage } = require('./authChecks');
const { readCachedSearch, writeCachedSearch } = require('./searchCache');

const youtubeApiKey = defineSecret('YOUTUBE_API_KEY');

// Usage limits (see rateLimit.js). A search costs 100 units of the YouTube
// Data API's daily quota (10,000 by default, i.e. about 100 searches a day
// for the whole app), so without these one account could use up everyone's
// searches for the day. The shared total stops just short of the quota.
const SEARCHES_PER_HOUR = 20;
const SEARCHES_PER_DAY = 40;
const SEARCHES_GLOBAL_PER_DAY = 95;
// Longest search text accepted — far more than a song or film title needs.
const MAX_QUERY_LENGTH = 100;

// Same lazy Admin SDK set-up as ai.js.
function getDb() {
  const { getApps, initializeApp } = require('firebase-admin/app');
  const app = getApps()[0] ?? initializeApp();
  return require('firebase-admin/firestore').getFirestore(app);
}

// Server-side YouTube search so the API key never ships in the app — same
// reasoning as generateSuggestions and Anthropic. Shared by both Music and
// Movies & Videos; category picks the filtering behavior for each.
exports.searchYouTube = onCall({ secrets: [youtubeApiKey] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  requireVerified(request);

  const query = typeof request.data?.query === 'string' ? request.data.query.trim() : '';
  if (!query) {
    throw new HttpsError('invalid-argument', 'query must be a non-empty string.');
  }
  if (query.length > MAX_QUERY_LENGTH) {
    throw new HttpsError('invalid-argument', 'That search is too long. Please shorten it.');
  }

  const category = request.data?.category === 'video' ? 'video' : 'music';

  // A search someone made recently is answered from the saved copy (see
  // searchCache.js): no YouTube quota is spent, so it isn't counted against
  // the usage limits either. A cache problem must never break search — on
  // any failure here it just carries on to YouTube.
  const db = getDb();
  try {
    const cached = await readCachedSearch(db, category, query);
    if (cached) return { results: cached };
  } catch (e) {
    console.error('[searchYouTube] cache read failed:', e);
  }

  await requireUsage(db, {
    feature: 'youtube',
    uid: request.auth.uid,
    perHour: SEARCHES_PER_HOUR,
    perDay: SEARCHES_PER_DAY,
    globalPerDay: SEARCHES_GLOBAL_PER_DAY,
    label: 'searches',
  });

  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    maxResults: '10',
    q: query,
    key: youtubeApiKey.value(),
  });
  // videoCategoryId=10 scopes Music results so an artist's name doesn't
  // surface interviews, news clips, etc. There's no equivalently reliable
  // category for older films/TV clips — videoCategoryId=1 (Film &
  // Animation) is inconsistently tagged and would exclude a lot of
  // legitimate results — so 'video' search omits the category filter
  // entirely for better coverage.
  if (category === 'music') {
    params.set('videoCategoryId', '10');
  }

  const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);

  // Same as generateSuggestions: details to the server log, a stable
  // reason code to the app.
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[searchYouTube] YouTube error', response.status, errorText.slice(0, 500));
    throw new HttpsError('unavailable', 'Search is unavailable right now. Please try again.', {
      reason: 'search-provider-error',
    });
  }

  const data = await response.json();
  const results = (data.items ?? [])
    .filter((item) => item.id?.videoId)
    .slice(0, 10)
    .map((item) => ({
      videoId: item.id.videoId,
      title: item.snippet?.title ?? '',
      channelTitle: item.snippet?.channelTitle ?? '',
      thumbnailUrl:
        item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? '',
    }));

  // Saved for the next person who searches the same thing. Best-effort: the
  // results are returned either way. Failed searches (above) are never
  // saved, so a provider error isn't replayed for a week.
  try {
    await writeCachedSearch(db, category, query, results);
  } catch (e) {
    console.error('[searchYouTube] cache write failed:', e);
  }

  return { results };
});
