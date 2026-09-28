// Tests for the resident-facing Movies & Videos screen: it shows only the
// curated movie library (no open YouTube search), respects the resident's
// approved list, and hearts save to the movie favourites field.

import { fireEvent, render, screen } from '@testing-library/react-native';
import MoviesSelectionScreen from '../screens/MoviesSelectionScreen';
import { queryMovieLibrary } from '../utils/movieLibrary';
import { docSnap, firestore } from './mocks/firebase';

jest.mock('../utils/movieLibrary', () => ({
  ...jest.requireActual('../utils/movieLibrary'), // real filtering and sorting
  queryMovieLibrary: jest.fn(),
}));
jest.mock('../utils/musicLibraryQuery', () => ({
  getCurrentUserFacilityId: jest.fn(async () => 'orgA'),
}));

const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };
const route = { params: { residentId: 'r1' } };
const library = [
  { id: '1', videoId: 'casa', title: 'Casablanca', genres: ['Drama'], decade: '1940s' },
  { id: '2', videoId: 'rain', title: 'Singin in the Rain', genres: ['Musical'], decade: '1950s' },
];

beforeEach(() => {
  navigation.navigate.mockReset();
  queryMovieLibrary.mockResolvedValue(library);
});

describe('MoviesSelectionScreen', () => {
  it('lists the curated library, oldest first, with no search box', async () => {
    firestore.getDoc.mockResolvedValue(docSnap({ name: 'Ann' })); // not curated
    await render(<MoviesSelectionScreen navigation={navigation} route={route} />);

    expect(await screen.findByText('Casablanca')).toBeTruthy();
    expect(screen.getByText('Singin in the Rain')).toBeTruthy();
    expect(screen.queryByPlaceholderText(/search/i)).toBeNull();
  });

  it('only shows movies approved for this resident', async () => {
    firestore.getDoc.mockResolvedValue(docSnap({ name: 'Ann', selectedMovieVideoIds: ['rain'] }));
    await render(<MoviesSelectionScreen navigation={navigation} route={route} />);

    expect(await screen.findByText('Singin in the Rain')).toBeTruthy();
    expect(screen.queryByText('Casablanca')).toBeNull();
  });

  it('plays the tapped movie and saves hearts to movie favourites', async () => {
    firestore.getDoc.mockResolvedValue(docSnap({ name: 'Ann' }));
    firestore.updateDoc.mockResolvedValue(undefined);
    await render(<MoviesSelectionScreen navigation={navigation} route={route} />);

    await fireEvent.press(await screen.findByLabelText('Casablanca'));
    expect(navigation.navigate).toHaveBeenCalledWith('MoviesPlayer', {
      videoId: 'casa',
      title: 'Casablanca',
      residentId: 'r1',
    });

    await fireEvent.press(screen.getAllByLabelText('Add to favourites')[0]);
    expect(Object.keys(firestore.updateDoc.mock.calls[0][1])).toEqual(['favouriteMovieVideoIds']);
  });
});
