// Play-time logging: the document utils/activitySessions.js builds, and when
// hooks/useActivitySession.js saves one (leaving the screen, the app going
// to the background, too-short visits, never twice).
import { act, render, waitFor } from '@testing-library/react-native';
import { AppState, Text } from 'react-native';
import useActivitySession from '../hooks/useActivitySession';
import { buildSessionDoc, newLiveSession } from '../utils/activitySessions';
import { auth, docSnap, firestore } from './mocks/firebase';

const PROFILE = { orgId: 'orgA', role: 'Caregiver' };

describe('buildSessionDoc', () => {
  const base = {
    activityType: 'game',
    activityId: 'molehunt',
    userId: 'u1',
    profile: PROFILE,
  };

  it('builds exactly the allowed fields for a resident visit', () => {
    const session = {
      ...newLiveSession(0),
      roundsStarted: 2,
      roundsCompleted: 1,
      difficulty: 'medium',
    };
    const d = buildSessionDoc({ ...base, session, endedAt: 95_000, residentId: 'r1' });
    expect(d).toEqual({
      facilityId: 'orgA',
      residentId: 'r1',
      isGuest: false,
      activityType: 'game',
      activityId: 'molehunt',
      difficulty: 'medium',
      roundsStarted: 2,
      roundsCompleted: 1,
      startedAt: new Date(0),
      endedAt: new Date(95_000),
      durationSeconds: 95,
      userId: 'u1',
      userRole: 'Caregiver',
    });
  });

  it('marks a visit without a resident as Guest Mode', () => {
    const d = buildSessionDoc({
      ...base,
      session: newLiveSession(0),
      endedAt: 20_000,
      residentId: null,
    });
    expect(d).toMatchObject({ residentId: null, isGuest: true, difficulty: null });
  });

  it('skips visits under 10 seconds, and users without a facility', () => {
    const session = newLiveSession(0);
    expect(buildSessionDoc({ ...base, session, endedAt: 9_999, residentId: null })).toBeNull();
    expect(
      buildSessionDoc({
        ...base,
        session,
        endedAt: 60_000,
        residentId: null,
        profile: { role: 'Caregiver' },
      })
    ).toBeNull();
  });
});

// A screen that only runs the hook, exposing its functions to the test.
let api;
function Probe(props) {
  api = useActivitySession({ activityType: 'game', activityId: 'molehunt', ...props });
  return <Text>probe</Text>;
}

// A minimal navigation object whose focus/blur listeners the test can fire.
function fakeNavigation() {
  const listeners = {};
  return {
    isFocused: () => true,
    addListener: jest.fn((event, fn) => {
      listeners[event] = fn;
      return () => delete listeners[event];
    }),
    fire: (event) => listeners[event]?.(),
  };
}

// Flushes the pending promises of a fire-and-forget save.
const flush = () =>
  act(async () => {
    // The save awaits the profile, then the write: let each step settle.
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });

describe('useActivitySession', () => {
  let appStateHandler;

  beforeEach(() => {
    jest.useFakeTimers();
    auth.currentUser = { uid: 'u1' };
    firestore.getDoc.mockResolvedValue(docSnap(PROFILE));
    firestore.addDoc.mockResolvedValue({ id: 'new-id' });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_e, fn) => {
      appStateHandler = fn;
      return { remove: jest.fn() };
    });
  });
  afterEach(() => jest.useRealTimers());

  it('saves one session with its rounds when the screen is left', async () => {
    const navigation = fakeNavigation();
    await render(<Probe navigation={navigation} residentId="r1" />);
    api.roundStarted('gentle');
    api.roundCompleted();
    api.roundStarted('challenge');
    await act(() => jest.advanceTimersByTime(30_000));

    navigation.fire('blur');
    navigation.fire('blur'); // a second end signal must not save again
    await flush();

    expect(firestore.addDoc).toHaveBeenCalledTimes(1);
    expect(firestore.addDoc.mock.calls[0][0]).toEqual({ path: 'activitySessions' });
    expect(firestore.addDoc.mock.calls[0][1]).toMatchObject({
      residentId: 'r1',
      difficulty: 'challenge',
      roundsStarted: 2,
      roundsCompleted: 1,
      durationSeconds: 30,
    });
  });

  it('does not save a visit shorter than 10 seconds', async () => {
    const navigation = fakeNavigation();
    await render(<Probe navigation={navigation} />);
    await act(() => jest.advanceTimersByTime(5_000));
    navigation.fire('blur');
    await flush();
    expect(firestore.addDoc).not.toHaveBeenCalled();
  });

  it('ends the visit when the app goes to the background, and starts a new one on return', async () => {
    const navigation = fakeNavigation();
    const screen = await render(<Probe navigation={navigation} />);
    await act(() => jest.advanceTimersByTime(20_000));
    await act(() => appStateHandler('inactive')); // brief interruption: keeps going
    await act(() => appStateHandler('background'));
    await flush();
    expect(firestore.addDoc).toHaveBeenCalledTimes(1);

    await act(() => appStateHandler('active'));
    await act(() => jest.advanceTimersByTime(15_000));
    await screen.unmount(); // unmount is also an end signal
    await waitFor(() => expect(firestore.addDoc).toHaveBeenCalledTimes(2));
    expect(firestore.addDoc.mock.calls[1][1]).toMatchObject({ isGuest: true, durationSeconds: 15 });
  });

  it('never throws or surfaces an error when the save fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    firestore.addDoc.mockRejectedValue(new Error('offline'));
    const navigation = fakeNavigation();
    await render(<Probe navigation={navigation} />);
    await act(() => jest.advanceTimersByTime(12_000));
    navigation.fire('blur');
    await flush();
    expect(warn).toHaveBeenCalledWith(
      '[activitySessions] could not save session:',
      undefined,
      'offline'
    );
    warn.mockRestore();
  });

  it('logs nothing when disabled', async () => {
    const navigation = fakeNavigation();
    await render(<Probe navigation={navigation} enabled={false} />);
    await act(() => jest.advanceTimersByTime(60_000));
    navigation.fire('blur');
    await flush();
    expect(firestore.addDoc).not.toHaveBeenCalled();
  });
});
