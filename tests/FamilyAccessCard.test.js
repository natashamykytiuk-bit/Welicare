// Resident Profile's "Family access" card: staff create a family code, see
// who's linked, and remove someone (with an inline confirmation).
import { fireEvent, render, screen } from '@testing-library/react-native';
import FamilyAccessCard from '../components/FamilyAccessCard';
import { callable } from './mocks/firebase';

function setUp(members = [{ uid: 'fam1', name: 'Susan' }]) {
  callable('listFamilyMembers').mockResolvedValue({ data: { members } });
  callable('createFamilyCode').mockResolvedValue({
    data: { code: 'ABCD-2345', expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 },
  });
  callable('unlinkFamilyMember').mockResolvedValue({ data: { ok: true } });
}

describe('FamilyAccessCard', () => {
  it('lists linked family members', async () => {
    setUp();
    await render(<FamilyAccessCard residentId="r1" />);
    expect(await screen.findByText('Susan')).toBeTruthy();
    expect(callable('listFamilyMembers')).toHaveBeenCalledWith({ residentId: 'r1' });
  });

  it('shows an empty state when nobody is linked', async () => {
    setUp([]);
    await render(<FamilyAccessCard residentId="r1" />);
    expect(await screen.findByText('No family members linked yet.')).toBeTruthy();
  });

  it('creates and shows a family code', async () => {
    setUp([]);
    await render(<FamilyAccessCard residentId="r1" />);
    await fireEvent.press(await screen.findByLabelText('Create family code'));
    expect(await screen.findByText('ABCD-2345')).toBeTruthy();
    expect(callable('createFamilyCode')).toHaveBeenCalledWith({ residentId: 'r1' });
    // A second press now offers a fresh code.
    expect(screen.getByLabelText('Make a new family code')).toBeTruthy();
  });

  it('shows the server message when a code cannot be made', async () => {
    setUp([]);
    callable('createFamilyCode').mockRejectedValueOnce(new Error('Only caregivers can do this.'));
    await render(<FamilyAccessCard residentId="r1" />);
    await fireEvent.press(await screen.findByLabelText('Create family code'));
    expect(await screen.findByText('Only caregivers can do this.')).toBeTruthy();
  });

  it('removes a family member only after confirming', async () => {
    setUp();
    await render(<FamilyAccessCard residentId="r1" />);
    await fireEvent.press(await screen.findByLabelText('Remove Susan'));
    expect(callable('unlinkFamilyMember')).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Confirm remove Susan'));
    expect(callable('unlinkFamilyMember')).toHaveBeenCalledWith({
      residentId: 'r1',
      memberUid: 'fam1',
    });
    expect(await screen.findByText('No family members linked yet.')).toBeTruthy();
  });
});
