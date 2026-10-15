// Covers utils/homeSnapshot.js: per-user isolation and sign-out wiping,
// which is what keeps one person's cached hub from showing for another.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearHomeSnapshots,
  loadHomeSnapshot,
  peekHomeSnapshot,
  saveHomeSnapshot,
} from '../utils/homeSnapshot';

beforeEach(async () => {
  await AsyncStorage.clear();
  await clearHomeSnapshots();
});

test('saves, merges and reloads a user snapshot', async () => {
  await saveHomeSnapshot('u1', { route: 'ModeSelection' });
  await saveHomeSnapshot('u1', { role: 'Caregiver' });
  await loadHomeSnapshot('u2'); // drops u1 from memory, so the next load reads disk
  expect(peekHomeSnapshot('u1')).toBeNull();
  expect(await loadHomeSnapshot('u1')).toEqual({
    uid: 'u1',
    route: 'ModeSelection',
    role: 'Caregiver',
  });
  expect(peekHomeSnapshot('u1')?.role).toBe('Caregiver');
});

test("never returns another user's snapshot", async () => {
  await saveHomeSnapshot('u1', { role: 'Administrator' });
  expect(peekHomeSnapshot('u2')).toBeNull();
  expect(await loadHomeSnapshot('u2')).toBeNull();
});

test('ignores a stored snapshot whose uid does not match its key', async () => {
  await AsyncStorage.setItem('homeSnapshot:u1', JSON.stringify({ uid: 'u2', role: 'x' }));
  expect(await loadHomeSnapshot('u1')).toBeNull();
});

test('clearHomeSnapshots wipes every snapshot but leaves other keys', async () => {
  await saveHomeSnapshot('u1', { role: 'a' });
  await saveHomeSnapshot('u2', { role: 'b' });
  await AsyncStorage.setItem('other', '1');
  await clearHomeSnapshots();
  expect(await loadHomeSnapshot('u1')).toBeNull();
  expect(await loadHomeSnapshot('u2')).toBeNull();
  expect(await AsyncStorage.getItem('other')).toBe('1');
});
