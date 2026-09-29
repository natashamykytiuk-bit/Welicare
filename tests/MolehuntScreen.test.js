// Molehunt inside GameShell: a full Gentle round to the completion view,
// the "Two moles at once" switch, and taps on empty molehills doing
// nothing. The real rules are used; moles are found by their labels.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import MolehuntScreen from '../screens/MolehuntScreen';

jest.mock('../contexts/ResidentLockContext', () => ({
  useResidentLock: () => ({ locked: false, requestPin: jest.fn() }),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));

const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };

// Starts a Gentle round (optionally with two moles) and gives the board a
// size, as a real device would.
async function startRound({ twoMoles = false } = {}) {
  await render(<MolehuntScreen navigation={navigation} />);
  if (twoMoles) await fireEvent.press(screen.getByLabelText('Two moles at once'));
  await fireEvent.press(screen.getByLabelText('Start'));
  await fireEvent(screen.getByLabelText('Molehunt molehills'), 'layout', {
    nativeEvent: { layout: { width: 900, height: 600 } },
  });
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('MolehuntScreen', () => {
  it('has the two-moles switch off by default', async () => {
    await render(<MolehuntScreen navigation={navigation} />);
    const toggle = screen.getByLabelText('Two moles at once');
    expect(toggle.props.accessibilityState.checked).toBe(false);
    await fireEvent.press(toggle);
    expect(screen.getByLabelText('Two moles at once').props.accessibilityState.checked).toBe(true);
  });

  it('plays a Gentle round of five moles to the completion screen', async () => {
    await startRound();
    expect(screen.getAllByLabelText(/^(Mole|Molehill)$/)).toHaveLength(3);
    expect(screen.getAllByLabelText('Mole')).toHaveLength(1);

    for (let i = 1; i <= 5; i++) {
      await fireEvent.press(screen.getByLabelText('Mole'));
      expect(screen.getByLabelText(`${i} of 5 moles found`)).toBeTruthy();
      await act(() => jest.advanceTimersByTime(1200));
    }

    expect(screen.getByText('Wonderful! You found all the moles.')).toBeTruthy();
  });

  it('shows two moles at once with the switch on, and still ends after five', async () => {
    await startRound({ twoMoles: true });
    expect(screen.getAllByLabelText('Mole')).toHaveLength(2);

    for (let i = 1; i <= 5; i++) {
      await fireEvent.press(screen.getAllByLabelText('Mole')[0]);
      await act(() => jest.advanceTimersByTime(1200));
    }

    expect(screen.getByText('Wonderful! You found all the moles.')).toBeTruthy();
  });

  it('moves an untapped mole to another hole without counting a miss', async () => {
    await startRound();
    const holeOf = () =>
      screen
        .getAllByLabelText(/^(Mole|Molehill)$/)
        .findIndex((h) => h.props.accessibilityLabel === 'Mole');
    const first = holeOf();

    // Gentle keeps a mole up for 7 seconds; then it ducks down…
    await act(() => jest.advanceTimersByTime(7000));
    expect(screen.queryByLabelText('Mole')).toBeNull();
    // …and pops up somewhere else after a short beat.
    await act(() => jest.advanceTimersByTime(600));
    expect(holeOf()).not.toBe(first);
    expect(holeOf()).toBeGreaterThanOrEqual(0);
    expect(screen.getByLabelText('0 of 5 moles found')).toBeTruthy();
    expect(screen.queryByText(/wrong|miss|try again|oops/i)).toBeNull();
  });

  it('ignores taps on empty molehills, with no negative message', async () => {
    await startRound();
    for (const hill of screen.getAllByLabelText('Molehill')) await fireEvent.press(hill);
    expect(screen.getByLabelText('0 of 5 moles found')).toBeTruthy();
    expect(screen.getByLabelText('Mole')).toBeTruthy();
    expect(screen.queryByText(/wrong|miss|try again|oops/i)).toBeNull();
  });
});
