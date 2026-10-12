// Remembers YouTube search results so the same search doesn't spend API
// quota twice. A search costs 100 of the 10,000 units the YouTube Data API
// allows per day — about 100 searches a day for the whole app — and staff
// in different facilities often look for the same well-known artists and
// films, so repeats are common.
//
// Stored in youtubeSearchCache/{key}. No rule in firestore.rules matches
// that collection, so the app can't read or write it (unmatched paths are
// denied); only searchYouTube does, through the Admin SDK.
//
// Like rateLimit.js, this file doesn't load firebase-functions, so it can be
// unit-tested without the emulator (tests/searchCache.test.js).
const { createHash } = require('crypto');

// How long a saved search is reused. Short enough that removed or newly
// uploaded videos show up within a week, and well inside the time YouTube's
// API terms allow its data to be kept before it must be refreshed.
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// The form of a search that decides whether two searches are "the same":
// case and extra spaces don't matter (" Frank  sinatra" = "frank sinatra").
function normalizeSearchQuery(query) {
  return String(query ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

// The cache doc id for a search. Hashed rather than used directly: search
// text can contain "/" and other characters a doc id can't, and can be long.
// The category is part of it because Music and Movies filter differently,
// so the same words give different results.
function searchCacheKey(category, query) {
  return createHash('sha256')
    .update(`${category}|${normalizeSearchQuery(query)}`)
    .digest('hex')
    .slice(0, 40);
}

// The saved results for this search, or null if there are none or they're
// older than CACHE_TTL_MS. `now` is passed in so tests can control the clock.
async function readCachedSearch(db, category, query, now = Date.now()) {
  const snap = await db.doc(`youtubeSearchCache/${searchCacheKey(category, query)}`).get();
  const data = snap.data();
  if (!data || !Array.isArray(data.results) || typeof data.cachedAt !== 'number') return null;
  if (now - data.cachedAt >= CACHE_TTL_MS) return null;
  return data.results;
}

// Saves the results of a search that just went to YouTube, replacing any
// older copy. expiresAt is there for a Firestore TTL policy on this
// collection, which deletes entries nobody searches for again (reads above
// already ignore them once they're stale, whether or not it's switched on).
async function writeCachedSearch(db, category, query, results, now = Date.now()) {
  await db.doc(`youtubeSearchCache/${searchCacheKey(category, query)}`).set({
    category,
    query: normalizeSearchQuery(query),
    results,
    cachedAt: now,
    expiresAt: new Date(now + CACHE_TTL_MS),
  });
}

module.exports = {
  CACHE_TTL_MS,
  normalizeSearchQuery,
  searchCacheKey,
  readCachedSearch,
  writeCachedSearch,
};
