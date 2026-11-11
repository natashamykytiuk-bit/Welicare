import CurateResidentMedia from '../components/CurateResidentMedia';
import {
  MOVIE_DECADE_OPTIONS,
  MOVIE_GENRE_OPTIONS,
  isMoviesCurated,
  queryMovieLibrary,
  sortMovies,
} from '../utils/movieLibrary';

// Lets a caregiver pick which movieLibrary movies a given resident may see
// on MoviesSelectionScreen — the movie counterpart of
// CurateResidentMusicScreen, with its own approval list
// (selectedMovieVideoIds; see filterToApprovedMovies). The screen itself is
// the shared components/CurateResidentMedia.js; this config holds what is
// movie-specific.
const MOVIES_CONFIG = {
  logTag: 'CurateResidentMovies',
  idsField: 'selectedMovieVideoIds',
  isCurated: isMoviesCurated,
  // The whole movie library is loaded once; genre/decade filtering happens
  // on screen (movie libraries are small).
  serverFilters: false,
  loadLibrary: ({ facilityId }) => queryMovieLibrary(facilityId),
  libraryErrorMessage: () => 'Could not load the movie library. Please try again.',
  artistFilter: null,
  // Any of the chosen genres, and the chosen decade; sorted by decade then
  // title.
  filterAndSort: (subset, { genres, decade }) =>
    sortMovies(
      subset.filter(
        (v) =>
          (genres.length === 0 || (v.genres ?? []).some((g) => genres.includes(g))) &&
          (!decade || v.decade === decade)
      )
    ),
  genreOptions: MOVIE_GENRE_OPTIONS,
  decadeOptions: MOVIE_DECADE_OPTIONS,
  hintLines: (lifeStory) =>
    lifeStory.favouriteMovies ? [`Favourite movies: ${lifeStory.favouriteMovies}`] : [],
  pickerIntro: 'Choose a resident to choose which movies and shows they can watch.',
  listLabel: 'Movies',
  subtitle: (entry) => `${(entry.genres ?? []).join(', ')} · ${entry.decade}`,
  curatedNote: (name) => `${name} only sees the movies approved here.`,
  uncuratedNote: (name) =>
    `No approved list yet — ${name} sees the whole movie library. Saving a selection limits it to those movies.`,
  emptyWarning: (name) =>
    `No movies are approved, so ${name} won’t see any until you approve some.`,
};

export default function CurateResidentMoviesScreen({ navigation }) {
  return <CurateResidentMedia navigation={navigation} config={MOVIES_CONFIG} />;
}
