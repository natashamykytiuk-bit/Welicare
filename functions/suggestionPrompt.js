// Builds the prompt generateSuggestions sends to the model, and cleans the
// life story it receives first. Kept apart from index.js so it can be
// unit-tested without the Functions emulator (tests/suggestionPrompt.test.js).

const KIND_PHRASES = {
  activityIdeas: 'activity ideas',
  conversationStarters: 'conversation starters',
  musicMovieRecs: 'music and movie recommendations',
};

// Readable label for each lifeStory field, in the order they should be
// presented to the model. Yes/No fields render their detail text (falling
// back to "Yes"/"No") since a bare boolean isn't useful to an LLM prompt.
const FIELD_LABELS = [
  ['preferredName', 'Preferred name'],
  ['age', 'Age'],
  ['grewUpIn', 'Grew up in'],
  ['otherPlacesLived', 'Other places lived'],
  ['relationshipStatus', 'Relationship status'],
  ['career', 'Career'],
  ['careerLove', 'Loved most about work'],
  ['importantPeople', 'Important people'],
  ['favouriteMusicians', 'Favourite musicians'],
  ['favouriteMovies', 'Favourite movies'],
  ['favouriteFoods', 'Favourite foods'],
  ['happiestMemory', 'Happiest memory'],
  ['specialPlace', 'Special place'],
];

// Longest text answer / most list items we pass on to the model. Generous
// for real answers, but stops a direct caller sending huge (paid) prompts.
const MAX_TEXT_LENGTH = 1000;
const MAX_LIST_ITEMS = 30;
const LIST_FIELDS = ['hobbies', 'creativeHobbies', 'musicGenres'];
const BOOLEAN_FIELDS = ['hasChildren', 'hasGrandchildren'];
const TEXT_FIELDS = [
  ...FIELD_LABELS.map(([key]) => key),
  'childrenDetails',
  'grandchildrenDetails',
  'hobbiesOtherDetail',
  'creativeHobbiesOtherDetail',
  'musicGenresOtherDetail',
];

// The people lists (utils/lifeStoryPeople.js in the app): children,
// grandchildren and other important people, each a list of
// { name, notes, okToTalkAbout }. `legacyKey` is the older free-text answer
// a list replaces, still used for profiles not re-saved since; `hasKey` the
// Yes/No answer the list belongs to.
const PEOPLE_LISTS = [
  { key: 'childrenList', label: 'Children', legacyKey: 'childrenDetails', hasKey: 'hasChildren' },
  {
    key: 'grandchildrenList',
    label: 'Grandchildren',
    legacyKey: 'grandchildrenDetails',
    hasKey: 'hasGrandchildren',
  },
  {
    key: 'importantPeopleList',
    label: 'Important people',
    legacyKey: 'importantPeople',
    hasKey: null,
  },
];
// Same caps as firestore.rules put on a saved list.
const MAX_PEOPLE = 20;
const MAX_NAME_LENGTH = 200;

// One people list from untrusted input: only real entries with some text,
// trimmed and capped. `okToTalkAbout` is false only when explicitly false,
// matching the form, where the box starts ticked.
function sanitizePeople(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p) => p && typeof p === 'object' && !Array.isArray(p))
    .map((p) => ({
      name: typeof p.name === 'string' ? p.name.trim().slice(0, MAX_NAME_LENGTH) : '',
      notes: typeof p.notes === 'string' ? p.notes.trim().slice(0, MAX_TEXT_LENGTH) : '',
      okToTalkAbout: p.okToTalkAbout !== false,
    }))
    .filter((p) => p.name || p.notes)
    .slice(0, MAX_PEOPLE);
}

// "Ruth (visits most Sundays)", or just the name or the notes.
function describePerson(person) {
  if (person.name && person.notes) return `${person.name} (${person.notes})`;
  return person.name || person.notes;
}

// A people list as it counts for the prompt: ignored when its Yes/No answer
// isn't Yes (entries typed before switching to "No" stay saved but hidden).
function activePeople(lifeStory, { key, hasKey }) {
  if (hasKey && !lifeStory[hasKey]) return [];
  return lifeStory[key] ?? [];
}

// generateSuggestions is callable directly, so the life story can't be
// trusted to have the shape BuildProfileScreen saves (e.g. `hobbies: 42`
// used to crash buildFactLines). This rebuilds it from known fields only:
// text is trimmed and length-capped, lists keep only strings, booleans must
// be real booleans, and anything else (unknown keys, wrong types) is
// dropped rather than rejected — a partly odd profile still gets
// suggestions. Returns null when nothing usable is left.
function sanitizeLifeStory(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const clean = {};
  for (const key of TEXT_FIELDS) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim()) {
      clean[key] = value.trim().slice(0, MAX_TEXT_LENGTH);
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      clean[key] = String(value); // e.g. an age saved as a number
    }
  }
  for (const key of LIST_FIELDS) {
    if (Array.isArray(raw[key])) {
      const items = raw[key]
        .filter((item) => typeof item === 'string' && item.trim())
        .slice(0, MAX_LIST_ITEMS)
        .map((item) => item.trim().slice(0, MAX_TEXT_LENGTH));
      if (items.length) clean[key] = items;
    }
  }
  for (const key of BOOLEAN_FIELDS) {
    if (typeof raw[key] === 'boolean') clean[key] = raw[key];
  }
  for (const { key } of PEOPLE_LISTS) {
    const people = sanitizePeople(raw[key]);
    if (people.length) clean[key] = people;
  }
  return Object.keys(clean).length ? clean : null;
}

function isEmpty(value) {
  return (
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function buildFactLines(lifeStory) {
  const lines = [];
  // The older free-text people answers are handled with their lists below.
  const legacyPeopleKeys = PEOPLE_LISTS.map((l) => l.legacyKey);
  for (const [key, label] of FIELD_LABELS) {
    if (legacyPeopleKeys.includes(key)) continue;
    if (!isEmpty(lifeStory[key])) lines.push(`- ${label}: ${lifeStory[key]}`);
  }
  for (const list of PEOPLE_LISTS) {
    const people = activePeople(lifeStory, list);
    if (people.length) {
      // Only the people marked OK to talk about are offered as facts. If
      // none are, the line is left out altogether — even "Children: Yes"
      // would invite the model to ask about them.
      const ok = people.filter((p) => p.okToTalkAbout).map(describePerson);
      if (ok.length) lines.push(`- ${list.label}: ${ok.join('; ')}`);
    } else if (list.hasKey ? lifeStory[list.hasKey] : !isEmpty(lifeStory[list.legacyKey])) {
      // No list yet (a profile saved before the lists existed): the old
      // free-text answer, or a bare "Yes" for children/grandchildren.
      lines.push(`- ${list.label}: ${lifeStory[list.legacyKey] || 'Yes'}`);
    }
  }
  if (!isEmpty(lifeStory.hobbies)) {
    const detail =
      lifeStory.hobbies.includes('Other') && lifeStory.hobbiesOtherDetail
        ? [...lifeStory.hobbies.filter((h) => h !== 'Other'), lifeStory.hobbiesOtherDetail]
        : lifeStory.hobbies;
    lines.push(`- Hobbies: ${detail.join(', ')}`);
  }
  if (!isEmpty(lifeStory.creativeHobbies)) {
    const detail =
      lifeStory.creativeHobbies.includes('Other') && lifeStory.creativeHobbiesOtherDetail
        ? [
            ...lifeStory.creativeHobbies.filter((h) => h !== 'Other'),
            lifeStory.creativeHobbiesOtherDetail,
          ]
        : lifeStory.creativeHobbies;
    lines.push(`- Creative hobbies: ${detail.join(', ')}`);
  }
  if (!isEmpty(lifeStory.musicGenres)) {
    const detail =
      lifeStory.musicGenres.includes('Other') && lifeStory.musicGenresOtherDetail
        ? [...lifeStory.musicGenres.filter((g) => g !== 'Other'), lifeStory.musicGenresOtherDetail]
        : lifeStory.musicGenres;
    lines.push(`- Favourite music: ${detail.join(', ')}`);
  }
  return lines;
}

// Longest "topics to avoid" text passed on — the same cap firestore.rules
// put on the safety notes.
const MAX_AVOID_LENGTH = 2000;

// The caregiver's safety notes ("topics to avoid", ResidentSafetyScreen),
// cleaned the same way as the life story: a string, trimmed and capped, or
// null if there's nothing usable.
function sanitizeTopicsToAvoid(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  return raw.trim().slice(0, MAX_AVOID_LENGTH);
}

// `lifeStory` must already have been through sanitizeLifeStory, and
// `topicsToAvoid` through sanitizeTopicsToAvoid.
function buildPrompt(kind, lifeStory, topicsToAvoid = null) {
  const phrase = KIND_PHRASES[kind] ?? 'suggestions';
  const factLines = lifeStory ? buildFactLines(lifeStory) : [];

  const request =
    factLines.length === 0
      ? `Please generate warm, general ${phrase} suggestions appropriate for an elderly person in a care setting. No specific personal information is available for this person.`
      : [
          'Here is what we know about this person:',
          ...factLines,
          '',
          `Based on this, please generate ${phrase} that are specifically tailored to this person. If limited information is available, use what is provided and make warm, general suggestions appropriate for an elderly person in a care setting.`,
        ].join('\n');

  // People whose "OK to talk about" box was unticked on the life story. They
  // are named here, with the safety notes, rather than simply left out of
  // the facts: the model can only steer clear of someone it knows about
  // (e.g. a late husband who also appears in "happiest memory").
  const peopleToAvoid = lifeStory
    ? PEOPLE_LISTS.flatMap((list) => activePeople(lifeStory, list))
        .filter((p) => !p.okToTalkAbout)
        .map(describePerson)
    : [];

  if (!topicsToAvoid && peopleToAvoid.length === 0) return request;
  // Framed as a firm rule rather than as another fact about the person, and
  // placed last so it's the final instruction the model reads. It applies
  // even when the life story is empty.
  return [
    request,
    '',
    "Important — the person's caregivers have asked that suggestions never include, mention or lead to the following, even indirectly:",
    ...(topicsToAvoid ? [topicsToAvoid] : []),
    ...(peopleToAvoid.length ? [`These people: ${peopleToAvoid.join('; ')}`] : []),
    'Leave out any idea that touches on these, rather than softening it.',
  ].join('\n');
}

module.exports = { KIND_PHRASES, sanitizeLifeStory, sanitizeTopicsToAvoid, buildPrompt };
