// Tests for Manage Users: the owner sees members with roles and resident
// counts, removing someone needs their password first, and join requests
// can be approved or denied.

import { fireEvent, render, screen } from '@testing-library/react-native';
import ManageUsersScreen from '../screens/ManageUsersScreen';
import { authModule, callable, docSnap, firestore } from './mocks/firebase';

// The screen shows the invite-code badge at the top; not needed here.
jest.mock('../components/OrgIdBadge', () => () => null);

const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };

function signedInAsOwner() {
  firestore.getDoc
    .mockResolvedValueOnce(docSnap({ role: 'Administrator', orgId: 'orgA' })) // own profile
    .mockResolvedValueOnce(docSnap({ name: 'Maple', createdBy: 'test-uid' })); // the org
  callable('listOrgMembers').mockResolvedValue({
    data: {
      members: [{ uid: 'm1', name: 'Casey Lee', role: 'Caregiver', assignedResidents: 3 }],
    },
  });
}

describe('ManageUsersScreen', () => {
  it('lists members with their role and resident count', async () => {
    signedInAsOwner();
    await render(<ManageUsersScreen navigation={navigation} />);

    expect(await screen.findByText('Casey Lee')).toBeTruthy();
    expect(screen.getByText('Caregiver · 3 residents')).toBeTruthy();
  });

  it('asks for the password, then removes the member', async () => {
    signedInAsOwner();
    authModule.reauthenticateWithCredential.mockResolvedValueOnce(undefined);
    callable('removeOrgMember').mockResolvedValueOnce({ data: { ok: true } });
    await render(<ManageUsersScreen navigation={navigation} />);

    await fireEvent.press(await screen.findByLabelText('Remove Casey Lee'));
    // Nothing is removed until the password is entered and confirmed.
    expect(callable('removeOrgMember')).not.toHaveBeenCalled();

    // After removing, the screen reloads the list.
    firestore.getDoc
      .mockResolvedValueOnce(docSnap({ role: 'Administrator', orgId: 'orgA' }))
      .mockResolvedValueOnce(docSnap({ name: 'Maple', createdBy: 'test-uid' }));
    await fireEvent.changeText(screen.getByLabelText('Your password'), 'secret');
    await fireEvent.press(screen.getByLabelText('Confirm removing Casey Lee'));

    expect(authModule.reauthenticateWithCredential).toHaveBeenCalled();
    expect(callable('removeOrgMember')).toHaveBeenCalledWith({ orgId: 'orgA', memberUid: 'm1' });
    expect(await screen.findByText('Casey Lee was removed from the organization.')).toBeTruthy();
  });

  it('approves a join request and reloads the lists', async () => {
    signedInAsOwner();
    callable('listOrgMembers').mockResolvedValueOnce({
      data: {
        members: [],
        pending: [{ uid: 'p1', name: 'Tomas B', role: 'Caregiver', requestedAt: 1 }],
      },
    });
    callable('approveOrgMember').mockResolvedValueOnce({ data: { ok: true } });
    await render(<ManageUsersScreen navigation={navigation} />);

    expect(await screen.findByText('Waiting for approval')).toBeTruthy();
    firestore.getDoc
      .mockResolvedValueOnce(docSnap({ role: 'Administrator', orgId: 'orgA' }))
      .mockResolvedValueOnce(docSnap({ name: 'Maple', createdBy: 'test-uid' }));
    await fireEvent.press(screen.getByLabelText('Approve Tomas B'));

    expect(callable('approveOrgMember')).toHaveBeenCalledWith({ orgId: 'orgA', memberUid: 'p1' });
    expect(await screen.findByText('Tomas B can now use the organization.')).toBeTruthy();
  });

  it('denies a join request', async () => {
    signedInAsOwner();
    callable('listOrgMembers').mockResolvedValueOnce({
      data: {
        members: [],
        pending: [{ uid: 'p2', name: 'Keira M', role: 'Volunteer', requestedAt: 1 }],
      },
    });
    callable('denyOrgMember').mockResolvedValueOnce({ data: { ok: true } });
    await render(<ManageUsersScreen navigation={navigation} />);

    firestore.getDoc
      .mockResolvedValueOnce(docSnap({ role: 'Administrator', orgId: 'orgA' }))
      .mockResolvedValueOnce(docSnap({ name: 'Maple', createdBy: 'test-uid' }));
    await fireEvent.press(await screen.findByLabelText('Deny Keira M'));

    expect(callable('denyOrgMember')).toHaveBeenCalledWith({ orgId: 'orgA', memberUid: 'p2' });
    expect(await screen.findByText('Keira M’s request was declined.')).toBeTruthy();
  });

  it('explains when you are not the organization owner', async () => {
    firestore.getDoc
      .mockResolvedValueOnce(docSnap({ role: 'Administrator', orgId: 'orgA' }))
      .mockResolvedValueOnce(docSnap({ name: 'Maple', createdBy: 'someone-else' }));
    await render(<ManageUsersScreen navigation={navigation} />);

    expect(await screen.findByText(/Only the administrator who owns/)).toBeTruthy();
    expect(callable('listOrgMembers')).not.toHaveBeenCalled();
  });
});
