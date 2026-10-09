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

// The life story as last written by a save (saveResidentProfile's
// transaction goes through the mocked getDoc/setDoc).
function savedStory() {
  return firestore.setDoc.mock.calls.filter(([ref]) => ref.path.endsWith('lifeStory')).at(-1)[1];
}

describe('BuildProfileScreen family members', () => {
  it('saves each child as a name, details and an "OK to talk about" tick', async () => {
    await renderForm();
    // No child cards until "Do you have children?" is Yes.
    expect(screen.queryByLabelText('Name of child 1')).toBeNull();
    await fireEvent.press(screen.getAllByLabelText('Yes')[0]);

    await fireEvent.changeText(screen.getByLabelText('Name of child 1'), 'Ruth');
    await fireEvent.changeText(screen.getByLabelText('Details about child 1'), 'Visits Sundays');
    await fireEvent.press(screen.getByLabelText('Add another child'));
    await fireEvent.changeText(screen.getByLabelText('Name of child 2'), 'Clara');
    // Ticked to begin with; unticking marks someone not to bring up.
    const tick = screen.getByLabelText('OK to talk about child 2');
    expect(tick.props.accessibilityState.checked).toBe(true);
    await fireEvent.press(tick);
    // A card added but left blank isn't saved.
    await fireEvent.press(screen.getByLabelText('Add another child'));

    // Transaction reads: the resident, then the (not yet saved) life story.
    firestore.getDoc
      .mockResolvedValueOnce(docSnap({ name: 'Ann' }))
      .mockResolvedValueOnce(docSnap(undefined));
    await fireEvent.press(screen.getByLabelText('Save Profile'));
    await screen.findByText('Profile saved!');
    expect(savedStory().childrenList).toEqual([
      { name: 'Ruth', notes: 'Visits Sundays', okToTalkAbout: true },
      { name: 'Clara', notes: '', okToTalkAbout: false },
    ]);
  });

  it('carries an older free-text answer over into the list on save', async () => {
    const old = { hasChildren: true, childrenDetails: 'Two daughters', importantPeople: 'June' };
    firestore.getDoc
      .mockResolvedValueOnce(docSnap({ name: 'Ann' }))
      .mockResolvedValueOnce(docSnap(old));
    await render(<BuildProfileScreen navigation={navigation} route={route} />);
    await screen.findByPlaceholderText('Full name');
    // The old text shows as the details of one entry, ready to be split up.
    expect(screen.getByLabelText('Details about child 1').props.value).toBe('Two daughters');
    expect(screen.getByLabelText('Details about person 1').props.value).toBe('June');

    firestore.getDoc
      .mockResolvedValueOnce(docSnap({ name: 'Ann' }))
      .mockResolvedValueOnce(docSnap(old));
    await fireEvent.press(screen.getByLabelText('Save Changes'));
    await screen.findByText('Profile saved!');
    expect(savedStory()).toMatchObject({
      childrenList: [{ name: '', notes: 'Two daughters', okToTalkAbout: true }],
      childrenDetails: null,
      importantPeopleList: [{ name: '', notes: 'June', okToTalkAbout: true }],
      importantPeople: null,
    });
  });
});

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
