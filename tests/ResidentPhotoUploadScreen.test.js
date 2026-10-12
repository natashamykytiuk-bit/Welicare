// "Add Photos": the 30-photo album limit. A full album says so and asks for
// photos to be deleted; an album with room shows how many it holds.
import { render, screen } from '@testing-library/react-native';
import ResidentPhotoUploadScreen from '../screens/ResidentPhotoUploadScreen';
import { firestore } from './mocks/firebase';

jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: (props) => <View testID="photo" {...props} /> };
});
// Runs the focus callback once on mount, like arriving on the screen.
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback) => require('react').useEffect(callback, [callback]),
}));

const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };
const FULL =
  'This album has reached its limit of 30 photos. Delete some photos to continue adding.';

function renderUpload(albumCount) {
  firestore.getDocs.mockResolvedValue({ docs: [] });
  if (albumCount instanceof Error) firestore.getCountFromServer.mockRejectedValue(albumCount);
  else firestore.getCountFromServer.mockResolvedValue({ data: () => ({ count: albumCount }) });
  return render(
    <ResidentPhotoUploadScreen
      navigation={navigation}
      route={{ params: { residentId: 'r1', residentName: 'Ann' } }}
    />
  );
}

describe('ResidentPhotoUploadScreen album limit', () => {
  it('tells the person the album is full and stops them choosing more', async () => {
    await renderUpload(30);
    expect(await screen.findByText(FULL)).toBeTruthy();
    expect(screen.getByLabelText('Choose photos')).toBeDisabled();
  });

  it('shows how many photos the album holds while there is room', async () => {
    await renderUpload(12);
    expect(await screen.findByText(/12 of 30 photos in the album\./)).toBeTruthy();
    expect(screen.queryByText(FULL)).toBeNull();
    expect(screen.getByLabelText('Choose photos')).not.toBeDisabled();
  });

  it("doesn't block sharing when the count can't be loaded", async () => {
    // The screen logs the failure; keep the expected error out of the output.
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await renderUpload(new Error('offline'));
    expect(await screen.findByText(/No photos have been shared/)).toBeTruthy();
    expect(screen.queryByText(FULL)).toBeNull();
    expect(screen.getByLabelText('Choose photos')).not.toBeDisabled();
  });
});
