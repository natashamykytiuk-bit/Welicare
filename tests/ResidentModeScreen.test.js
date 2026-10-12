// Resident Mode's resident picker: a Volunteer sees every resident in their
// facility (they're never on assignedCaregivers) but gets no options menu
// and no Add Resident; staff get both; a Family Caregiver also sees
// residents linked by a family code, with options only on their own
// at-home residents. Archived residents are left out.
import { fireEvent, render, screen } from '@testing-library/react-native';
import ResidentModeScreen from '../screens/ResidentModeScreen';
import { docSnap, firestore } from './mocks/firebase';

// useFocusEffect needs a navigator; running the callback once on mount is
// enough here, like a first focus.
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return { useFocusEffect: (cb) => useEffect(cb, [cb]) };
});

const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };

const residentDoc = (id, data) => ({ id, data: () => data });

// getDocs answers by the query's where() field, so each of the screen's
// queries (createdBy / assignedCaregivers / facilityId / familyMembers) gets its own result.
function setUp({ user, byField }) {
  firestore.getDoc.mockImplementation(async (ref) =>
    ref.path === 'users/test-uid' ? docSnap(user) : docSnap(undefined)
  );
  firestore.where.mockImplementation((field) => ({ field }));
  firestore.query.mockImplementation((ref, clause) => ({ path: ref.path, field: clause.field }));
  firestore.getDocs.mockImplementation(async (q) => ({ docs: byField[q.field] ?? [] }));
}

describe('ResidentModeScreen', () => {
  it('shows a volunteer every resident in their facility, with no options and no Add Resident', async () => {
    setUp({
      user: { role: 'Volunteer', orgId: 'orgA' },
      byField: {
        // One they created back when the rules allowed it: still no options.
        createdBy: [residentDoc('mine', { name: 'Walter', createdBy: 'test-uid' })],
        facilityId: [
          residentDoc('r1', { name: 'Margaret', createdBy: 'staff-1', facilityId: 'orgA' }),
          residentDoc('mine', { name: 'Walter', createdBy: 'test-uid', facilityId: 'orgA' }),
        ],
      },
    });
    await render(<ResidentModeScreen navigation={navigation} />);
    expect(await screen.findByText('Margaret')).toBeTruthy();
    // Listed once even though two queries returned it.
    expect(screen.getAllByText('Walter')).toHaveLength(1);
    expect(screen.queryByLabelText('Options for Margaret')).toBeNull();
    expect(screen.queryByLabelText('Options for Walter')).toBeNull();
    expect(screen.queryByLabelText('Add Resident')).toBeNull();
    expect(screen.getByLabelText('Guest Mode')).toBeTruthy();
    expect(firestore.where).toHaveBeenCalledWith('facilityId', '==', 'orgA');
  });

  it('gives a caregiver Add Resident, Edit and Archive — but not Delete', async () => {
    setUp({
      user: { role: 'Caregiver', orgId: 'orgA' },
      byField: {
        facilityId: [residentDoc('r1', { name: 'Margaret', facilityId: 'orgA' })],
      },
    });
    await render(<ResidentModeScreen navigation={navigation} />);
    await fireEvent.press(await screen.findByLabelText('Options for Margaret'));
    expect(screen.getByLabelText('Edit Profile')).toBeTruthy();
    expect(screen.getByLabelText('Archive Resident')).toBeTruthy();
    expect(screen.queryByLabelText('Delete Permanently')).toBeNull();
    expect(screen.getByLabelText('Add Resident')).toBeTruthy();
  });

  it('archives from the menu without deleting, and says so', async () => {
    setUp({
      user: { role: 'Caregiver', orgId: 'orgA' },
      byField: {
        facilityId: [residentDoc('r1', { name: 'Margaret', facilityId: 'orgA' })],
      },
    });
    await render(<ResidentModeScreen navigation={navigation} />);
    await fireEvent.press(await screen.findByLabelText('Options for Margaret'));
    await fireEvent.press(screen.getByLabelText('Archive Resident'));
    expect(firestore.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'residents/r1' }),
      expect.objectContaining({ archived: true })
    );
    expect(await screen.findByText(/Margaret was archived. Nothing was deleted/)).toBeTruthy();
    expect(screen.queryByLabelText('Options for Margaret')).toBeNull();
  });

  it('warns an administrator that deleting is permanent before anything happens', async () => {
    setUp({
      user: { role: 'Administrator', orgId: 'orgA' },
      byField: {
        facilityId: [residentDoc('r1', { name: 'Margaret', facilityId: 'orgA' })],
      },
    });
    await render(<ResidentModeScreen navigation={navigation} />);
    await fireEvent.press(await screen.findByLabelText('Options for Margaret'));
    await fireEvent.press(screen.getByLabelText('Delete Permanently'));
    expect(screen.getByText('Delete Margaret permanently?')).toBeTruthy();
    expect(screen.getByText(/It cannot be undone/)).toBeTruthy();
    // Nothing is removed from the app itself — deleting is the server's job.
    expect(firestore.deleteDoc).not.toHaveBeenCalled();
  });

  it('leaves archived residents out of the picker', async () => {
    setUp({
      user: { role: 'Caregiver', orgId: 'orgA' },
      byField: {
        facilityId: [
          residentDoc('r1', { name: 'Margaret', facilityId: 'orgA' }),
          residentDoc('r2', { name: 'Harold', facilityId: 'orgA', archived: true }),
        ],
      },
    });
    await render(<ResidentModeScreen navigation={navigation} />);
    expect(await screen.findByText('Margaret')).toBeTruthy();
    expect(screen.queryByText('Harold')).toBeNull();
  });

  it('gives a Family Caregiver options on their at-home resident only', async () => {
    setUp({
      user: { role: 'Family Caregiver' },
      byField: {
        createdBy: [residentDoc('home', { name: 'Dad', createdBy: 'test-uid', facilityId: null })],
        familyMembers: [
          residentDoc('r3', { name: 'Arthur', createdBy: 'staff-1', facilityId: 'orgA' }),
        ],
      },
    });
    await render(<ResidentModeScreen navigation={navigation} />);
    expect(await screen.findByLabelText('Options for Dad')).toBeTruthy();
    expect(screen.queryByLabelText('Options for Arthur')).toBeNull();
    expect(screen.getByLabelText('Add Resident')).toBeTruthy();
  });

  it('shows a Family Caregiver their family-code residents, never the whole facility', async () => {
    setUp({
      user: { role: 'Family Caregiver', orgId: 'orgA' },
      byField: {
        assignedCaregivers: [residentDoc('r2', { name: 'Doris', createdBy: 'staff-1' })],
        familyMembers: [residentDoc('r3', { name: 'Arthur', createdBy: 'staff-1' })],
        facilityId: [residentDoc('r1', { name: 'Margaret', facilityId: 'orgA' })],
      },
    });
    await render(<ResidentModeScreen navigation={navigation} />);
    expect(await screen.findByText('Doris')).toBeTruthy();
    expect(screen.getByText('Arthur')).toBeTruthy();
    expect(screen.queryByText('Margaret')).toBeNull();
    expect(firestore.where).not.toHaveBeenCalledWith('facilityId', '==', 'orgA');
  });

  it('goes straight to the home screen from the back arrow, with no PIN', async () => {
    setUp({ user: { role: 'Caregiver', orgId: 'orgA' }, byField: {} });
    await render(<ResidentModeScreen navigation={navigation} />);
    await fireEvent.press(await screen.findByLabelText('Go back'));
    expect(navigation.navigate).toHaveBeenCalledWith('ModeSelection', {
      animation: 'slide_from_left',
    });
    expect(navigation.navigate).not.toHaveBeenCalledWith('PINEntry', expect.anything());
  });

  it('says Guest Mode time is not recorded when the user has no organization', async () => {
    setUp({ user: { role: 'Family Caregiver' }, byField: {} });
    await render(<ResidentModeScreen navigation={navigation} />);
    expect(
      await screen.findByText(/Time isn’t recorded until you join an organization/)
    ).toBeTruthy();
  });

  it('does not run the facility query for a volunteer with no organization', async () => {
    setUp({ user: { role: 'Volunteer' }, byField: {} });
    await render(<ResidentModeScreen navigation={navigation} />);
    expect(await screen.findByText('Guest Mode')).toBeTruthy();
    expect(firestore.where).not.toHaveBeenCalledWith('facilityId', '==', expect.anything());
  });
});
