// Regression test for the Phase 1 AISuggestionsScreen fix: the resident
// read used to sit outside the try block, so if Firestore failed, the
// "finally" that turns the spinner off never ran and it spun forever.
// Also covers showing the brief, "Not for" on an idea, and good/bad ratings.
//
// Two extra techniques here:
// - jest.mock of the app's own ResidentLockContext: the screen calls
//   useResidentLock(), which normally needs a Provider higher up. Mocking
//   the hook keeps the test focused on the loading behaviour.
// - Checking the spinner by testID: an ActivityIndicator has no text or
//   label to find it by, so the screen gives it testID="ai-suggestions-
//   loading" (invisible to users) and the test looks it up with
//   queryByTestId. render/fireEvent are async in RNTL v14, so they're awaited.
//
// Residents and suggestions here are fictional.

import { fireEvent, render, screen } from '@testing-library/react-native';
import AISuggestionsScreen from '../components/AISuggestionsScreen';
import { callable, docSnap, firestore } from './mocks/firebase';

jest.mock('../contexts/ResidentLockContext', () => ({
  useResidentLock: () => ({ locked: false, requestPin: jest.fn() }),
}));

const props = {
  navigation: { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true },
  route: { params: { residentId: 'resident-1' } },
  kind: 'conversation',
  title: 'Conversation Starters',
  description: 'Ideas for you to adapt.',
};

/** A Cloud Function response holding a brief with the given ideas. */
function briefResponse(ideas, tips = []) {
  return { data: { brief: { ideas, tips }, promptVersion: 'v2' } };
}
const idea = (title, lines) => ({ title, why: '', try: lines });

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
      'users/test-uid': { role, orgId: 'orgA' },
      'residents/resident-1/private/lifeStory': lifeStory,
      'residents/resident-1/private/safety': safety,
    };
    firestore.getDoc.mockImplementation(async (ref) => {
      const value = byPath[ref.path];
      if (value instanceof Error) throw value;
      return docSnap(value);
    });
  }

  it('shows the brief — ideas, why, lines and tips — when everything succeeds', async () => {
    mockReads({ lifeStory: { career: 'Farmer' } });
    callable('generateSuggestions').mockResolvedValueOnce(
      briefResponse(
        [{ title: 'Farm life', why: 'He farmed for years.', try: ['Cows or chickens?'] }],
        ['Offer two choices.']
      )
    );

    await render(<AISuggestionsScreen {...props} />);

    expect(await screen.findByText('Farm life')).toBeTruthy();
    expect(screen.getByText('He farmed for years.')).toBeTruthy();
    expect(screen.getByText('Cows or chickens?')).toBeTruthy();
    expect(screen.getByText('Offer two choices.')).toBeTruthy();
    expect(screen.queryByTestId('ai-suggestions-loading')).toBeNull();
    // The life story from Firestore is what gets sent to the function.
    expect(callable('generateSuggestions')).toHaveBeenCalledWith({
      kind: 'conversation',
      lifeStory: { career: 'Farmer' },
      topicsToAvoid: null,
    });
  });

  it('gives general suggestions when the life story is off-limits (e.g. a volunteer)', async () => {
    mockReads({
      role: 'Volunteer',
      lifeStory: Object.assign(new Error('denied'), { code: 'permission-denied' }),
    });
    callable('generateSuggestions').mockResolvedValueOnce(
      briefResponse([idea('Sing-along', ['Shall we sing?'])])
    );

    await render(<AISuggestionsScreen {...props} />);

    expect(await screen.findByText('Shall we sing?')).toBeTruthy();
    // No personal details are sent to the AI for someone who can't see them.
    expect(callable('generateSuggestions')).toHaveBeenCalledWith({
      kind: 'conversation',
      lifeStory: null,
      topicsToAvoid: null,
    });
    // Volunteers can't change safety notes, so no "Not for Ann" button…
    expect(screen.queryByLabelText('Not for Ann')).toBeNull();
    // …but they can rate suggestions.
    expect(screen.getByLabelText('Good suggestion')).toBeTruthy();
  });

  it("sends the resident's topics to avoid with the request", async () => {
    mockReads({ safety: { topicsToAvoid: 'No water activities' } });
    callable('generateSuggestions').mockResolvedValueOnce(
      briefResponse([idea('Garden', ['Lovely roses, aren\'t they?'])])
    );

    await render(<AISuggestionsScreen {...props} />);

    expect(await screen.findByText('Garden')).toBeTruthy();
    expect(callable('generateSuggestions')).toHaveBeenCalledWith(
      expect.objectContaining({ topicsToAvoid: 'No water activities' })
    );
  });

  it('lets staff mark an idea "Not for" the resident, adding it to topics to avoid', async () => {
    mockReads({ safety: { topicsToAvoid: 'No peanuts' } });
    callable('generateSuggestions').mockResolvedValueOnce(
      briefResponse([idea('Swimming', ['Fancy a swim?']), idea('Garden walk', ['Roses?'])])
    );

    await render(<AISuggestionsScreen {...props} />);
    await screen.findByText('Garden walk');
    await fireEvent.press(screen.getAllByLabelText('Not for Ann')[0]);

    expect(await screen.findByText(/added to Ann's topics to avoid/)).toBeTruthy();
    // Existing notes kept; the flagged idea's title added as a plain line.
    expect(firestore.setDoc.mock.calls[0][0].path).toBe('residents/resident-1/private/safety');
    expect(firestore.setDoc.mock.calls[0][1].topicsToAvoid).toBe(
      'No peanuts\nNot a good fit (from AI suggestions): Swimming'
    );
  });

  it('saves a good/bad rating on one line, with the prompt version', async () => {
    mockReads();
    callable('generateSuggestions').mockResolvedValueOnce(
      briefResponse([idea('Music', ['Hum along?', 'Big band or jazz?'])])
    );

    await render(<AISuggestionsScreen {...props} />);
    await screen.findByText('Big band or jazz?');
    await fireEvent.press(screen.getAllByLabelText('Not a good suggestion')[1]);

    expect(firestore.addDoc).toHaveBeenCalledTimes(1);
    const [ref, data] = firestore.addDoc.mock.calls[0];
    expect(ref.path).toBe('suggestionFeedback');
    expect(data).toEqual(
      expect.objectContaining({
        facilityId: 'orgA',
        kind: 'conversation',
        promptVersion: 'v2',
        itemText: 'Big band or jazz?',
        rating: 'bad',
        userRole: 'Caregiver',
      })
    );
    // Rated once: that line now shows only its rating.
    expect(await screen.findByLabelText('Rated not good')).toBeTruthy();
    expect(screen.getAllByLabelText('Not a good suggestion')).toHaveLength(1);
  });

  it('tells the rater when a rating could not be saved, and lets them retry', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockReads();
    callable('generateSuggestions').mockResolvedValueOnce(
      briefResponse([idea('Music', ['Hum along?'])])
    );
    firestore.addDoc.mockRejectedValueOnce(new Error('offline'));

    await render(<AISuggestionsScreen {...props} />);
    await screen.findByText('Hum along?');
    await fireEvent.press(screen.getByLabelText('Good suggestion'));

    expect(await screen.findByText(/Could not save your rating/)).toBeTruthy();
    expect(screen.getByLabelText('Good suggestion')).toBeTruthy();
    spy.mockRestore();
  });

  it('never offers "Not for" in Resident Mode, but staff can still rate', async () => {
    mockReads();
    callable('generateSuggestions').mockResolvedValueOnce(
      briefResponse([idea('Pets', ['Dogs or cats?'])])
    );

    await render(
      <AISuggestionsScreen
        {...props}
        route={{ params: { residentId: 'resident-1', fromResidentMode: true } }}
      />
    );

    expect(await screen.findByText('Dogs or cats?')).toBeTruthy();
    expect(screen.queryByLabelText('Not for Ann')).toBeNull();
    expect(screen.getByLabelText('Good suggestion')).toBeTruthy();
  });

  it('offers no ratings to family caregivers', async () => {
    mockReads({ role: 'Family Caregiver' });
    callable('generateSuggestions').mockResolvedValueOnce(
      briefResponse([idea('Pets', ['Dogs or cats?'])])
    );

    await render(<AISuggestionsScreen {...props} />);

    expect(await screen.findByText('Dogs or cats?')).toBeTruthy();
    expect(screen.queryByLabelText('Good suggestion')).toBeNull();
  });
});
