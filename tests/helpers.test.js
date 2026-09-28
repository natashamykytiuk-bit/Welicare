// Tests for pure helper functions — no screens, no Firebase. These are the
// easiest kind of test to write: call the function with some input and
// check the output with expect(...).
//
// Shape of a test file:
//   describe('thing being tested', () => {       // groups related tests
//     it('does X when Y', () => {                 // one scenario
//       expect(actual).toBe(expected);            // the check
//     });
//   });
// Run with `npm test` (all) or `npm run test:watch` (re-runs on save).

import { createPersonalOrganization, formatOrgCode } from '../utils/inviteCode';
import { batches, firestore } from './mocks/firebase';
import { hasAnyLifeStoryData } from '../utils/lifeStory';
import { filterToApprovedMusic, isMusicCurated } from '../utils/musicLibrary';
import { filterMovies, filterToApprovedMovies, sortMovies } from '../utils/movieLibrary';
import { nextOnboardingRoute } from '../utils/onboarding';
import { rankBySimilarity, similarityScore } from '../utils/songSimilarity';

describe('formatOrgCode', () => {
  // Invite codes are 8 characters in two groups of four, e.g. "MGK7-4TXR".
  // formatOrgCode shapes what someone types into that format as they type.
  it('upper-cases and adds the dash after the first four', () => {
    expect(formatOrgCode('mgk')).toBe('MGK');
    expect(formatOrgCode('mgk7')).toBe('MGK7');
    expect(formatOrgCode('mgk74')).toBe('MGK7-4');
    expect(formatOrgCode('mgk74txr')).toBe('MGK7-4TXR');
  });

  it('ignores spaces, punctuation and extra characters', () => {
    expect(formatOrgCode(' mgk7 - 4txr ')).toBe('MGK7-4TXR');
    expect(formatOrgCode('MGK7-4TXR-EXTRA')).toBe('MGK7-4TXR');
  });

  it('still lets an old 6-character code through (the server ignores dashes)', () => {
    expect(formatOrgCode('MG-4821')).toBe('MG48-21');
  });
});

describe('nextOnboardingRoute', () => {
  // it.each runs the same test once per row — handy for tables of cases.
  it.each([
    ['no user doc yet (sign-up stopped partway)', undefined, 'FinishSignUp'],
    ['no PIN', { role: 'Caregiver' }, 'PINSetup'],
    ['PIN but no org', { role: 'Caregiver', pinHash: 'h' }, 'JoinCreateOrganization'],
    [
      'caregiver who skipped the org step',
      { role: 'Caregiver', pinHash: 'h', orgStepSkipped: true },
      'ModeSelection',
    ],
    [
      'administrator cannot skip the org step',
      { role: 'Administrator', pinHash: 'h', orgStepSkipped: true },
      'JoinCreateOrganization',
    ],
    ['fully onboarded', { role: 'Administrator', pinHash: 'h', orgId: 'o' }, 'ModeSelection'],
  ])('%s → %s', (_label, userDoc, expected) => {
    expect(nextOnboardingRoute(userDoc)).toBe(expected);
  });
});

describe('hasAnyLifeStoryData', () => {
  it('is false for missing or empty life stories', () => {
    expect(hasAnyLifeStoryData(null)).toBe(false);
    expect(hasAnyLifeStoryData({ career: '', hobbies: [], age: null })).toBe(false);
  });

  it('is true once any answer is filled in', () => {
    expect(hasAnyLifeStoryData({ career: 'Farmer' })).toBe(true);
    expect(hasAnyLifeStoryData({ hobbies: ['Fishing'] })).toBe(true);
  });
});

describe('song similarity', () => {
  const playing = { videoId: 'a', genres: ['Big Band'], decade: '1940s', artist: 'Glenn Miller' };

  it('scores shared genre, decade and artist', () => {
    // 3 (genre) + 2 (same decade) + 2 (same artist)
    expect(similarityScore(playing, { videoId: 'b', ...playing })).toBe(7);
    // Genre match is case-insensitive; neighbouring decade scores 1.
    expect(similarityScore(playing, { videoId: 'c', genres: ['big band'], decade: '1950s' })).toBe(
      4
    );
  });

  it('ranks most similar first and keeps browse order for ties', () => {
    const songs = [
      { videoId: 'rock', genres: ['Rock'], decade: '1960s' },
      { videoId: 'untagged' },
      { videoId: 'swing', genres: ['Big Band'], decade: '1950s' },
    ];
    // rock and untagged both score 0, so they stay in their original order.
    expect(rankBySimilarity(playing, songs).map((s) => s.videoId)).toEqual([
      'swing',
      'rock',
      'untagged',
    ]);
  });
});

describe('createPersonalOrganization', () => {
  // Uses the shared Firebase mock's batch recorder: both writes must go in
  // one batch, committed once, with nothing written separately.
  it('creates the org and links the user in a single batch', async () => {
    const orgId = await createPersonalOrganization();

    expect(batches).toHaveLength(1);
    const [orgWrite, userWrite] = batches[0].ops;
    expect(orgWrite).toEqual([
      'set',
      `organizations/${orgId}`,
      expect.objectContaining({ isPersonal: true, createdBy: 'test-uid', adminId: 'test-uid' }),
    ]);
    expect(userWrite).toEqual(['set', 'users/test-uid', { orgId }]);
    expect(batches[0].commit).toHaveBeenCalledTimes(1);
    expect(firestore.addDoc).not.toHaveBeenCalled();
    expect(firestore.setDoc).not.toHaveBeenCalled();
  });
});

describe('music approval (filterToApprovedMusic)', () => {
  // One rule for every music path: no approved list → whole library; a
  // saved list (even empty) → only those songs.
  const library = [{ videoId: 'a' }, { videoId: 'b' }, { videoId: 'c' }];
  const ids = (entries) => entries.map((e) => e.videoId);

  it('a resident with no approved list sees the whole library', () => {
    expect(isMusicCurated({})).toBe(false);
    expect(ids(filterToApprovedMusic(library, {}))).toEqual(['a', 'b', 'c']);
  });

  it('a curated resident only sees approved songs', () => {
    expect(ids(filterToApprovedMusic(library, { selectedMusicVideoIds: ['b'] }))).toEqual(['b']);
  });

  it('an empty approved list means nothing, not everything', () => {
    expect(isMusicCurated({ selectedMusicVideoIds: [] })).toBe(true);
    expect(filterToApprovedMusic(library, { selectedMusicVideoIds: [] })).toEqual([]);
  });

  it('a favourite that was un-approved no longer shows', () => {
    const favourites = [{ videoId: 'a' }, { videoId: 'c' }];
    expect(ids(filterToApprovedMusic(favourites, { selectedMusicVideoIds: ['a'] }))).toEqual(['a']);
  });
});

describe('movie library helpers', () => {
  const movies = [
    { videoId: 'm1', title: 'Singin in the Rain', genres: ['Musical'], decade: '1950s' },
    { videoId: 'm2', title: 'Casablanca', genres: ['Drama', 'Romance'], decade: '1940s' },
    { videoId: 'm3', title: 'The Sound of Music', genres: ['Musical', 'Family'], decade: '1960s' },
    { videoId: 'm4', title: 'An Affair to Remember', genres: ['Romance'], decade: '1950s' },
  ];
  const ids = (list) => list.map((m) => m.videoId);

  it('sorts by decade, oldest first, then title', () => {
    expect(ids(sortMovies(movies))).toEqual(['m2', 'm4', 'm1', 'm3']);
  });

  it('filters by genre and decade', () => {
    expect(ids(filterMovies(movies, { genre: 'Musical' }))).toEqual(['m1', 'm3']);
    expect(ids(filterMovies(movies, { genre: 'Romance', decade: '1950s' }))).toEqual(['m4']);
    expect(filterMovies(movies, {})).toHaveLength(4);
  });

  it('uses the same approval rule as music, but its own list', () => {
    expect(filterToApprovedMovies(movies, {})).toHaveLength(4); // not curated
    expect(ids(filterToApprovedMovies(movies, { selectedMovieVideoIds: ['m3'] }))).toEqual(['m3']);
    expect(filterToApprovedMovies(movies, { selectedMovieVideoIds: [] })).toEqual([]);
    // A music approval list has no effect on movies.
    expect(filterToApprovedMovies(movies, { selectedMusicVideoIds: [] })).toHaveLength(4);
  });
});
