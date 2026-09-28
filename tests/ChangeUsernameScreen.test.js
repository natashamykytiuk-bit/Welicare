// Tests for changing a username with a writeBatch.
//
// A batch groups several writes so Firestore applies all of them or none.
// The shared mock records every batch the screen creates (`batches`), so
// these tests check:
// - the three writes (claim new name, update profile, release old name)
//   go into ONE batch that's committed once — nothing is written directly;
// - when the commit fails, the screen reports that nothing changed.
// In the mock, "nothing changed" is simply: no individual setDoc /
// updateDoc / deleteDoc calls, only the one batch commit that rejected.

import { fireEvent, render, screen } from '@testing-library/react-native';
import ChangeUsernameScreen from '../screens/ChangeUsernameScreen';
import { batches, docSnap, firestore } from './mocks/firebase';

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

// The screen first loads the current username from the user's profile.
async function renderWithCurrentName(name) {
  firestore.getDoc.mockResolvedValueOnce(docSnap({ username: name }));
  await render(<ChangeUsernameScreen navigation={navigation} />);
  await screen.findByText(name);
}

async function submit(newName) {
  await fireEvent.changeText(screen.getByLabelText('New username'), newName);
  await fireEvent.press(screen.getByLabelText('Save username'));
}

describe('ChangeUsernameScreen', () => {
  it('claims, updates and releases in a single committed batch', async () => {
    await renderWithCurrentName('old.name');
    firestore.getDoc.mockResolvedValueOnce(docSnap(undefined)); // new name is free

    await submit('New.Name');

    expect(batches).toHaveLength(1);
    expect(batches[0].ops).toEqual([
      ['set', 'usernames/new.name', { uid: 'test-uid' }],
      ['update', 'users/test-uid', { username: 'New.Name' }],
      ['delete', 'usernames/old.name'],
    ]);
    expect(batches[0].commit).toHaveBeenCalledTimes(1);
    // Nothing written outside the batch.
    expect(firestore.setDoc).not.toHaveBeenCalled();
    expect(firestore.updateDoc).not.toHaveBeenCalled();
    expect(firestore.deleteDoc).not.toHaveBeenCalled();
    expect(await screen.findByText('Your username has been updated.')).toBeTruthy();
  });

  it('says nothing changed when the batch fails', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await renderWithCurrentName('old.name');
    firestore.getDoc
      .mockResolvedValueOnce(docSnap(undefined)) // free when checked…
      .mockResolvedValueOnce(docSnap(undefined)); // …and still free after (so: general failure)
    firestore.writeBatch.mockImplementationOnce(() => {
      const batch = { ops: [], set: jest.fn(), update: jest.fn(), delete: jest.fn() };
      batch.commit = jest.fn().mockRejectedValue(new Error('offline'));
      batches.push(batch);
      return batch;
    });

    await submit('new.name');

    expect(await screen.findByText(/username was not changed/)).toBeTruthy();
    expect(screen.getByText('old.name')).toBeTruthy(); // still shows the old name
    spy.mockRestore();
  });

  it('explains when the name was taken between the check and the save', async () => {
    await renderWithCurrentName('old.name');
    firestore.getDoc
      .mockResolvedValueOnce(docSnap(undefined)) // free when checked…
      .mockResolvedValueOnce(docSnap({ uid: 'someone-else' })); // …taken by commit time
    firestore.writeBatch.mockImplementationOnce(() => {
      const batch = { ops: [], set: jest.fn(), update: jest.fn(), delete: jest.fn() };
      batch.commit = jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));
      return batch;
    });

    await submit('new.name');

    expect(await screen.findByText(/was just taken/)).toBeTruthy();
  });
});
