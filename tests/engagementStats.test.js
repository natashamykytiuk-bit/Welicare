// Resident engagement totals (utils/engagementStats.js): per-activity time,
// period filtering, and how durations are worded.
import {
  formatDuration,
  summarizeFacility,
  summarizeSessions,
  summarizeVolunteer,
  weekStart,
} from '../utils/engagementStats';

const NOW = new Date('2026-09-29T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
// Firestore returns Timestamps; the summary must accept those too.
const ts = (date) => ({ toDate: () => date });

const SESSIONS = [
  { activityId: 'molehunt', durationSeconds: 600, roundsCompleted: 2, startedAt: daysAgo(1) },
  { activityId: 'molehunt', durationSeconds: 300, roundsCompleted: 1, startedAt: ts(daysAgo(3)) },
  { activityId: 'memoryMatch', durationSeconds: 1200, roundsCompleted: 4, startedAt: daysAgo(10) },
  { activityId: 'wordGames', durationSeconds: 7200, roundsCompleted: 9, startedAt: daysAgo(60) },
];

describe('summarizeSessions', () => {
  it('totals every session for all time, most time first', () => {
    const { totalSeconds, activities } = summarizeSessions(SESSIONS, { days: null, now: NOW });
    expect(totalSeconds).toBe(9300);
    expect(activities.map((a) => a.label)).toEqual([
      'Finish the Phrase',
      'Memory Match',
      'Molehunt',
    ]);
    expect(activities[2]).toMatchObject({ seconds: 900, sessions: 2, roundsCompleted: 3 });
    expect(activities[2].lastPlayedAt).toEqual(daysAgo(1));
  });

  it('keeps only sessions inside the period', () => {
    const week = summarizeSessions(SESSIONS, { days: 7, now: NOW });
    expect(week.totalSeconds).toBe(900);
    expect(week.activities.map((a) => a.activityId)).toEqual(['molehunt']);
    expect(summarizeSessions(SESSIONS, { days: 30, now: NOW }).totalSeconds).toBe(2100);
  });

  it('handles no sessions, and unknown activities by id', () => {
    expect(summarizeSessions([], { days: 7, now: NOW })).toEqual({
      totalSeconds: 0,
      activities: [],
    });
    const { activities } = summarizeSessions(
      [{ activityId: 'bingo', durationSeconds: 60, startedAt: NOW }],
      { days: null, now: NOW }
    );
    expect(activities[0]).toMatchObject({ label: 'bingo', roundsCompleted: 0 });
  });
});

describe('formatDuration', () => {
  it('words durations for staff', () => {
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(30)).toBe('Under 1 min');
    expect(formatDuration(45 * 60)).toBe('45 min');
    expect(formatDuration(2 * 3600)).toBe('2 h');
    expect(formatDuration(2 * 3600 + 15 * 60 + 40)).toBe('2 h 15 min');
  });
});

describe('summarizeFacility', () => {
  const residents = [
    { id: 'a', name: 'Ann' },
    { id: 'b', name: 'Bob', preferredName: 'Bobby' },
    { id: 'c', name: 'Cy' },
  ];
  const sessions = [
    { activityId: 'music', durationSeconds: 600, residentId: 'a', startedAt: daysAgo(1) },
    { activityId: 'molehunt', durationSeconds: 300, residentId: 'b', startedAt: daysAgo(2) },
    { activityId: 'music', durationSeconds: 120, residentId: 'a', startedAt: daysAgo(40) },
    // Guest Mode, and a removed resident: in the totals, not in the list.
    {
      activityId: 'music',
      durationSeconds: 60,
      residentId: null,
      isGuest: true,
      startedAt: daysAgo(1),
    },
    { activityId: 'music', durationSeconds: 30, residentId: 'gone', startedAt: daysAgo(1) },
  ];

  it('totals the period and lists every resident, most time first', () => {
    const s = summarizeFacility(sessions, residents, { days: 30, now: NOW });
    expect(s.totalSeconds).toBe(990);
    expect(s.sessions).toBe(4);
    expect(s.residentsEngaged).toBe(2);
    expect(s.guestSeconds).toBe(60);
    expect(s.guestSessions).toBe(1);
    expect(s.residents.map((r) => [r.name, r.seconds, r.sessions])).toEqual([
      ['Ann', 600, 1],
      ['Bobby', 300, 1],
      ['Cy', 0, 0],
    ]);
    expect(s.residents[2].lastActiveAt).toBeNull();
    expect(s.activities[0]).toMatchObject({ activityId: 'music', seconds: 690 });
  });

  it('includes older visits for all time', () => {
    const s = summarizeFacility(sessions, residents, { days: null, now: NOW });
    expect(s.residents[0]).toMatchObject({ name: 'Ann', seconds: 720, sessions: 2 });
  });
});

describe('summarizeVolunteer', () => {
  const sessions = [
    { activityId: 'music', durationSeconds: 1800, residentId: 'a', startedAt: daysAgo(1) },
    { activityId: 'trivia', durationSeconds: 600, residentId: 'b', startedAt: ts(daysAgo(8)) },
    {
      activityId: 'music',
      durationSeconds: 300,
      residentId: null,
      isGuest: true,
      startedAt: daysAgo(2),
    },
    { activityId: 'music', durationSeconds: 900, residentId: 'a', startedAt: daysAgo(100) },
  ];

  it('totals the period, counts residents, and lists the newest visits first', () => {
    const s = summarizeVolunteer(sessions, { days: 30, now: NOW });
    expect(s.totalSeconds).toBe(2700);
    expect(s.sessions).toBe(3);
    expect(s.residentsVisited).toBe(2);
    expect(s.recent.map((v) => v.label)).toEqual(['Music', 'Music', 'Trivia']);
    expect(s.recent[1].residentId).toBeNull();
  });

  it('charts the last 8 weeks oldest first, whatever the period', () => {
    const s = summarizeVolunteer(sessions, { days: 7, now: NOW });
    expect(s.weeks).toHaveLength(8);
    expect(s.weeks[7].weekStart).toEqual(weekStart(NOW));
    const charted = s.weeks.reduce((sum, w) => sum + w.seconds, 0);
    // The 100-day-old visit is outside the 8 weeks.
    expect(charted).toBe(2700);
  });
});

describe('weekStart', () => {
  it('goes back to Monday at midnight', () => {
    const d = weekStart(new Date(2026, 8, 27, 15, 30)); // Sunday 27 Sept 2026
    expect(d).toEqual(new Date(2026, 8, 21)); // Monday 21 Sept
    expect(weekStart(new Date(2026, 8, 21, 9))).toEqual(new Date(2026, 8, 21));
  });
});
