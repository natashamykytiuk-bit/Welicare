// Memory Match inside GameShell: setup → play a full Gentle round → the
// warm completion view, and a non-matching pair turning back with no
// negative feedback.
//
// The deck is normally shuffled at random; here buildDeck is replaced with
// a fixed deck so the test knows where each picture is. The rest of the
// rules (isMatch, canFlip, …) are the real ones.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import MemoryMatchScreen from '../screens/MemoryMatchScreen';

jest.mock('../contexts/ResidentLockContext', () => ({
  useResidentLock: () => ({ locked: false, requestPin: jest.fn() }),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('../games/memoryMatch/logic', () => {
  const actual = jest.requireActual('../games/memoryMatch/logic');
  const card = (id, faceId, label) => ({
    id,
    faceId,
    label,
    icon: 'sunny-outline',
    accent: 'games',
  });
  return {
    ...actual,
    // Fixed order: sun, paw, cup, then their partners in the same order.
    buildDeck: () => [
      card('sun-a', 'sun', 'sun'),
      card('paw-a', 'paw', 'paw print'),
      card('cup-a', 'cup', 'coffee cup'),
      card('sun-b', 'sun', 'sun'),
      card('paw-b', 'paw', 'paw print'),
      card('cup-b', 'cup', 'coffee cup'),
    ],
  };
});

const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };

// Starts a Gentle round and gives the board a size, as a real device would.
async function startRound() {
  await render(<MemoryMatchScreen navigation={navigation} />);
  await fireEvent.press(screen.getByLabelText('Start'));
  await fireEvent(screen.getByLabelText('Memory Match cards'), 'layout', {
    nativeEvent: { layout: { width: 900, height: 600 } },
  });
}

// Face-down cards, in deck order.
const faceDown = () => screen.getAllByLabelText('Card, face down');
// Every card, face up or down, in deck order (their labels change as they
// turn over, so match any of the possible labels).
const allCards = () => screen.getAllByLabelText(/^(Card, face down|sun|paw print|coffee cup)/);

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('MemoryMatchScreen', () => {
  it('starts on Gentle, with the difficulty picker and Start button', async () => {
    await render(<MemoryMatchScreen navigation={navigation} />);
    expect(screen.getByLabelText('Gentle').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('Start')).toBeTruthy();
  });

  it('plays a round to the warm completion screen', async () => {
    await startRound();
    expect(faceDown()).toHaveLength(6);

    // Match each pair by position in the fixed deck: card N pairs with N+3.
    for (const [first, second] of [
      [0, 3],
      [1, 4],
      [2, 5],
    ]) {
      await fireEvent.press(allCards()[first]);
      await fireEvent.press(allCards()[second]);
    }
    await act(() => jest.runAllTimers());

    expect(screen.getByText('Wonderful! You found them all.')).toBeTruthy();
    expect(screen.getByLabelText('Play again')).toBeTruthy();
    expect(screen.getByLabelText('Back to games')).toBeTruthy();
  });

  it('turns a non-matching pair back over, with no negative message', async () => {
    await startRound();
    const cards = faceDown();
    await fireEvent.press(cards[0]); // sun
    await fireEvent.press(cards[1]); // paw
    expect(screen.queryAllByLabelText('Card, face down')).toHaveLength(4);

    // Taps during the pause are ignored.
    await fireEvent.press(faceDown()[0]);
    expect(screen.queryAllByLabelText('Card, face down')).toHaveLength(4);

    await act(() => jest.advanceTimersByTime(1500));
    expect(faceDown()).toHaveLength(6);
    expect(screen.queryByText(/wrong|try again|oops/i)).toBeNull();
  });
});
