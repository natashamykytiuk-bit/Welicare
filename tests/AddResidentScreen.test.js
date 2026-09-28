// Tests for Phase A: creating a resident must never produce duplicates,
// even when a save is slow and gets retried.
//
// Simulating "slow": setDoc returns a promise that never resolves
// (new Promise(() => {})) — that's what a hung network looks like to the
// app. The screen gives up waiting after 10 seconds, which is too long for
// a test, so this file swaps utils/withTimeout for a copy that uses a
// 20 ms limit instead. Everything else about how the screen reacts to a
// timeout is the real code.
//
// (Jest also has "fake timers" for this, but they interfere with React's
// own scheduling in these screen tests, so a shorter real timeout is the
// simpler, more reliable option here.)

import { fireEvent, render, screen } from '@testing-library/react-native';
import AddResidentScreen from '../screens/AddResidentScreen';
import { docSnap, firestore } from './mocks/firebase';

jest.mock('../utils/withTimeout', () => {
  const actual = jest.requireActual('../utils/withTimeout');
  return {
    ...actual, // keep the real isTimeoutError
    withTimeout: (promise) => actual.withTimeout(promise, 20),
  };
});

const navigation = { navigate: jest.fn(), goBack: jest.fn() };
const never = () => new Promise(() => {});
const notFound = () => Object.assign(new Error('missing'), { code: 'permission-denied' });

// Renders the form for a user with no organization (so it goes straight to
// the name field), types a name and taps Create.
async function fillAndSubmit() {
  firestore.getDoc.mockResolvedValueOnce(docSnap({ role: 'Caregiver' })); // user doc, no orgId
  await render(<AddResidentScreen navigation={navigation} />);
  await fireEvent.changeText(await screen.findByPlaceholderText("Resident's full name"), 'Ann');
  await fireEvent.press(screen.getByLabelText('Create resident'));
}

let warn;
beforeEach(() => {
  navigation.goBack.mockReset();
  // The screen console.warns when a save is slow; keep test output quiet.
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe('AddResidentScreen save', () => {
  it('writes to a pre-generated id with setDoc (not addDoc) and goes back', async () => {
    firestore.setDoc.mockResolvedValueOnce(undefined);
    await fillAndSubmit();

    expect(firestore.addDoc).not.toHaveBeenCalled();
    expect(firestore.setDoc).toHaveBeenCalledTimes(1);
    expect(firestore.setDoc.mock.calls[0][0].path).toBe('residents/new-id');
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('treats a slow save as uncertain, and succeeds if the server has it', async () => {
    firestore.setDoc.mockReturnValueOnce(never()); // hangs…
    firestore.getDocFromServer.mockResolvedValueOnce(docSnap({ name: 'Ann' })); // …but it landed

    await fillAndSubmit();

    expect(firestore.getDocFromServer).toHaveBeenCalled();
    expect(navigation.goBack).toHaveBeenCalled();
    expect(screen.queryByText(/couldn't confirm/)).toBeNull();
  });

  it('offers Try again when unconfirmed, and the retry reuses the same id', async () => {
    firestore.setDoc.mockReturnValueOnce(never()).mockResolvedValueOnce(undefined);
    // After the timeout: not on the server. Before the retry: still not there.
    firestore.getDocFromServer.mockRejectedValueOnce(notFound()).mockRejectedValueOnce(notFound());

    await fillAndSubmit();

    expect(await screen.findByText(/couldn't confirm/)).toBeTruthy();
    expect(navigation.goBack).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText('Try again'));

    expect(firestore.setDoc).toHaveBeenCalledTimes(2);
    // Both attempts target the same document → no duplicate possible.
    expect(firestore.setDoc.mock.calls[1][0].path).toBe(firestore.setDoc.mock.calls[0][0].path);
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('does not write again if the first attempt landed before the retry', async () => {
    firestore.setDoc.mockReturnValueOnce(never());
    firestore.getDocFromServer
      .mockRejectedValueOnce(notFound()) // not there yet after the timeout
      .mockResolvedValueOnce(docSnap({ name: 'Ann' })); // there by the time of the retry

    await fillAndSubmit();
    await fireEvent.press(await screen.findByLabelText('Try again'));

    expect(firestore.setDoc).toHaveBeenCalledTimes(1);
    expect(navigation.goBack).toHaveBeenCalled();
  });
});
