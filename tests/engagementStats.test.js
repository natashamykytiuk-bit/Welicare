// Resident engagement totals (utils/engagementStats.js): per-activity time,
// period filtering, and how durations are worded.
import { formatDuration, summarizeSessions } from '../utils/engagementStats';

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
