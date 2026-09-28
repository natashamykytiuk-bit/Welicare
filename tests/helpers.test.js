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
import { nextOnboardingRoute } from '../utils/onboarding';
import { rankBySimilarity, similarityScore } from '../utils/songSimilarity';

describe('formatOrgCode', () => {
  // Invite codes are 2 letters + 4 digits, e.g. "MG-4821". formatOrgCode
  // shapes what someone types into that format as they type it.
  it('upper-cases and adds the dash once a digit is typed', () => {
    expect(formatOrgCode('mg')).toBe('MG');
    expect(formatOrgCode('mg4')).toBe('MG-4');
    expect(formatOrgCode('mg4821')).toBe('MG-4821');
  });

  it('ignores spaces, punctuation and extra characters', () => {
    expect(formatOrgCode(' m-g 48.21 ')).toBe('MG-4821');
    expect(formatOrgCode('MG-48219999')).toBe('MG-4821');
  });

  it('drops letters typed where digits belong', () => {
    expect(formatOrgCode('MGab12')).toBe('MG-12');
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
