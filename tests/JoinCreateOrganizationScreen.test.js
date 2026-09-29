// Screen test for one of the Phase 1 loads: JoinCreateOrganizationScreen
// reads the user's role from Firestore before showing its options.
//
// How screen tests work:
// 1. Decide what "Firebase" returns by setting the shared mock
//    (tests/mocks/firebase.js) — e.g. getDoc resolves with a role, or
//    rejects to simulate being offline.
// 2. await render(<Screen />) draws the component in memory (no phone needed).
// 3. Query what's on screen like a user would — getByText / getByLabelText
//    (the accessibilityLabel). `findBy…` waits for it to appear, which is
//    what you need after an async load; `queryBy…` returns null instead of
//    throwing, for checking something is *absent*.
// 4. await fireEvent.press(...) taps a button, then assert again.

// Note: in @testing-library/react-native v14, render() and fireEvent are
// async — always `await` them. act() wraps anything that updates state
// outside of those helpers (here, resolving our hand-made promise).
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import JoinCreateOrganizationScreen from '../screens/JoinCreateOrganizationScreen';
import { docSnap, firestore } from './mocks/firebase';

// The screen only uses navigation.navigate/reset; a plain object with
// jest.fn()s is enough, and lets us check where it tried to go.
const navigation = { navigate: jest.fn(), reset: jest.fn() };

describe('JoinCreateOrganizationScreen', () => {
  it('shows a spinner, then the options once the role loads', async () => {
    // A promise we resolve by hand, so the test controls exactly when the
    // "Firestore read" finishes — otherwise it could finish before we get
    // to check the loading state.
    let finishLoad;
    firestore.getDoc.mockReturnValueOnce(
      new Promise((resolve) => {
        finishLoad = resolve;
      })
    );

    await render(<JoinCreateOrganizationScreen navigation={navigation} />);

    // While the load is still pending, the options aren't there yet.
    expect(screen.queryByLabelText('Join an organization')).toBeNull();

    // Now let the load finish: options appear, and a Caregiver may skip.
    await act(async () => finishLoad(docSnap({ role: 'Family Caregiver' })));
    expect(await screen.findByLabelText('Join an organization')).toBeTruthy();
    expect(screen.getByLabelText('Skip this step')).toBeTruthy();
  });

  it('hides Skip for administrators', async () => {
    firestore.getDoc.mockResolvedValueOnce(docSnap({ role: 'Administrator' }));
    await render(<JoinCreateOrganizationScreen navigation={navigation} />);
    await screen.findByLabelText('Join an organization');
    expect(screen.queryByLabelText('Skip this step')).toBeNull();
  });

  it('hides Skip for volunteers — only Family Caregivers can skip', async () => {
    firestore.getDoc.mockResolvedValueOnce(docSnap({ role: 'Volunteer' }));
    await render(<JoinCreateOrganizationScreen navigation={navigation} />);
    await screen.findByLabelText('Join an organization');
    expect(screen.queryByLabelText('Skip this step')).toBeNull();
  });

  it('shows Try again when the load fails, and recovers when it works', async () => {
    // The screen console.errors the failure on purpose; silence it here so
    // the test output stays readable (and restore it afterwards).
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // First load fails, the retry succeeds — mockRejectedValueOnce /
    // mockResolvedValueOnce queue up one result per call, in order.
    firestore.getDoc
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(docSnap({ role: 'Caregiver' }));

    await render(<JoinCreateOrganizationScreen navigation={navigation} />);

    const retry = await screen.findByLabelText('Try again');
    expect(screen.queryByLabelText('Join an organization')).toBeNull();
    expect(spy).toHaveBeenCalled();

    await fireEvent.press(retry);

    expect(await screen.findByLabelText('Join an organization')).toBeTruthy();
    expect(screen.queryByLabelText('Try again')).toBeNull();
    expect(firestore.getDoc).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
