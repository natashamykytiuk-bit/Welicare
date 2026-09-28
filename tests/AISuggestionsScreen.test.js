// Regression test for the Phase 1 AISuggestionsScreen fix: the resident
// read used to sit outside the try block, so if Firestore failed, the
// "finally" that turns the spinner off never ran and it spun forever.
//
// Two extra techniques here:
// - jest.mock of the app's own ResidentLockContext: the screen calls
//   useResidentLock(), which normally needs a Provider higher up. Mocking
//   the hook keeps the test focused on the loading behaviour.
// - Checking the spinner by testID: an ActivityIndicator has no text or
//   label to find it by, so the screen gives it testID="ai-suggestions-
//   loading" (invisible to users) and the test looks it up with
//   queryByTestId. render/fireEvent are async in RNTL v14, so they're awaited.

import { fireEvent, render, screen } from '@testing-library/react-native';
import AISuggestionsScreen from '../components/AISuggestionsScreen';
import { callable, docSnap, firestore } from './mocks/firebase';

jest.mock('../contexts/ResidentLockContext', () => ({
  useResidentLock: () => ({ locked: false, requestPin: jest.fn() }),
}));

const props = {
  navigation: { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true },
  route: { params: { residentId: 'resident-1' } },
  kind: 'activityIdeas',
  title: 'Activity Ideas',
  description: 'Ideas tailored to this resident.',
};

describe('AISuggestionsScreen', () => {
  it('stops loading and shows an error when the resident read fails', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    firestore.getDoc.mockRejectedValueOnce(new Error('permission-denied'));

    await render(<AISuggestionsScreen {...props} />);

    expect(await screen.findByText(/Something went wrong/)).toBeTruthy();
    expect(screen.queryByTestId('ai-suggestions-loading')).toBeNull();
    // The Cloud Function must not be called if the resident couldn't load.
    expect(callable('generateSuggestions')).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // The screen reads four docs (resident, the signed-in user, the life
  // story, the safety notes), partly in parallel — so reads are answered by
  // path rather than by call order. A value that's an Error is thrown.
  function mockReads({ role = 'Caregiver', lifeStory, safety } = {}) {
    const byPath = {
      'residents/resident-1': { name: 'Ann', hasLifeStory: true },
      'users/test-uid': { role },
      'residents/resident-1/private/lifeStory': lifeStory,
      'residents/resident-1/private/safety': safety,
    };
    firestore.getDoc.mockImplementation(async (ref) => {
      const value = byPath[ref.path];
      if (value instanceof Error) throw value;
      return docSnap(value);
    });
  }

  it('shows the suggestions when everything succeeds', async () => {
    mockReads({ lifeStory: { career: 'Farmer' } });
    callable('generateSuggestions').mockResolvedValueOnce({ data: { text: '1. Visit a farm' } });

    await render(<AISuggestionsScreen {...props} />);

    expect(await screen.findByText('1. Visit a farm')).toBeTruthy();
    expect(screen.queryByTestId('ai-suggestions-loading')).toBeNull();
    // The life story from Firestore is what gets sent to the function.
    expect(callable('generateSuggestions')).toHaveBeenCalledWith({
      kind: 'activityIdeas',
      lifeStory: { career: 'Farmer' },
      topicsToAvoid: null,
    });
  });

  it('gives general suggestions when the life story is off-limits (e.g. a volunteer)', async () => {
    mockReads({
      role: 'Volunteer',
      lifeStory: Object.assign(new Error('denied'), { code: 'permission-denied' }),
    });
    callable('generateSuggestions').mockResolvedValueOnce({ data: { text: '1. Sing-along' } });

    await render(<AISuggestionsScreen {...props} />);

    expect(await screen.findByText('1. Sing-along')).toBeTruthy();
    // No personal details are sent to the AI for someone who can't see them.
    expect(callable('generateSuggestions')).toHaveBeenCalledWith({
      kind: 'activityIdeas',
      lifeStory: null,
      topicsToAvoid: null,
    });
    // Volunteers can't change safety notes, so no "Not for Ann" button.
    expect(screen.queryByLabelText('Not for Ann')).toBeNull();
  });

  it("sends the resident's topics to avoid with the request", async () => {
    mockReads({ safety: { topicsToAvoid: 'No water activities' } });
    callable('generateSuggestions').mockResolvedValueOnce({ data: { text: '1. Garden walk' } });

    await render(<AISuggestionsScreen {...props} />);

    expect(await screen.findByText('1. Garden walk')).toBeTruthy();
    expect(callable('generateSuggestions')).toHaveBeenCalledWith(
      expect.objectContaining({ topicsToAvoid: 'No water activities' })
    );
  });

  it('lets staff mark a suggestion "Not for" the resident, adding it to topics to avoid', async () => {
    mockReads({ safety: { topicsToAvoid: 'No peanuts' } });
    callable('generateSuggestions').mockResolvedValueOnce({
      data: { text: '1. **Swimming** at the pool\n\n2. Garden walk' },
    });

    await render(<AISuggestionsScreen {...props} />);
    await screen.findByText('2. Garden walk');
    await fireEvent.press(screen.getAllByLabelText('Not for Ann')[0]);

    expect(await screen.findByText(/added to Ann's topics to avoid/)).toBeTruthy();
    // Existing notes kept; the flagged suggestion added as a plain line.
    expect(firestore.setDoc.mock.calls[0][0].path).toBe('residents/resident-1/private/safety');
    expect(firestore.setDoc.mock.calls[0][1].topicsToAvoid).toBe(
      'No peanuts\nNot a good fit (from AI suggestions): Swimming at the pool'
    );
  });

  it('never offers "Not for" in Resident Mode', async () => {
    mockReads();
    callable('generateSuggestions').mockResolvedValueOnce({ data: { text: '1. Chat about pets' } });

    await render(
      <AISuggestionsScreen
        {...props}
        route={{ params: { residentId: 'resident-1', fromResidentMode: true } }}
      />
    );

    expect(await screen.findByText('1. Chat about pets')).toBeTruthy();
    expect(screen.queryByLabelText('Not for Ann')).toBeNull();
  });
});
