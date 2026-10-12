// Tests for the YouTube search cache (functions/searchCache.js).
//
// What each test pins down:
// - The same search typed with different case or spacing reuses one entry,
//   while Music and Movies searches for the same words stay separate.
// - Saved results are reused until they're a week old, then ignored.
// - A damaged entry counts as "nothing saved" rather than breaking search.
//
// fakeDb() stands in for Firestore: doc(path).get()/set() over a Map.

import {
  CACHE_TTL_MS,
  normalizeSearchQuery,
  readCachedSearch,
  searchCacheKey,
  writeCachedSearch,
} from '../functions/searchCache';

function fakeDb() {
  const store = new Map();
  return {
    store,
    doc: (path) => ({
      get: async () => ({ data: () => store.get(path) }),
      set: async (data) => store.set(path, data),
    }),
  };
}

const RESULTS = [
  { videoId: 'abc12345678', title: 'My Way', channelTitle: 'Frank', thumbnailUrl: '' },
];
const NOW = 1_800_000_000_000;

describe('search cache keys', () => {
  it('treats case and extra spaces as the same search', () => {
    expect(normalizeSearchQuery('  Frank   SINATRA ')).toBe('frank sinatra');
    expect(searchCacheKey('music', '  Frank   SINATRA ')).toBe(
      searchCacheKey('music', 'frank sinatra')
    );
  });

  it('keeps Music and Movies searches apart', () => {
    expect(searchCacheKey('music', 'casablanca')).not.toBe(searchCacheKey('video', 'casablanca'));
  });

  it('makes a valid doc id from any search text', () => {
    expect(searchCacheKey('music', 'AC/DC ../ live')).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe('reading and writing', () => {
  it('returns saved results for the same search, however it was typed', async () => {
    const db = fakeDb();
    await writeCachedSearch(db, 'music', 'Frank Sinatra', RESULTS, NOW);
    expect(await readCachedSearch(db, 'music', ' frank  sinatra', NOW + 1000)).toEqual(RESULTS);
  });

  it('has nothing for a search nobody has made', async () => {
    expect(await readCachedSearch(fakeDb(), 'music', 'frank sinatra', NOW)).toBeNull();
  });

  it('ignores results once they are a week old', async () => {
    const db = fakeDb();
    await writeCachedSearch(db, 'music', 'frank sinatra', RESULTS, NOW);
    expect(await readCachedSearch(db, 'music', 'frank sinatra', NOW + CACHE_TTL_MS - 1)).toEqual(
      RESULTS
    );
    expect(await readCachedSearch(db, 'music', 'frank sinatra', NOW + CACHE_TTL_MS)).toBeNull();
  });

  it('stamps an expiry a week out, for the Firestore TTL policy', async () => {
    const db = fakeDb();
    await writeCachedSearch(db, 'music', 'frank sinatra', RESULTS, NOW);
    const [saved] = [...db.store.values()];
    expect(saved.expiresAt).toEqual(new Date(NOW + CACHE_TTL_MS));
  });

  it('treats a damaged entry as nothing saved', async () => {
    const db = fakeDb();
    db.store.set(`youtubeSearchCache/${searchCacheKey('music', 'x')}`, { results: 'oops' });
    expect(await readCachedSearch(db, 'music', 'x', NOW)).toBeNull();
  });
});
