// Regression test: if the PIN can't be loaded, PINEntryScreen must show
// "Try again" — not the number pad. Before the fix, a failed read left the
// stored PIN empty, so typing any PIN showed "No PIN has been set up for
// this account yet", which was wrong and alarming.

import { fireEvent, render, screen } from '@testing-library/react-native';
import PINEntryScreen from '../screens/PINEntryScreen';
import { docSnap, firestore } from './mocks/firebase';

const props = {
  navigation: { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() },
  route: { params: { destination: 'CaregiverMode' } },
};

describe('PINEntryScreen', () => {
  it('shows Try again instead of the number pad when the PIN fails to load', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    firestore.getDoc
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(docSnap({ pinHash: 'abc', fullName: 'Ann Smith' }));

    await render(<PINEntryScreen {...props} />);

    const retry = await screen.findByLabelText('Try again');
    expect(screen.queryByText('Enter your PIN')).toBeNull();
    expect(screen.queryByText(/No PIN has been set up/)).toBeNull();

    // Tapping Try again loads successfully and shows the PIN entry.
    await fireEvent.press(retry);
    expect(await screen.findByText('Enter your PIN')).toBeTruthy();
    spy.mockRestore();
  });
});
