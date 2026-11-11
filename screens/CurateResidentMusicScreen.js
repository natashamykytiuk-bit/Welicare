import CurateResidentMedia from '../components/CurateResidentMedia';
import { MUSIC_DECADE_OPTIONS, isMusicCurated, MUSIC_GENRE_OPTIONS } from '../utils/musicLibrary';
import { distinctArtists, queryMusicLibrarySubset } from '../utils/musicLibraryQuery';

// Lets a caregiver pick which musicLibrary videos a given resident sees on
// MusicSelectionScreen, saved to the resident's selectedMusicVideoIds (see
// filterToApprovedMusic). The screen itself is the shared
// components/CurateResidentMedia.js; this config holds what is music-specific.
const MUSIC_CONFIG = {
  logTag: 'CurateResidentMusic',
  idsField: 'selectedMusicVideoIds',
  isCurated: isMusicCurated,
  // Decade + genres are applied server-side (the music library is large);
  // artist is applied on screen on top (see queryMusicLibrarySubset's
  // comment for why).
  serverFilters: true,
  loadLibrary: ({ facilityId, decade, genres }) =>
    queryMusicLibrarySubset({ decade, genres, facilityId }),
  libraryErrorMessage: (e) =>
    // A missing composite index surfaces as failed-precondition; staff get
    // a plain message, the index link is in the console log for us.
    e.code === 'failed-precondition'
      ? 'These filters aren’t available right now. Try different filters, or try again later.'
      : 'Could not load the music library. Please try again.',
  artistFilter: distinctArtists,
  filterAndSort: (subset, { artist }) =>
    (artist ? subset.filter((v) => (v.artist || v.channelTitle) === artist) : subset)
      .slice()
      .sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '')),
  genreOptions: MUSIC_GENRE_OPTIONS,
  decadeOptions: MUSIC_DECADE_OPTIONS,
  hintLines: (lifeStory) =>
    [
      lifeStory.favouriteMusicians && `Favourite musicians: ${lifeStory.favouriteMusicians}`,
      (lifeStory.musicGenres ?? []).length > 0 && `Enjoys: ${lifeStory.musicGenres.join(', ')}`,
    ].filter(Boolean),
  pickerIntro: 'Choose a resident to curate their music & video selection.',
  listLabel: 'Videos',
  subtitle: (entry) =>
    `${entry.artist || entry.channelTitle} · ${(entry.genres ?? []).join(', ')} · ${entry.decade}`,
  curatedNote: (name) => `${name} only sees the songs approved here.`,
  uncuratedNote: (name) =>
    `No approved list yet — ${name} sees the whole library. Saving a selection limits it to those songs.`,
  emptyWarning: (name) =>
    `No songs are approved, so ${name} won’t see any music until you approve some.`,
};

export default function CurateResidentMusicScreen({ navigation }) {
  return <CurateResidentMedia navigation={navigation} config={MUSIC_CONFIG} />;
}
