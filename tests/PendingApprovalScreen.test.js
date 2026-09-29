// Tests for the "waiting for approval" screen shown after asking to join an
// organization: it moves on once approved, explains a declined request,
// and can cancel the request.

import { fireEvent, render, screen } from '@testing-library/react-native';
import PendingApprovalScreen from '../screens/PendingApprovalScreen';
import { docSnap, firestore } from './mocks/firebase';

const navigation = { navigate: jest.fn(), reset: jest.fn(), goBack: jest.fn() };

describe('PendingApprovalScreen', () => {
  it('shows the organization it is waiting on, and says so when still waiting', async () => {
    firestore.getDoc
      .mockResolvedValueOnce(docSnap({ role: 'Caregiver', pendingOrgId: 'orgA' }))
      .mockResolvedValueOnce(docSnap({ name: 'Maple Grove' }));
    await render(<PendingApprovalScreen navigation={navigation} />);

    expect(await screen.findByText(/Your request to join Maple Grove has been sent/)).toBeTruthy();

    firestore.getDoc
      .mockResolvedValueOnce(docSnap({ role: 'Caregiver', pendingOrgId: 'orgA' }))
      .mockResolvedValueOnce(docSnap({ name: 'Maple Grove' }));
    await fireEvent.press(screen.getByLabelText('Check again'));
    expect(await screen.findByText(/Not approved yet/)).toBeTruthy();
  });

  it('goes on to Mode Selection once approved', async () => {
    firestore.getDoc.mockResolvedValueOnce(docSnap({ role: 'Caregiver', orgId: 'orgA' }));
    await render(<PendingApprovalScreen navigation={navigation} />);

    await screen.findByLabelText('Sign out');
    expect(navigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'ModeSelection' }],
    });
  });

  it('explains a declined request and offers another code', async () => {
    firestore.getDoc.mockResolvedValueOnce(docSnap({ role: 'Volunteer' }));
    await render(<PendingApprovalScreen navigation={navigation} />);

    expect(await screen.findByText('Your request wasn’t approved')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Try another code'));
    expect(navigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'JoinCreateOrganization' }],
    });
  });

  it('cancels the request by clearing it from the profile', async () => {
    firestore.getDoc
      .mockResolvedValueOnce(docSnap({ role: 'Caregiver', pendingOrgId: 'orgA' }))
      .mockResolvedValueOnce(docSnap({ name: 'Maple Grove' }));
    await render(<PendingApprovalScreen navigation={navigation} />);

    await fireEvent.press(await screen.findByLabelText('Cancel request'));
    expect(firestore.updateDoc).toHaveBeenCalled();
    expect(navigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'JoinCreateOrganization' }],
    });
  });
});
