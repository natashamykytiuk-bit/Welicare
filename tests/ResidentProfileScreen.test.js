// Caregiver Mode's Resident Profile: profile details with edit buttons, the
// engagement time per activity and its period filter, and the states for
// no resident / no organization / a failed activity load.
import { fireEvent, render, screen } from '@testing-library/react-native';
import ResidentProfileScreen from '../screens/ResidentProfileScreen';
import { docSnap, firestore } from './mocks/firebase';

// useFocusEffect needs a navigator; running the callback once on mount is
// enough here, like a first focus.
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return { useFocusEffect: (cb) => useEffect(cb, [cb]) };
});

// The Family access card (shown to staff for a facility resident) loads its
// own list through a Cloud Function and has its own tests; left out here so
// these tests are only about the profile screen.
jest.mock('../components/FamilyAccessCard', () => () => null);

const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };
const route = { params: { residentId: 'r1' } };

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const SESSIONS = [
  { activityId: 'molehunt', durationSeconds: 1500, roundsCompleted: 3, startedAt: daysAgo(2) },
  { activityId: 'memoryMatch', durationSeconds: 600, roundsCompleted: 2, startedAt: daysAgo(5) },
  { activityId: 'wordGames', durationSeconds: 3600, roundsCompleted: 5, startedAt: daysAgo(90) },
];

// getDoc answers by path: the user, the resident and the life story. The
// resident lives in orgA unless a test passes other `residentExtra` fields;
// organization docs come back missing, which is all a facility needs here.
function setUp({
  user = { orgId: 'orgA', role: 'Caregiver' },
  sessions = SESSIONS,
  residentExtra = { facilityId: 'orgA' },
} = {}) {
  firestore.getDoc.mockImplementation(async (ref) => {
    if (ref.path === 'users/test-uid') return docSnap(user);
    if (ref.path === 'residents/r1')
      return docSnap({
        name: 'Margaret',
        preferredName: 'Peggy',
        hasLifeStory: true,
        ...residentExtra,
      });
    if (ref.path === 'residents/r1/private/lifeStory')
      return docSnap({ grewUpIn: 'Lethbridge', hobbies: ['Gardening', 'Baking'], career: '' });
    return docSnap(undefined);
  });
  firestore.getDocs.mockResolvedValue({ docs: sessions.map((s) => ({ data: () => s })) });
}

beforeEach(() => navigation.navigate.mockClear());

describe('ResidentProfileScreen', () => {
  it('shows the profile with its filled-in answers and edit buttons', async () => {
    setUp();
    await render(<ResidentProfileScreen navigation={navigation} route={route} />);
    expect(await screen.findByText('Margaret')).toBeTruthy();
    expect(screen.getByText('Likes to be called Peggy')).toBeTruthy();
    expect(screen.getByText('Lethbridge')).toBeTruthy();
    expect(screen.getByText('Gardening, Baking')).toBeTruthy();
    // Blank answers are left out.
    expect(screen.queryByText('Work')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Edit life story'));
    expect(navigation.navigate).toHaveBeenCalledWith('BuildProfile', {
      residentId: 'r1',
      returnTo: 'ResidentProfile',
    });
    await fireEvent.press(screen.getByLabelText('Safety notes'));
    expect(navigation.navigate).toHaveBeenCalledWith('ResidentSafety', {
      residentId: 'r1',
      viewOnly: false,
    });
  });

  it('lists people one per line, flagging anyone not OK to talk about', async () => {
    setUp();
    firestore.getDoc.mockImplementation(async (ref) => {
      if (ref.path === 'users/test-uid') return docSnap({ orgId: 'orgA', role: 'Caregiver' });
      if (ref.path === 'residents/r1') return docSnap({ name: 'Margaret', hasLifeStory: true });
      if (ref.path === 'residents/r1/private/lifeStory')
        return docSnap({
          hasChildren: true,
          childrenDetails: 'Two daughters', // older free-text answer, no list yet
          importantPeopleList: [
            { name: 'June', notes: 'sister', okToTalkAbout: true },
            { name: 'Walter', notes: '', okToTalkAbout: false },
          ],
        });
      return docSnap(undefined);
    });
    await render(<ResidentProfileScreen navigation={navigation} route={route} />);
    expect(await screen.findByText('June (sister)\nWalter — avoid talking about')).toBeTruthy();
    expect(screen.getByText('Two daughters')).toBeTruthy();
  });

  it('is view-only for volunteers: no Edit life story, safety notes still open', async () => {
    setUp({ user: { orgId: 'orgA', role: 'Volunteer' } });
    await render(<ResidentProfileScreen navigation={navigation} route={route} />);
    expect(await screen.findByText('Margaret')).toBeTruthy();
    expect(screen.queryByLabelText('Edit life story')).toBeNull();
    expect(screen.queryByLabelText('Add photos')).toBeNull();
    expect(screen.getByLabelText('Safety notes')).toBeTruthy();
  });

  // A Caregiver account can switch into Volunteer Mode; there the profile
  // must be view-only too, whatever the account's role allows.
  it('is view-only for a caregiver account in Volunteer Mode', async () => {
    setUp();
    await render(
      <ResidentProfileScreen
        navigation={navigation}
        route={{ params: { residentId: 'r1', viewOnly: true } }}
      />
    );
    expect(await screen.findByText('Margaret')).toBeTruthy();
    expect(screen.queryByLabelText('Edit life story')).toBeNull();
    expect(screen.queryByLabelText('Archive resident')).toBeNull();
    expect(screen.queryByLabelText('Add photos')).toBeNull();
    expect(screen.queryByLabelText('Manage photos')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Safety notes'));
    expect(navigation.navigate).toHaveBeenCalledWith('ResidentSafety', {
      residentId: 'r1',
      viewOnly: true,
    });
  });

  // A family member linked to a resident in a care home: they can share
  // photos, but the facility's staff keep the profile.
  it('is view-only for family once the resident lives in a facility', async () => {
    setUp({
      user: { orgId: 'famOrg', role: 'Family Caregiver' },
      residentExtra: { facilityId: 'orgA', familyMembers: ['test-uid'] },
    });
    await render(<ResidentProfileScreen navigation={navigation} route={route} />);
    expect(await screen.findByText('Margaret')).toBeTruthy();
    expect(screen.queryByLabelText('Edit life story')).toBeNull();
    expect(screen.queryByLabelText('Archive resident')).toBeNull();
    expect(screen.getByLabelText('Add photos')).toBeTruthy();
  });

  it('lets staff archive a resident', async () => {
    setUp();
    await render(<ResidentProfileScreen navigation={navigation} route={route} />);
    await fireEvent.press(await screen.findByLabelText('Archive resident'));
    expect(firestore.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'residents/r1' }),
      expect.objectContaining({ archived: true })
    );
  });

  it('shows Restore, not Archive, on an archived resident', async () => {
    setUp({ residentExtra: { facilityId: 'orgA', archived: true } });
    await render(<ResidentProfileScreen navigation={navigation} route={route} />);
    expect(await screen.findByLabelText('Restore resident')).toBeTruthy();
    expect(screen.queryByLabelText('Archive resident')).toBeNull();
  });

  it('queries only this facility and resident', async () => {
    setUp();
    await render(<ResidentProfileScreen navigation={navigation} route={route} />);
    await screen.findByText('Margaret');
    expect(firestore.where).toHaveBeenCalledWith('facilityId', '==', 'orgA');
    expect(firestore.where).toHaveBeenCalledWith('residentId', '==', 'r1');
  });

  it('shows time per activity for the chosen period', async () => {
    setUp();
    await render(<ResidentProfileScreen navigation={navigation} route={route} />);
    await screen.findByText('Margaret');

    // Default: last 30 days — Molehunt 25 min + Memory Match 10 min.
    expect(screen.getByLabelText('Total 35 min')).toBeTruthy();
    expect(screen.getByLabelText('Molehunt: 25 min over 1 visit')).toBeTruthy();
    expect(screen.queryByText('Finish the Phrase')).toBeNull();

    await fireEvent.press(screen.getByLabelText('All time'));
    expect(screen.getByLabelText('Total 1 h 35 min')).toBeTruthy();
    expect(screen.getByText('Finish the Phrase')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Last 7 days'));
    expect(screen.getByLabelText('Total 35 min')).toBeTruthy();
  });

  it('says so when nothing was recorded in the period', async () => {
    setUp({ sessions: [] });
    await render(<ResidentProfileScreen navigation={navigation} route={route} />);
    expect(await screen.findByText('No activity recorded in this period.')).toBeTruthy();
  });

  it('explains engagement needs an organization', async () => {
    setUp({ user: { role: 'Caregiver' }, residentExtra: {} });
    await render(<ResidentProfileScreen navigation={navigation} route={route} />);
    expect(await screen.findByText(/Join or create one to see it here/)).toBeTruthy();
    expect(firestore.getDocs).not.toHaveBeenCalled();
  });

  it('keeps the profile when activity time fails to load', async () => {
    setUp();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    firestore.getDocs.mockRejectedValue(new Error('offline'));
    await render(<ResidentProfileScreen navigation={navigation} route={route} />);
    expect(
      await screen.findByText('Could not load activity time. Please try again later.')
    ).toBeTruthy();
    expect(screen.getByText('Lethbridge')).toBeTruthy();
    console.error.mockRestore();
  });

  it('points to My Residents when opened without a resident', async () => {
    await render(<ResidentProfileScreen navigation={navigation} route={{}} />);
    await fireEvent.press(screen.getByLabelText('Go to My Residents'));
    expect(navigation.navigate).toHaveBeenCalledWith('CaregiverResidents');
  });
});
