// Family Mode's My Residents: lists residents linked by a family code
// alongside created/assigned ones, and redeems a code typed into the box.
import { fireEvent, render, screen } from '@testing-library/react-native';
import FamilyResidentsScreen from '../screens/FamilyResidentsScreen';
import { callable, firestore } from './mocks/firebase';

// useFocusEffect needs a navigator; running the callback once on mount is
// enough here, like a first focus.
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return { useFocusEffect: (cb) => useEffect(cb, [cb]) };
});

const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };
const residentDoc = (id, data) => ({ id, data: () => data });

// getDocs answers by the query's where() field (createdBy /
// assignedCaregivers / familyMembers); `linked` is what familyMembers returns.
let linked;
function setUp(initial = []) {
  linked = initial;
  firestore.where.mockImplementation((field) => ({ field }));
  firestore.query.mockImplementation((ref, clause) => ({ path: ref.path, field: clause.field }));
  firestore.getDocs.mockImplementation(async (q) => ({
    docs: q.field === 'familyMembers' ? linked : [],
  }));
}

describe('FamilyResidentsScreen', () => {
  it('lists residents linked by a family code', async () => {
    setUp([residentDoc('r1', { name: 'Margaret' })]);
    await render(<FamilyResidentsScreen navigation={navigation} />);
    expect(await screen.findByText('Margaret')).toBeTruthy();
    expect(firestore.where).toHaveBeenCalledWith('familyMembers', 'array-contains', 'test-uid');
  });

  it('redeems a family code and shows the newly linked resident', async () => {
    setUp();
    callable('redeemFamilyCode').mockImplementation(async () => {
      linked = [residentDoc('r1', { name: 'Margaret' })];
      return { data: { residentId: 'r1', residentName: 'Margaret' } };
    });
    await render(<FamilyResidentsScreen navigation={navigation} />);
    // Typed without the dash; the box formats it.
    await fireEvent.changeText(await screen.findByLabelText('Family code'), 'abcd2345');
    expect(screen.getByDisplayValue('ABCD-2345')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Link resident'));
    expect(callable('redeemFamilyCode')).toHaveBeenCalledWith({ code: 'ABCD-2345' });
    expect(await screen.findByText("You're now linked to Margaret.")).toBeTruthy();
    expect(screen.getByText('Margaret')).toBeTruthy();
  });

  it("shows the server's message when a code doesn't work", async () => {
    setUp();
    callable('redeemFamilyCode').mockRejectedValueOnce(new Error("That family code didn't work."));
    await render(<FamilyResidentsScreen navigation={navigation} />);
    await fireEvent.changeText(await screen.findByLabelText('Family code'), 'ABCD2345');
    await fireEvent.press(screen.getByLabelText('Link resident'));
    expect(await screen.findByText("That family code didn't work.")).toBeTruthy();
  });
});
