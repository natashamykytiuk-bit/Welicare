// Tag-based "what should play next" ranking for MusicPlayerScreen's Up next
// queue. Deliberately simple and local — no AI call, no Firestore reads —
// since every song in the queue is already a caregiver-vetted musicLibrary
// entry carrying genres/decade/artist. Songs missing tags just score 0 and
// drift to the end rather than being excluded.

// Weights: shared genre matters most (a resident enjoying big band probably
// wants more big band), then era, then same artist. Artist is capped at the
// same weight as an exact decade so one prolific artist can't take over the
// whole queue on its own.
const GENRE_WEIGHT = 3;
const SAME_DECADE_WEIGHT = 2;
const ADJACENT_DECADE_WEIGHT = 1;
const SAME_ARTIST_WEIGHT = 2;

// '1950s' -> 1950. Returns null for anything unparseable so it simply
// doesn't contribute to the score.
function decadeYear(decade) {
  const year = parseInt(decade, 10);
  return Number.isFinite(year) ? year : null;
}

// How similar `candidate` is to `anchor` — higher is more similar.
export function similarityScore(anchor, candidate) {
  if (!anchor || !candidate) return 0;
  let score = 0;

  const anchorGenres = new Set((anchor.genres ?? []).map((g) => g.toLowerCase()));
  for (const genre of candidate.genres ?? []) {
    if (anchorGenres.has(genre.toLowerCase())) score += GENRE_WEIGHT;
  }

  const a = decadeYear(anchor.decade);
  const c = decadeYear(candidate.decade);
  if (a !== null && c !== null) {
    if (a === c) score += SAME_DECADE_WEIGHT;
    else if (Math.abs(a - c) === 10) score += ADJACENT_DECADE_WEIGHT;
  }

  if (anchor.artist && candidate.artist && anchor.artist.toLowerCase() === candidate.artist.toLowerCase()) {
    score += SAME_ARTIST_WEIGHT;
  }

  return score;
}

// Returns a new array of `songs` ordered most-similar-to-`anchor` first.
// Array.prototype.sort is stable, so equal scores keep their incoming order
// — i.e. the order the resident was browsing in — as the tie-break.
export function rankBySimilarity(anchor, songs) {
  return songs
    .map((song) => ({ song, score: similarityScore(anchor, song) }))
    .sort((x, y) => y.score - x.score)
    .map(({ song }) => song);
}
