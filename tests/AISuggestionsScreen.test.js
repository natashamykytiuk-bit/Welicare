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

import { render, screen } from '@testing-library/react-native';
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

  it('shows the suggestions when everything succeeds', async () => {
    firestore.getDoc.mockResolvedValueOnce(docSnap({ lifeStory: { career: 'Farmer' } }));
    callable('generateSuggestions').mockResolvedValueOnce({ data: { text: '1. Visit a farm' } });

    await render(<AISuggestionsScreen {...props} />);

    expect(await screen.findByText('1. Visit a farm')).toBeTruthy();
    expect(screen.queryByTestId('ai-suggestions-loading')).toBeNull();
    // The life story from Firestore is what gets sent to the function.
    expect(callable('generateSuggestions')).toHaveBeenCalledWith({
      kind: 'activityIdeas',
      lifeStory: { career: 'Farmer' },
    });
  });
});
