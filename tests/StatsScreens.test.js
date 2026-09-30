// Smoke tests for the stats screens: Overall Stats (Caregiver Mode), Hour
// Tracker (Volunteer Mode) and Activity (Family Mode) load the right data
// and show it. The numbers themselves are covered in engagementStats.test.js.

import { render, screen } from '@testing-library/react-native';
import FamilyStatsScreen from '../screens/FamilyStatsScreen';
import HourTrackerScreen from '../screens/HourTrackerScreen';
import OverallStatsScreen from '../screens/OverallStatsScreen';
import { docSnap, firestore } from './mocks/firebase';

// useFocusEffect needs a navigator; run it like a plain effect instead.
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return { useFocusEffect: (fn) => useEffect(fn, [fn]) };
});

const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };
const recently = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

/** getDocs result shaped like Firestore's. */
const docsOf = (items) => ({
  docs: items.map(({ id, ...data }) => ({ id, data: () => data })),
});

describe('OverallStatsScreen', () => {
  it("shows the facility's totals and lists residents without visits too", async () => {
    firestore.getDoc.mockResolvedValueOnce(docSnap({ role: 'Caregiver', orgId: 'orgA' }));
    firestore.getDocs
      .mockResolvedValueOnce(
        docsOf([
          {
            id: 's1',
            activityId: 'music',
            durationSeconds: 1800,
            residentId: 'r1',
            startedAt: recently,
          },
        ])
      )
      .mockResolvedValueOnce(
        docsOf([
          { id: 'r1', name: 'Ann' },
          { id: 'r2', name: 'Bob' },
        ])
      );
    await render(<OverallStatsScreen navigation={navigation} />);

    expect(await screen.findByLabelText('Total time: 30 min')).toBeTruthy();
    expect(screen.getByLabelText('Residents taking part: 1 of 2')).toBeTruthy();
    expect(screen.getByText('No visits in this period')).toBeTruthy();
  });

  it('explains when there is no organization', async () => {
    firestore.getDoc.mockResolvedValueOnce(docSnap({ role: 'Caregiver' }));
    await render(<OverallStatsScreen navigation={navigation} />);
    expect(await screen.findByText(/Stats are recorded for organizations/)).toBeTruthy();
  });
});

describe('HourTrackerScreen', () => {
  it("shows the volunteer's own time and recent visits", async () => {
    firestore.getDoc.mockResolvedValueOnce(docSnap({ role: 'Volunteer', orgId: 'orgA' }));
    firestore.getDocs
      .mockResolvedValueOnce(
        docsOf([
          {
            id: 's1',
            activityId: 'trivia',
            durationSeconds: 3600,
            residentId: 'r1',
            startedAt: recently,
          },
        ])
      )
      .mockResolvedValueOnce(docsOf([{ id: 'r1', name: 'Ann' }]));
    await render(<HourTrackerScreen navigation={navigation} />);

    expect(await screen.findByLabelText('Time volunteered: 1 h')).toBeTruthy();
    expect(screen.getByText('Trivia')).toBeTruthy();
    expect(screen.getByText(/^Ann · /)).toBeTruthy();
  });
});

describe('FamilyStatsScreen', () => {
  it("shows each linked resident's activity time", async () => {
    firestore.getDocs
      .mockResolvedValueOnce(docsOf([])) // created by
      .mockResolvedValueOnce(docsOf([])) // assigned
      .mockResolvedValueOnce(docsOf([{ id: 'r1', name: 'Margaret', facilityId: 'orgA' }]))
      .mockResolvedValueOnce(
        docsOf([
          {
            id: 's1',
            activityId: 'photoAlbum',
            durationSeconds: 900,
            residentId: 'r1',
            startedAt: recently,
          },
        ])
      );
    await render(<FamilyStatsScreen navigation={navigation} />);

    expect(await screen.findByText('Margaret')).toBeTruthy();
    expect(screen.getByText('15 min in activities')).toBeTruthy();
    expect(screen.getByText('Photo Album')).toBeTruthy();
  });
});
