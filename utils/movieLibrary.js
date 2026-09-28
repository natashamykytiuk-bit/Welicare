import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// Shared helpers for the curated movieLibrary collection — the movie
// equivalent of utils/musicLibrary.js + musicLibraryQuery.js, kept as its own
// independent system: its own collection, rules (firestore.rules
// movieLibrary), per-resident approval list (selectedMovieVideoIds) and
// favourites (favouriteMovieVideoIds). Used by MovieLibraryScreen (staff add
// / edit), CurateResidentMoviesScreen (per-resident approval) and
// MoviesSelectionScreen (what residents browse — never open search).
//
// Movies are sorted and filtered by genre and decade only — no actors or
// other credits.

export const MOVIE_GENRE_OPTIONS = [
  'Comedy',
  'Drama',
  'Musical',
  'Western',
  'Romance',
  'Adventure',
  'Mystery',
  'Family',
  'Animation',
  'Documentary',
  'TV Classics',
  'Other',
];

export const MOVIE_DECADE_OPTIONS = [
  '1930s',
  '1940s',
  '1950s',
  '1960s',
  '1970s',
  '1980s',
  '1990s',
  '2000s+',
];

// The one rule for which library movies a resident may browse and play,
// used by both views (All Movies, Favourites) so they can't disagree —
// same rule as music (see filterToApprovedMusic):
// - No approved list saved (selectedMovieVideoIds missing): not curated, so
//   the resident sees the facility's movie library.
// - A list saved, even an empty one: ONLY those movies. Empty means
//   "nothing approved yet", and an un-approved favourite disappears too.
export function isMoviesCurated(resident) {
  return Array.isArray(resident?.selectedMovieVideoIds);
}
export function filterToApprovedMovies(entries, resident) {
  if (!isMoviesCurated(resident)) return entries;
  const approved = new Set(resident.selectedMovieVideoIds);
  return entries.filter((entry) => approved.has(entry.videoId));
}

// Sorted by decade (oldest first), then title — the order residents and
// staff browse in.
export function sortMovies(entries) {
  const decadeIndex = (d) => {
    const i = MOVIE_DECADE_OPTIONS.indexOf(d);
    return i === -1 ? MOVIE_DECADE_OPTIONS.length : i;
  };
  return entries
    .slice()
    .sort(
      (a, b) =>
        decadeIndex(a.decade) - decadeIndex(b.decade) ||
        (a.title ?? '').localeCompare(b.title ?? '')
    );
}

// The library entries this caregiver/resident can see: the shared "global"
// list (empty until one is curated) plus their own organization's. Two
// queries, one per facilityId value, because each has to match one of the
// rules' separate `allow list` branches on its own (same as music).
// Genre/decade filtering happens on the client — movie libraries are small
// and this avoids a composite index per filter combination.
async function queryByFacility(facilityId, ...constraints) {
  const facilityValues = facilityId ? ['global', facilityId] : ['global'];
  const snapshots = await Promise.all(
    facilityValues.map((value) =>
      getDocs(
        query(collection(db, 'movieLibrary'), where('facilityId', '==', value), ...constraints)
      )
    )
  );
  return snapshots.flatMap((snapshot) => snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
}

export function queryMovieLibrary(facilityId) {
  return queryByFacility(facilityId);
}

// The first library entry for this YouTube video, or null — used right
// before saving a new entry so the same movie isn't added twice.
export async function findMovieEntryByVideoId(videoId, facilityId) {
  const matches = await queryByFacility(facilityId, where('videoId', '==', videoId));
  return matches[0] ?? null;
}

// Keeps entries matching the chosen genre (any of its genres) and decade;
// empty filters match everything.
export function filterMovies(entries, { genre, decade }) {
  return entries.filter(
    (entry) =>
      (!genre || (entry.genres ?? []).includes(genre)) && (!decade || entry.decade === decade)
  );
}
