// The movie library on the shared media pieces: adds go to movieLibrary
// under the fixed id with no artist field, edits write only the form's
// fields, removing deletes the entry, and global entries can't be touched.
import { fireEvent, render, screen } from '@testing-library/react-native';
import MovieLibraryScreen from '../features/media/MovieLibraryScreen';
import { findMovieEntryByVideoId, queryMovieLibrary } from '../utils/movieLibrary';
import { searchYouTube } from '../utils/youtube';
import { docSnap, firestore } from './mocks/firebase';

jest.mock('../utils/youtube', () => ({ searchYouTube: jest.fn() }));
jest.mock('../utils/musicLibraryQuery', () => ({
  ...jest.requireActual('../utils/musicLibraryQuery'),
  getCurrentUserFacilityId: jest.fn(async () => 'orgA'),
}));
jest.mock('../utils/movieLibrary', () => ({
  ...jest.requireActual('../utils/movieLibrary'),
  queryMovieLibrary: jest.fn(),
  findMovieEntryByVideoId: jest.fn(),
}));
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return { useFocusEffect: (cb) => useEffect(cb, [cb]) };
});

const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };

const own = {
  id: 'orgA_vid-own',
  videoId: 'vid-own',
  title: 'Singin in the Rain',
  genres: ['Musical'],
  decade: '1950s',
  facilityId: 'orgA',
};
const shared = { ...own, id: 'g1', videoId: 'vid-g', title: 'Casablanca', facilityId: 'global' };

async function renderLibrary() {
  queryMovieLibrary.mockResolvedValue([own, shared]);
  await render(<MovieLibraryScreen navigation={navigation} />);
  await screen.findByText('Library (2)');
}

describe('MovieLibraryScreen', () => {
  it('adds a found movie to movieLibrary without an artist field', async () => {
    await renderLibrary();
    searchYouTube.mockResolvedValue([
      { videoId: 'vid-new', title: 'High Noon', channelTitle: 'Classics' },
    ]);
    await fireEvent.changeText(screen.getByPlaceholderText(/search/i), 'western');
    await fireEvent.press(screen.getByLabelText('Search'));
    expect(searchYouTube).toHaveBeenCalledWith('western', 'video');
    await fireEvent.press(await screen.findByLabelText('Add High Noon to library'));
    expect(screen.queryByLabelText('Artist')).toBeNull();
    await fireEvent.press(screen.getAllByLabelText('Western').at(-1));
    await fireEvent.press(screen.getAllByLabelText('1950s').at(-1));
    findMovieEntryByVideoId.mockResolvedValueOnce(null);
    firestore.getDoc.mockResolvedValueOnce(docSnap(undefined));
    firestore.setDoc.mockResolvedValueOnce(undefined);

    await fireEvent.press(screen.getByLabelText('Save'));

    expect(firestore.setDoc).toHaveBeenCalledTimes(1);
    expect(firestore.setDoc.mock.calls[0][0].path).toBe('movieLibrary/orgA_vid-new');
    const written = firestore.setDoc.mock.calls[0][1];
    expect(written).toMatchObject({ title: 'High Noon', genres: ['Western'], decade: '1950s' });
    expect(written).not.toHaveProperty('artist');
  });

  it('asks for a genre and decade before saving', async () => {
    await renderLibrary();
    await fireEvent.press(screen.getByLabelText('Edit Singin in the Rain'));
    await fireEvent.press(screen.getAllByLabelText('Musical').at(-1)); // deselect the only genre
    await fireEvent.press(screen.getByLabelText('Save'));
    expect(
      await screen.findByText('Please fill in a title, at least one genre, and a decade.')
    ).toBeTruthy();
    expect(firestore.updateDoc).not.toHaveBeenCalled();
  });

  it('edits only the form fields of an own entry', async () => {
    await renderLibrary();
    await fireEvent.press(screen.getByLabelText('Edit Singin in the Rain'));
    await fireEvent.changeText(screen.getByLabelText('Title'), "Singin' in the Rain ");
    firestore.updateDoc.mockResolvedValueOnce(undefined);
    await fireEvent.press(screen.getByLabelText('Save'));
    expect(firestore.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'movieLibrary/orgA_vid-own' }),
      { title: "Singin' in the Rain", channelTitle: '', genres: ['Musical'], decade: '1950s' }
    );
  });

  it('removes an own entry after confirmation and disables global ones', async () => {
    await renderLibrary();
    expect(screen.getByLabelText('Remove Casablanca')).toBeDisabled();
    await fireEvent.press(screen.getByLabelText('Remove Singin in the Rain'));
    firestore.deleteDoc.mockResolvedValueOnce(undefined);
    await fireEvent.press(screen.getByLabelText('Remove'));
    expect(firestore.deleteDoc).toHaveBeenCalledWith(expect.objectContaining({ path: 'movieLibrary/orgA_vid-own' }));
    expect(await screen.findByText('Library (1)')).toBeTruthy();
  });
});
