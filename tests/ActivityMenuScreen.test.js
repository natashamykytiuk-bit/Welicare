// Tests for the Resident Mode lock on ActivityMenuScreen.
//
// While locked, every way of leaving the screen must ask for the PIN first.
// React Navigation reports all of them (back gesture, Android back button,
// header back, navigate-away) as one 'beforeRemove' event, which the screen
// listens for. Here the navigation object is a mock that records the
// listeners the screen registers, so a test can fire 'beforeRemove' itself
// and check the screen stopped it.
//
// The lock state comes from useResidentLock, mocked so each test chooses
// locked/unlocked and can see whether requestPin (the PIN prompt) was used.

import { fireEvent, render, screen } from '@testing-library/react-native';
import ActivityMenuScreen from '../screens/ActivityMenuScreen';
import { docSnap, firestore } from './mocks/firebase';

const mockLock = {
  locked: true,
  requestPin: jest.fn(),
  toggleLock: jest.fn(),
  resetLock: jest.fn(),
};
jest.mock('../contexts/ResidentLockContext', () => ({ useResidentLock: () => mockLock }));

function makeNavigation() {
  const listeners = {};
  return {
    listeners,
    navigate: jest.fn(),
    goBack: jest.fn(),
    canGoBack: () => true,
    dispatch: jest.fn(),
    addListener: jest.fn((event, handler) => {
      listeners[event] = handler;
      return () => delete listeners[event];
    }),
  };
}

const route = { params: { residentId: 'r1', residentName: 'Ann' } };

beforeEach(() => {
  mockLock.locked = true;
  mockLock.requestPin.mockReset();
  // A resident with no life story, so the "Complete Profile" banner shows.
  firestore.getDoc.mockResolvedValue(docSnap({ name: 'Ann Smith', lifeStory: null }));
});

describe('ActivityMenuScreen lock', () => {
  it('blocks leaving while locked and asks for the PIN', async () => {
    const navigation = makeNavigation();
    await render(<ActivityMenuScreen navigation={navigation} route={route} />);

    const event = { preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } };
    navigation.listeners.beforeRemove(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(mockLock.requestPin).toHaveBeenCalled();
    // After the PIN is accepted, the original navigation goes ahead.
    mockLock.requestPin.mock.calls[0][0]();
    expect(navigation.dispatch).toHaveBeenCalledWith(event.data.action);
  });

  it('lets you leave freely when unlocked', async () => {
    mockLock.locked = false;
    const navigation = makeNavigation();
    await render(<ActivityMenuScreen navigation={navigation} route={route} />);

    const event = { preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } };
    navigation.listeners.beforeRemove(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(mockLock.requestPin).not.toHaveBeenCalled();
  });

  it('asks for the PIN before Complete Profile while locked', async () => {
    const navigation = makeNavigation();
    await render(<ActivityMenuScreen navigation={navigation} route={route} />);

    await fireEvent.press(await screen.findByLabelText('Complete Profile'));

    expect(navigation.navigate).not.toHaveBeenCalledWith('BuildProfile', expect.anything());
    expect(mockLock.requestPin).toHaveBeenCalled();
    mockLock.requestPin.mock.calls[0][0](); // PIN accepted
    expect(navigation.navigate).toHaveBeenCalledWith('BuildProfile', {
      residentId: 'r1',
      returnTo: 'ActivityMenu',
    });
  });
});
