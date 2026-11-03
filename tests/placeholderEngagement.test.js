// "Coming soon" activities must not count toward a resident's engagement:
// a long visit to one of these screens saves no activitySessions document.
import { act, render, screen } from '@testing-library/react-native';
import GuidedMeditationScreen from '../screens/GuidedMeditationScreen';
import TriviaScreen from '../screens/TriviaScreen';
import { auth, docSnap, firestore } from './mocks/firebase';

jest.mock('../contexts/ResidentLockContext', () => ({
  useResidentLock: () => ({ locked: false, requestPin: jest.fn() }),
}));

function fakeNavigation() {
  const listeners = {};
  return {
    navigate: jest.fn(),
    goBack: jest.fn(),
    canGoBack: () => true,
    isFocused: () => true,
    addListener: jest.fn((event, fn) => {
      listeners[event] = fn;
      return () => delete listeners[event];
    }),
    fire: (event) => listeners[event]?.(),
  };
}

describe.each([
  ['GuidedMeditationScreen', GuidedMeditationScreen],
  ['TriviaScreen', TriviaScreen],
])('%s', (_name, Screen) => {
  beforeEach(() => {
    jest.useFakeTimers();
    auth.currentUser = { uid: 'u1' };
    firestore.getDoc.mockResolvedValue(docSnap({ orgId: 'orgA', role: 'Caregiver' }));
    firestore.addDoc.mockResolvedValue({ id: 'new-id' });
  });
  afterEach(() => jest.useRealTimers());

  it('saves no activity session, however long the visit', async () => {
    const navigation = fakeNavigation();
    await render(<Screen navigation={navigation} route={{ params: { residentId: 'r1' } }} />);
    expect(screen.getByText('Coming soon')).toBeTruthy();
    await act(() => jest.advanceTimersByTime(5 * 60_000));
    navigation.fire('blur');
    await screen.unmount();
    await act(async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });
    expect(firestore.addDoc).not.toHaveBeenCalled();
  });
});
