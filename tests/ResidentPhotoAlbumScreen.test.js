// Resident Mode's Photo Album: newest-first slideshow with big prev/next
// buttons, calm empty / guest / failure states, and no editing controls.
import { fireEvent, render, screen } from '@testing-library/react-native';
import ResidentPhotoAlbumScreen from '../screens/ResidentPhotoAlbumScreen';
import { firestore, storageModule } from './mocks/firebase';

jest.mock('expo-image', () => {
  const { View } = require('react-native');
  const Image = (props) => <View testID="photo" {...props} />;
  Image.prefetch = jest.fn(async () => true);
  return { Image };
});
// The PIN-gated home button and session logging aren't under test here.
jest.mock('../components/HomeButton', () => () => null);
jest.mock('../hooks/useActivitySession', () => () => ({}));

const navigation = { navigate: jest.fn(), goBack: jest.fn(), addListener: () => () => {} };

const photoSnap = (id, caption, name) => ({
  id,
  data: () => ({
    storagePath: `residents/r1/photos/${id}.jpg`,
    caption,
    uploaderName: name,
    uploadedBy: 'u',
    uploadedAt: { toDate: () => new Date() },
    width: 1600,
    height: 1200,
  }),
});

function renderAlbum(residentId = 'r1') {
  return render(
    <ResidentPhotoAlbumScreen navigation={navigation} route={{ params: { residentId } }} />
  );
}

describe('ResidentPhotoAlbumScreen', () => {
  it('shows the newest photo with its caption and uploader, and pages through', async () => {
    firestore.getDocs.mockResolvedValue({
      docs: [photoSnap('a', 'Lunch at the lake', 'Fran'), photoSnap('b', 'Birthday cake', 'Cara')],
    });
    await renderAlbum();
    expect(await screen.findByText('Lunch at the lake')).toBeTruthy();
    expect(screen.getByText('Shared by Fran')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Next photo'));
    expect(await screen.findByText('Birthday cake')).toBeTruthy();
    // Wraps around, so there's never a dead end.
    await fireEvent.press(screen.getByLabelText('Next photo'));
    expect(await screen.findByText('Lunch at the lake')).toBeTruthy();
  });

  it('only fetches URLs for the current photo and its neighbours', async () => {
    firestore.getDocs.mockResolvedValue({
      docs: ['a', 'b', 'c', 'd', 'e'].map((id) => photoSnap(id, id, 'Fran')),
    });
    await renderAlbum();
    await screen.findByText('a');
    // a (current), b (next), e (previous, wrapping).
    expect(storageModule.getDownloadURL).toHaveBeenCalledTimes(3);
  });

  it('shows a warm empty state with no instructions to leave', async () => {
    firestore.getDocs.mockResolvedValue({ docs: [] });
    await renderAlbum();
    expect(await screen.findByText('No photos yet')).toBeTruthy();
  });

  it('stays calm when loading fails — no technical error text', async () => {
    firestore.getDocs.mockRejectedValue(Object.assign(new Error('permission-denied'), {}));
    await renderAlbum();
    expect(await screen.findByText("The photos aren't ready just now.")).toBeTruthy();
    expect(screen.queryByText(/permission/i)).toBeNull();
  });

  it('asks for a resident in Guest Mode', async () => {
    await renderAlbum(null);
    expect(screen.getByText('The photo album needs a resident to be selected.')).toBeTruthy();
    expect(firestore.getDocs).not.toHaveBeenCalled();
  });

  it('has no upload, delete or edit controls', async () => {
    firestore.getDocs.mockResolvedValue({ docs: [photoSnap('a', 'Hi', 'Fran')] });
    await renderAlbum();
    await screen.findByText('Hi');
    expect(screen.queryByLabelText(/delete|upload|edit|add photos/i)).toBeNull();
  });

  it('opens the photo full screen with its caption, and closes again', async () => {
    firestore.getDocs.mockResolvedValue({ docs: [photoSnap('a', 'Picnic day', 'Fran')] });
    await renderAlbum();
    await screen.findByText('Picnic day');
    await fireEvent.press(await screen.findByLabelText('View full screen'));
    expect(await screen.findByLabelText('Close full screen')).toBeTruthy();
    // The caption now also shows in the viewer's bottom band.
    expect(screen.getAllByText('Picnic day').length).toBe(2);
    await fireEvent.press(screen.getByLabelText('Close full screen'));
    expect(screen.queryByLabelText('Close full screen')).toBeNull();
  });

  it('full screen loops: swiping past the last photo lands on the first', async () => {
    firestore.getDocs.mockResolvedValue({
      docs: [photoSnap('a', 'First', 'Fran'), photoSnap('b', 'Second', 'Fran')],
    });
    await renderAlbum();
    await screen.findByText('First');
    // Move to the last photo, then open full screen.
    await fireEvent.press(screen.getByLabelText('Next photo'));
    await screen.findByText('Second');
    await fireEvent.press(screen.getByLabelText('View full screen'));
    // Pages are [copy of b, a, b, copy of a]; settle on the last one.
    const { width } = require('react-native').Dimensions.get('window');
    await fireEvent(screen.getByTestId('photo-viewer-list'), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: width * 3 } },
    });
    await fireEvent.press(screen.getByLabelText('Close full screen'));
    // Back on the album, the first photo is now the current one.
    expect(await screen.findByText('First')).toBeTruthy();
    expect(screen.queryByText('Second')).toBeNull();
  });
});
