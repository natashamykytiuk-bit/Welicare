// Builds YouTube search queries from a resident's lifeStory. Mirrors the
// "most specific signal wins" pattern buildFactLines uses in
// functions/index.js: named musicians beat genres beat a safe general
// fallback, so Music always has something reasonable to search for even
// with an empty or partial profile.
const FALLBACK_QUERIES = ['classic oldies music', 'big band music'];

function isEmpty(value) {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

export function buildMusicQueries(lifeStory) {
  if (!lifeStory) return FALLBACK_QUERIES;

  if (!isEmpty(lifeStory.favouriteMusicians)) {
    const names = lifeStory.favouriteMusicians
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    if (names.length > 0) return names.map((name) => `${name} music`);
  }

  if (!isEmpty(lifeStory.musicGenres)) {
    // Same "Other" substitution buildFactLines does for musicGenres — a
    // literal "Other music oldies" query would return junk results.
    const genres = lifeStory.musicGenres.includes('Other') && lifeStory.musicGenresOtherDetail
      ? [...lifeStory.musicGenres.filter((g) => g !== 'Other'), lifeStory.musicGenresOtherDetail]
      : lifeStory.musicGenres;
    return genres.map((genre) => `${genre} music oldies`);
  }

  return FALLBACK_QUERIES;
}
