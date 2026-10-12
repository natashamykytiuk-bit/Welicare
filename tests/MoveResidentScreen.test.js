// "Move to an organization" for a family member's at-home resident: the
// code is checked first, then a confirmation spells out what they give up,
// and only confirming sends the request. Cancel must leave everything alone.
import { fireEvent, render, screen } from '@testing-library/react-native';
import MoveResidentScreen from '../screens/MoveResidentScreen';
import { previewResidentMove, requestResidentMove } from '../utils/residentManagement';

// The two server calls are the whole point of the screen, so they're spies:
// the tests check exactly when each is (and isn't) made.
jest.mock('../utils/residentManagement', () => ({
  previewResidentMove: jest.fn(),
  requestResidentMove: jest.fn(),
}));

const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };
const route = { params: { residentId: 'r1', residentName: 'Dad' } };

beforeEach(() => {
  previewResidentMove.mockReset().mockResolvedValue({ orgName: 'Maple Court' });
  requestResidentMove.mockReset().mockResolvedValue({ orgName: 'Maple Court' });
  navigation.goBack.mockReset();
});

// Types a full code and taps Continue, landing on the confirmation.
async function reachConfirmation() {
  await render(<MoveResidentScreen navigation={navigation} route={route} />);
  await fireEvent.changeText(screen.getByLabelText('Organization code'), 'mgk74txr');
  await fireEvent.press(screen.getByLabelText('Continue'));
  return screen.findByText('Move Dad to Maple Court?');
}

describe('MoveResidentScreen', () => {
  it('checks the code first and shows the confirmation without sending anything', async () => {
    await reachConfirmation();
    // The code is tidied as typed (upper case, dash added).
    expect(previewResidentMove).toHaveBeenCalledWith('r1', 'MGK7-4TXR');
    expect(requestResidentMove).not.toHaveBeenCalled();
    // The copy says what changes: view, but not edit.
    expect(screen.getByText(/view Dad’s profile and share photos, but not edit it/)).toBeTruthy();
    expect(screen.getByLabelText('Move to Maple Court')).toBeTruthy();
  });

  it('Cancel goes back to the code and sends nothing', async () => {
    await reachConfirmation();
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(screen.getByLabelText('Organization code')).toBeTruthy();
    expect(screen.queryByText('Move Dad to Maple Court?')).toBeNull();
    expect(requestResidentMove).not.toHaveBeenCalled();
  });

  it('sends the request only after confirming, then explains it waits for approval', async () => {
    await reachConfirmation();
    await fireEvent.press(screen.getByLabelText('Move to Maple Court'));
    expect(requestResidentMove).toHaveBeenCalledWith('r1', 'MGK7-4TXR');
    expect(await screen.findByText('Request sent')).toBeTruthy();
    expect(screen.getByText(/Until their administrator approves, nothing changes/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Back to My Residents'));
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('shows the server’s message for a code that doesn’t work, and stays on the code step', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    previewResidentMove.mockRejectedValue(new Error('No organization found with that code.'));
    await render(<MoveResidentScreen navigation={navigation} route={route} />);
    await fireEvent.changeText(screen.getByLabelText('Organization code'), 'AAAA2222');
    await fireEvent.press(screen.getByLabelText('Continue'));
    expect(await screen.findByText('No organization found with that code.')).toBeTruthy();
    expect(screen.getByLabelText('Organization code')).toBeTruthy();
    expect(requestResidentMove).not.toHaveBeenCalled();
    console.error.mockRestore();
  });

  it('keeps Continue disabled until the whole code is typed', async () => {
    await render(<MoveResidentScreen navigation={navigation} route={route} />);
    await fireEvent.changeText(screen.getByLabelText('Organization code'), 'MGK7');
    await fireEvent.press(screen.getByLabelText('Continue'));
    expect(previewResidentMove).not.toHaveBeenCalled();
  });
});
