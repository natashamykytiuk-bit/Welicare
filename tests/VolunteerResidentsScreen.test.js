// Volunteer Mode → My Residents: lists the facility's residents and opens a
// resident's (view-only) profile.

import { fireEvent, render, screen } from '@testing-library/react-native';
import VolunteerResidentsScreen from '../screens/VolunteerResidentsScreen';
import { docSnap, firestore } from './mocks/firebase';

// useFocusEffect needs a navigator; run it like a plain effect instead.
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return { useFocusEffect: (fn) => useEffect(fn, [fn]) };
});
// Avatars load photo URLs from Storage; not needed here.
jest.mock('../components/ResidentAvatar', () => () => null);

const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };

describe('VolunteerResidentsScreen', () => {
  it("lists the facility's residents and opens a profile", async () => {
    firestore.getDoc
      .mockResolvedValueOnce(docSnap({ role: 'Volunteer', orgId: 'orgA' }))
      .mockResolvedValueOnce(docSnap({ name: 'Maple Grove' }));
    firestore.getDocs.mockResolvedValueOnce({
      docs: [{ id: 'r1', data: () => ({ name: 'Margaret', facilityId: 'orgA' }) }],
    });
    await render(<VolunteerResidentsScreen navigation={navigation} />);

    expect(await screen.findByText('Margaret')).toBeTruthy();
    expect(screen.getByText(/Everyone at Maple Grove/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Margaret'));
    expect(navigation.navigate).toHaveBeenCalledWith('ResidentProfile', { residentId: 'r1' });
  });
});
