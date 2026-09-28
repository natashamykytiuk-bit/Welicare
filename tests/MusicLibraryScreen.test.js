// Tests for the music library's duplicate-song check.
//
// Two layers are being checked:
// 1. Before tapping Add: a search result that's already in the library
//    shows an "In library" badge instead of the Add button.
// 2. When saving: the screen asks the server whether someone else added the
//    same song since the list loaded, and refuses to save a duplicate.
//
// New technique here: mocking the app's own helper modules (utils/youtube,
// utils/musicLibraryQuery) with jest.mock, so the test controls what
// "search" and "the library" return without building fake Firestore query
// results. Each helper becomes a jest.fn we set per test.

import { fireEvent, render, screen } from '@testing-library/react-native';
import MusicLibraryScreen from '../screens/MusicLibraryScreen';
import { findLibraryEntryByVideoId, queryMusicLibrarySubset } from '../utils/musicLibraryQuery';
import { searchYouTube } from '../utils/youtube';
import { firestore } from './mocks/firebase';

jest.mock('../utils/youtube', () => ({ searchYouTube: jest.fn() }));
jest.mock('../utils/musicLibraryQuery', () => ({
  ...jest.requireActual('../utils/musicLibraryQuery'), // keep genresOf etc.
  getCurrentUserFacilityId: jest.fn(async () => 'orgA'),
  queryMusicLibrarySubset: jest.fn(),
  findLibraryEntryByVideoId: jest.fn(),
}));
// useFocusEffect needs a navigator; for this screen it's enough to run the
// callback once on mount, like a first focus.
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return { useFocusEffect: (cb) => useEffect(cb, [cb]) };
});

const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };

const crazy = {
  id: 'entry-1',
  videoId: 'vid-crazy',
  title: 'Crazy',
  artist: 'Patsy Cline',
  genres: ['Country'],
  decade: '1960s',
  facilityId: 'orgA',
};

async function renderAndSearch() {
  queryMusicLibrarySubset.mockResolvedValue([crazy]);
  searchYouTube.mockResolvedValue([
    { videoId: 'vid-crazy', title: 'Crazy', channelTitle: 'Patsy Cline' },
    { videoId: 'vid-walkin', title: "Walkin' After Midnight", channelTitle: 'Patsy Cline' },
  ]);
  await render(<MusicLibraryScreen navigation={navigation} />);
  await screen.findByText('Library (1)');
  await fireEvent.changeText(screen.getByPlaceholderText(/search/i), 'patsy cline');
  await fireEvent.press(screen.getByLabelText('Search'));
  await screen.findByText("Walkin' After Midnight");
}

describe('MusicLibraryScreen duplicate check', () => {
  it('shows "In library" instead of Add for a song already in the library', async () => {
    await renderAndSearch();

    expect(screen.getByLabelText('Already in library')).toBeTruthy();
    expect(screen.queryByLabelText('Add Crazy to library')).toBeNull();
    expect(screen.getByLabelText("Add Walkin' After Midnight to library")).toBeTruthy();
  });

  it('refuses to save when someone else added the song since the list loaded', async () => {
    await renderAndSearch();
    await fireEvent.press(screen.getByLabelText("Add Walkin' After Midnight to library"));

    // The form needs a genre and decade. The same chip labels also appear in
    // the page's filters, so pick the one inside the form (the last match).
    await fireEvent.press(screen.getAllByLabelText('Country').at(-1));
    await fireEvent.press(screen.getAllByLabelText('1950s').at(-1));

    // The server says another caregiver already added it.
    findLibraryEntryByVideoId.mockResolvedValueOnce({
      id: 'someone-elses-entry',
      videoId: 'vid-walkin',
      title: "Walkin' After Midnight",
    });
    await fireEvent.press(screen.getByLabelText('Save'));

    expect(await screen.findByText(/already in your library/)).toBeTruthy();
    expect(firestore.setDoc).not.toHaveBeenCalled();
  });

  it('saves normally when the server finds no duplicate', async () => {
    await renderAndSearch();
    await fireEvent.press(screen.getByLabelText("Add Walkin' After Midnight to library"));
    await fireEvent.press(screen.getAllByLabelText('Country').at(-1));
    await fireEvent.press(screen.getAllByLabelText('1950s').at(-1));
    findLibraryEntryByVideoId.mockResolvedValueOnce(null);
    firestore.setDoc.mockResolvedValueOnce(undefined);

    await fireEvent.press(screen.getByLabelText('Save'));

    expect(firestore.setDoc).toHaveBeenCalledTimes(1);
    expect(firestore.setDoc.mock.calls[0][1]).toMatchObject({
      videoId: 'vid-walkin',
      facilityId: 'orgA',
    });
  });
});
