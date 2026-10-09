// The life story's people lists (children, grandchildren, important people):
// what gets saved, and how answers from the older free-text boxes are carried
// over into them.
import {
  MAX_PEOPLE,
  cleanPeople,
  describePerson,
  emptyPerson,
  withLegacyPeople,
} from '../utils/lifeStoryPeople';

describe('cleanPeople', () => {
  it('trims text and drops entries with neither a name nor notes', () => {
    expect(
      cleanPeople([
        { name: ' Ruth ', notes: ' Visits Sundays ', okToTalkAbout: true },
        emptyPerson(),
        { name: '', notes: 'Late husband', okToTalkAbout: false },
      ])
    ).toEqual([
      { name: 'Ruth', notes: 'Visits Sundays', okToTalkAbout: true },
      { name: '', notes: 'Late husband', okToTalkAbout: false },
    ]);
  });

  it('copes with missing or malformed lists and caps their length', () => {
    expect(cleanPeople(undefined)).toEqual([]);
    expect(cleanPeople('Ruth')).toEqual([]);
    expect(cleanPeople([null, 'Ruth', { name: 7 }])).toEqual([]);
    const many = Array.from({ length: 30 }, (_, i) => ({ name: `P${i}`, notes: '' }));
    expect(cleanPeople(many)).toHaveLength(MAX_PEOPLE);
  });

  it('treats a missing tick as OK to talk about, like the form', () => {
    expect(cleanPeople([{ name: 'June' }])[0].okToTalkAbout).toBe(true);
  });
});

describe('withLegacyPeople', () => {
  it('moves an old free-text answer into a single entry and clears it', () => {
    const story = withLegacyPeople({ hasChildren: true, childrenDetails: 'Two daughters' });
    expect(story.childrenList).toEqual([{ name: '', notes: 'Two daughters', okToTalkAbout: true }]);
    expect(story.childrenDetails).toBe('');
    expect(story.importantPeopleList).toEqual([]);
  });

  it('leaves a story that already uses the lists alone', () => {
    const list = [{ name: 'Leon', notes: '', okToTalkAbout: true }];
    expect(withLegacyPeople({ childrenList: list, childrenDetails: null }).childrenList).toEqual(
      list
    );
  });
});

describe('describePerson', () => {
  it('joins name and notes, or uses whichever is there', () => {
    expect(describePerson({ name: 'Ruth', notes: 'daughter', okToTalkAbout: true })).toBe(
      'Ruth (daughter)'
    );
    expect(describePerson({ name: 'Ruth', notes: '', okToTalkAbout: true })).toBe('Ruth');
    expect(describePerson({ name: '', notes: 'her sister', okToTalkAbout: true })).toBe(
      'her sister'
    );
  });
});
