// BuildProfileScreen's text fields carry the same length limits as
// firestore.rules (validLifeStory / validResidentFields), with a character
// counter so a caregiver can see why typing stops instead of the save
// failing afterwards.

import { fireEvent, render, screen } from '@testing-library/react-native';
import BuildProfileScreen from '../screens/BuildProfileScreen';
import { docSnap, firestore } from './mocks/firebase';

const navigation = { navigate: jest.fn(), goBack: jest.fn() };
const route = { params: { residentId: 'r1' } };

// Resident doc, then an empty private/lifeStory doc (a new profile).
async function renderForm() {
  firestore.getDoc
    .mockResolvedValueOnce(docSnap({ name: 'Ann' }))
    .mockResolvedValueOnce(docSnap(undefined));
  await render(<BuildProfileScreen navigation={navigation} route={route} />);
  return screen.findByPlaceholderText('Full name');
}

describe('BuildProfileScreen character limits', () => {
  it('shows a counter against the limit once something is typed', async () => {
    const nameInput = await renderForm();
    expect(nameInput.props.maxLength).toBe(200);
    // The name is prefilled, so its counter is already showing.
    expect(screen.getByText('3 / 200')).toBeTruthy();

    const nickname = screen.getByPlaceholderText('What do you like to be called?');
    expect(screen.queryByText('0 / 200')).toBeNull(); // empty → no counter
    await fireEvent.changeText(nickname, 'Annie');
    expect(screen.getByText('5 / 200')).toBeTruthy();
  });

  it('caps longer answers at 2000 characters', async () => {
    await renderForm();
    const memory = screen.getByPlaceholderText('A moment that makes you smile...');
    expect(memory.props.maxLength).toBe(2000);
    await fireEvent.changeText(memory, 'x'.repeat(2000));
    // At the limit the counter is shown (in the warning colour).
    expect(screen.getByText('2000 / 2000')).toBeTruthy();
  });
});
