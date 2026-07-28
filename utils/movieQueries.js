// Builds YouTube search queries from a resident's lifeStory. Mirrors
// utils/musicQueries.js: a named signal (favourite movies) beats a safe
// general fallback, so Movies & Videos always has something reasonable to
// search for even with an empty or partial profile. There's no movies
// equivalent of musicGenres in the lifeStory schema, so this only has the
// two tiers musicQueries' first and last ones map to.
const FALLBACK_QUERIES = ['classic hollywood movies', 'old TV shows compilation'];

function isEmpty(value) {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

export function buildMovieQueries(lifeStory) {
  if (!lifeStory) return FALLBACK_QUERIES;

  if (!isEmpty(lifeStory.favouriteMovies)) {
    const titles = lifeStory.favouriteMovies
      .split(',')
      .map((title) => title.trim())
      .filter(Boolean);
    if (titles.length > 0) return titles.map((title) => `${title} movie`);
  }

  return FALLBACK_QUERIES;
}
