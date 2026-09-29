// Resident Mode's resident picker: a Volunteer sees every resident in their
// facility (they're never on assignedCaregivers), without an options menu on
// residents they can't edit; other roles keep seeing only their own list.
import { render, screen } from '@testing-library/react-native';
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
// queries (createdBy / assignedCaregivers / facilityId) gets its own result.
function setUp({ user, byField }) {
  firestore.getDoc.mockImplementation(async (ref) =>
    ref.path === 'users/test-uid' ? docSnap(user) : docSnap(undefined)
  );
  firestore.where.mockImplementation((field) => ({ field }));
  firestore.query.mockImplementation((ref, clause) => ({ path: ref.path, field: clause.field }));
  firestore.getDocs.mockImplementation(async (q) => ({ docs: byField[q.field] ?? [] }));
}

describe('ResidentModeScreen', () => {
  it("shows a volunteer every resident in their facility, with options only on their own", async () => {
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

  it('does not run the facility query for a Family Caregiver', async () => {
    setUp({
      user: { role: 'Family Caregiver', orgId: 'orgA' },
      byField: {
        assignedCaregivers: [residentDoc('r2', { name: 'Doris', createdBy: 'staff-1' })],
        facilityId: [residentDoc('r1', { name: 'Margaret', facilityId: 'orgA' })],
      },
    });
    await render(<ResidentModeScreen navigation={navigation} />);
    expect(await screen.findByText('Doris')).toBeTruthy();
    expect(screen.queryByText('Margaret')).toBeNull();
    expect(firestore.where).not.toHaveBeenCalledWith('facilityId', '==', 'orgA');
  });

  it('does not run the facility query for a volunteer with no organization', async () => {
    setUp({ user: { role: 'Volunteer' }, byField: {} });
    await render(<ResidentModeScreen navigation={navigation} />);
    expect(await screen.findByText('Guest Mode')).toBeTruthy();
    expect(firestore.where).not.toHaveBeenCalledWith('facilityId', '==', expect.anything());
  });
});
