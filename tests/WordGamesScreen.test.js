// Finish the Phrase inside GameShell: a full Gentle round to the
// completion view, and a wrong word quietly fading with no negative
// feedback. buildRound is replaced with a fixed round so the test knows
// the answers; the other rules are the real ones.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import WordGamesScreen from '../screens/WordGamesScreen';

jest.mock('../contexts/ResidentLockContext', () => ({
  useResidentLock: () => ({ locked: false, requestPin: jest.fn() }),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('../games/finishThePhrase/logic', () => {
  const actual = jest.requireActual('../games/finishThePhrase/logic');
  const q = (before, answer, other) => ({
    phrase: { before, answer, after: '' },
    choices: [other, answer],
  });
  return {
    ...actual,
    buildRound: () => [
      q('The early bird catches the', 'worm', 'star'),
      q('Two peas in a', 'pod', 'bee'),
      q('Bread and', 'butter', 'chips'),
      q('Salt and', 'pepper', 'gold'),
      q('Row, row, row your', 'boat', 'hill'),
    ],
  };
});

const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };

async function startRound() {
  await render(<WordGamesScreen navigation={navigation} />);
  await fireEvent.press(screen.getByLabelText('Start'));
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('WordGamesScreen (Finish the Phrase)', () => {
  it('plays a round of five phrases to the completion screen', async () => {
    await startRound();
    expect(screen.getByLabelText('The early bird catches the blank')).toBeTruthy();

    for (const word of ['worm', 'pod', 'butter', 'pepper', 'boat']) {
      await fireEvent.press(screen.getByLabelText(word));
      await act(() => jest.advanceTimersByTime(1800));
    }

    expect(screen.getByText('Wonderful! You finished every phrase.')).toBeTruthy();
  });

  it('fills in the blank when the right word is chosen', async () => {
    await startRound();
    await fireEvent.press(screen.getByLabelText('worm'));
    expect(screen.getByLabelText('The early bird catches the worm')).toBeTruthy();
    expect(screen.getByLabelText('1 of 5 phrases finished')).toBeTruthy();
  });

  it('fades a wrong word quietly, and the right word still works', async () => {
    await startRound();
    await fireEvent.press(screen.getByLabelText('star'));
    expect(screen.getByLabelText('star').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText('0 of 5 phrases finished')).toBeTruthy();
    expect(screen.queryByText(/wrong|try again|oops|incorrect/i)).toBeNull();

    await fireEvent.press(screen.getByLabelText('worm'));
    expect(screen.getByLabelText('1 of 5 phrases finished')).toBeTruthy();
  });
});
