// Security review #6: two staff editing the same resident at once must not
// silently undo each other's changes. These cover the merge logic used by
// BuildProfileScreen (saveResidentProfile) and the curation screens
// (saveApprovedIds).

import { mergeApprovedIds, saveApprovedIds } from '../utils/approvedVideos';
import { changedFields, saveResidentProfile } from '../utils/residentLifeStory';
import { docSnap, firestore } from './mocks/firebase';

describe('mergeApprovedIds', () => {
  it('uses the ticked list as-is when the resident was not curated yet', () => {
    expect(mergeApprovedIds(undefined, undefined, ['a', 'b'])).toEqual(['a', 'b']);
  });

  it("keeps a colleague's additions made since this screen loaded", () => {
    // Loaded [a]; a colleague has since saved [a, c]; this person ticks b.
    expect(mergeApprovedIds(['a', 'c'], ['a'], ['a', 'b'])).toEqual(['a', 'c', 'b']);
  });

  it('applies this person’s removals without re-adding what others removed', () => {
    // Loaded [a, b, c]; colleague removed c; this person unticks a.
    expect(mergeApprovedIds(['a', 'b'], ['a', 'b', 'c'], ['b', 'c'])).toEqual(['b']);
  });

  it('keeps an empty list empty (nothing approved)', () => {
    expect(mergeApprovedIds([], [], [])).toEqual([]);
  });
});

describe('saveApprovedIds', () => {
  it('reads the saved list in a transaction and writes the merged one', async () => {
    firestore.getDoc.mockResolvedValueOnce(docSnap({ selectedMusicVideoIds: ['a', 'c'] }));
    const saved = await saveApprovedIds('r1', 'selectedMusicVideoIds', ['a'], ['a', 'b']);
    expect(saved).toEqual(['a', 'c', 'b']);
    expect(firestore.updateDoc).toHaveBeenCalledWith(expect.objectContaining({ path: 'residents/r1' }), {
      selectedMusicVideoIds: ['a', 'c', 'b'],
    });
  });
});

describe('saveResidentProfile', () => {
  const fields = ['career', 'hobbies', 'preferredName'];

  it('reports only the fields that changed', () => {
    expect(
      changedFields({ career: null, hobbies: ['Reading'] }, { career: 'Nurse', hobbies: ['Reading'] })
    ).toEqual({ career: 'Nurse' });
  });

  it("writes this person's change on top of a colleague's newer save", async () => {
    // Resident doc, then the life story as saved now (a colleague added hobbies).
    firestore.getDoc
      .mockResolvedValueOnce(docSnap({ name: 'Ann' }))
      .mockResolvedValueOnce(docSnap({ career: null, hobbies: ['Chess'], preferredName: null }));

    await saveResidentProfile('r1', {
      name: 'Ann',
      lifeStory: { career: 'Nurse', hobbies: [], preferredName: null },
      original: { name: 'Ann', lifeStory: { career: null, hobbies: [], preferredName: null } },
      fields,
    });

    // career from this person, hobbies kept from the colleague.
    const storyWrite = firestore.setDoc.mock.calls.find(([ref]) => ref.path.endsWith('lifeStory'));
    expect(storyWrite[1]).toEqual({ career: 'Nurse', hobbies: ['Chess'], preferredName: null });
    // Name unchanged by this person, so it isn't written (a colleague's
    // rename would survive).
    const residentWrite = firestore.updateDoc.mock.calls[0][1];
    expect(residentWrite).not.toHaveProperty('name');
    expect(residentWrite.hasLifeStory).toBe(true);
  });
});
