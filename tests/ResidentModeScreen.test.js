// Resident Mode's resident picker: a Volunteer sees every resident in their
// facility (they're never on assignedCaregivers), without an options menu on
// residents they can't edit; a Family Caregiver also sees residents linked by
// a family code; other roles keep seeing only their own list.
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
  it('shows a volunteer every resident in their facility, with options only on their own', async () => {
    setUp({
      user: { role: 'Volunteer', orgId: 'orgA' },
      byField: {
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
    expect(screen.getByLabelText('Options for Walter')).toBeTruthy();
    expect(firestore.where).toHaveBeenCalledWith('facilityId', '==', 'orgA');
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
