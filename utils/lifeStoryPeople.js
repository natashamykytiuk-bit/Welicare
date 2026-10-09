// @ts-check
// The "people" answers of the life story: children, grandchildren and other
// important people, each kept as a list of
//   { name, notes, okToTalkAbout }
// rather than one free-text box. Separate entries are what let the AI
// suggestions (functions/suggestionPrompt.js) use the people who are good to
// talk about and leave out, by name, the ones who aren't.
//
// Pure helpers shared by BuildProfileScreen (the form) and
// ResidentProfileScreen (the read-only summary).

/** @typedef {import('../types/models').LifeStoryPerson} LifeStoryPerson */

// Each people list, with the older free-text answer it replaces and, for
// children/grandchildren, the Yes/No answer that goes with it.
export const PEOPLE_LISTS = [
  { key: 'childrenList', legacyKey: 'childrenDetails', hasKey: 'hasChildren' },
  { key: 'grandchildrenList', legacyKey: 'grandchildrenDetails', hasKey: 'hasGrandchildren' },
  { key: 'importantPeopleList', legacyKey: 'importantPeople', hasKey: null },
];
export const PEOPLE_LIST_KEYS = PEOPLE_LISTS.map((l) => l.key);

// MAX_PEOPLE is the list length firestore.rules allow (validLifeStory); the
// form stops there so a save can't be refused afterwards. The rules don't
// check the entries themselves, which is why every reader goes through
// cleanPeople below.
export const MAX_PEOPLE = 20;
export const PERSON_NAME_MAX_LENGTH = 200;
export const PERSON_NOTES_MAX_LENGTH = 2000;

/**
 * A blank entry for the form. "OK to talk about" starts ticked: most people
 * a resident names are welcome topics, so staff only untick the exceptions.
 * @returns {LifeStoryPerson}
 */
export function emptyPerson() {
  return { name: '', notes: '', okToTalkAbout: true };
}

/**
 * A people list in the shape it's saved in: text trimmed, entries with
 * neither a name nor notes dropped (an "Add" tapped but never filled in).
 * @param {unknown} list
 * @returns {LifeStoryPerson[]}
 */
export function cleanPeople(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((p) => p && typeof p === 'object')
    .map((p) => ({
      name: typeof p.name === 'string' ? p.name.trim() : '',
      notes: typeof p.notes === 'string' ? p.notes.trim() : '',
      okToTalkAbout: p.okToTalkAbout !== false,
    }))
    .filter((p) => p.name || p.notes)
    .slice(0, MAX_PEOPLE);
}

/**
 * Moves answers written before the people lists existed into them, for the
 * form: an old free-text answer ("Two daughters, Ruth and Clara…") becomes
 * the notes of a single entry, so nothing already recorded is lost and the
 * caregiver can split it into separate people. The old text is cleared, so
 * the next save stores the list instead. Stories that already use the lists
 * are returned unchanged.
 * @param {Record<string, any>} story
 * @returns {Record<string, any>}
 */
export function withLegacyPeople(story) {
  const next = { ...story };
  for (const { key, legacyKey } of PEOPLE_LISTS) {
    const existing = cleanPeople(next[key]);
    const legacy = typeof next[legacyKey] === 'string' ? next[legacyKey].trim() : '';
    next[key] = existing.length || !legacy ? existing : [{ ...emptyPerson(), notes: legacy }];
    if (legacy) next[legacyKey] = '';
  }
  return next;
}

/**
 * One person as a line of text: "Ruth (visits most Sundays)".
 * @param {LifeStoryPerson} person
 */
export function describePerson(person) {
  if (person.name && person.notes) return `${person.name} (${person.notes})`;
  return person.name || person.notes;
}
