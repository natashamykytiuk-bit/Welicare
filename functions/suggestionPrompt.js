// Builds the prompts generateSuggestions sends to the model (a system prompt
// with the dementia-care guidance, and a user message with the resident's
// facts), cleans the life story it receives first, and parses the model's
// reply into a "brief" for staff. Kept apart from index.js so it can be
// unit-tested without the Functions emulator (tests/suggestionPrompt.test.js).
//
// This file is the one source of truth for the prompt: welicare-ml imports
// buildSystemPrompt/buildPrompt/parseBrief to generate classifier training
// data, so keep them pure (no Firebase, no network, no clock).

// Bumped whenever the prompt text or brief shape changes. Stored with every
// good/bad rating (utils/suggestionFeedback.js), so ratings can be compared
// across prompt versions, and with welicare-ml's training data.
const PROMPT_VERSION = 'v2';

// The kinds of brief the app can ask for, and what the user message asks the
// model to produce for each. Matches the classifier rubric's categories:
// conversation starters and activity instructions (trivia is only offered as
// opinion questions inside a conversation brief, never recall).
const KIND_PHRASES = {
  conversation:
    'Give conversation themes. Each "try" line is one thing staff could say to start or gently keep a conversation going.',
  activities:
    'Give simple activities staff can run in a few minutes with little or no equipment. Each "try" line is one step, or one thing to say while doing it.',
};

// Kinds sent by app builds from before v2. The Cloud Function deploys
// separately from the app, so an older install still sends these for a
// while; they're mapped onto the new kinds rather than refused.
const LEGACY_KINDS = {
  conversationStarters: 'conversation',
  activityIdeas: 'activities',
  musicMovieRecs: 'conversation',
};

// The new kind for `kind`, or null if it isn't one. Object.hasOwn, not a
// plain lookup: a plain lookup also accepts inherited names like "toString".
function resolveKind(kind) {
  if (typeof kind !== 'string') return null;
  if (Object.hasOwn(KIND_PHRASES, kind)) return kind;
  if (Object.hasOwn(LEGACY_KINDS, kind)) return LEGACY_KINDS[kind];
  return null;
}

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

// How many ideas, "try" lines and tips a brief has. The prompt asks for
// these numbers and parseBrief enforces them, so a chatty reply can't flood
// the screen.
const BRIEF_IDEAS = 4;
const MAX_TRY_LINES = 3;
const MAX_TIPS = 2;
// Longest title / why / try line / tip kept from the model. A try line stays
// well under the 500 characters a good/bad rating may store.
const MAX_TITLE_LENGTH = 80;
const MAX_LINE_LENGTH = 300;

// The dementia-care guidance, sent as the system prompt. It's written for
// the reader the app actually has: recreation staff, who choose an idea and
// say it in their own words — never shown as a script to read to the
// resident. Each rule maps to a failure category in welicare-ml's rubric
// (RECALL, COMPLEX, DISTRESS, INFANTILIZING, CORRECTIVE), plus the problems
// seen in test generations: invented scenes, forced profile facts, and
// people assumed to be present or alive.
//
// There's deliberately no dementia stage: that's diagnostic information the
// app doesn't collect. Everything is pitched to work for someone who finds
// talking and remembering hard, and staff scale it up for the person in
// front of them.
function buildSystemPrompt() {
  return [
    'You help recreation staff in dementia care homes plan time with one resident. Staff read your ideas, pick what fits, and say it in their own words. You write for the staff member, not the resident.',
    '',
    'The resident may be at any stage of dementia. Pitch everything so it works for someone who finds talking and remembering hard; staff can make it richer if the person is able.',
    '',
    'Every "try" line (something to say, or one step to do) must:',
    '- Be short and simple: one idea in one short sentence. No lists of questions, no "and then", no hypotheticals ("If you could...").',
    '- Be impossible to answer wrong. Invite a reaction, an opinion, a choice or a sense ("Which do you like better, the red or the blue?", "That smells like fresh bread, doesn\'t it?"). Never ask the person to remember a name, date, place or fact ("Do you remember...", "What was the name of...").',
    '- Speak adult to adult, warmly and respectfully. No baby talk, no childish tasks, no over-the-top praise.',
    '- Build on what the person enjoys or is good at.',
    "- Never correct or test the person's sense of reality: the date, their age, where they are, or whether someone is alive.",
    '- Stay away from loss, illness, death, moving, "going home", and anything frightening or sad.',
    '',
    "Don't invent the scene. Staff may have no props, music or other people at hand:",
    '- Only rely on things a care home usually has (paper, a table, a music player, pictures), or say "if you have one".',
    '- Never assume someone else is in the room, that an event has happened, or describe how anyone looks.',
    '- People from the profile may be mentioned warmly as people the resident loves. Never say or imply they are here, visiting, or coming soon, and never ask the resident to recall details about them.',
    '',
    'Use the profile lightly. Each idea draws on at most one fact, and some ideas can use none. Never pile several facts into one line. Favourite music, films and pastimes make good themes. With no profile, suggest ideas that suit most older adults.',
    '',
    'If the message lists things the caregivers have asked you never to mention, follow that exactly, even indirectly.',
    '',
    'Reply with only a JSON object, no other text, in this shape:',
    '{"ideas":[{"title":"...","why":"...","try":["...","..."]}],"tips":["..."]}',
    `- ideas: exactly ${BRIEF_IDEAS}. title: a few words naming the theme or activity. why: one short sentence telling staff why it may suit this person. try: 2 to ${MAX_TRY_LINES} lines.`,
    `- tips: 1 to ${MAX_TIPS} short tips for staff on how to approach these with this person.`,
  ].join('\n');
}

// The user message: what's known about the resident, the request for this
// kind, and the caregivers' never-mention rule last.
// `kind` may be a new or legacy kind (resolveKind), `lifeStory` must already
// have been through sanitizeLifeStory, and `topicsToAvoid` through
// sanitizeTopicsToAvoid.
function buildPrompt(kind, lifeStory, topicsToAvoid = null) {
  const phrase = KIND_PHRASES[resolveKind(kind) ?? 'conversation'];
  const factLines = lifeStory ? buildFactLines(lifeStory) : [];

  const request =
    factLines.length === 0
      ? [
          'No specific personal information is available for this resident.',
          '',
          `Write a brief for staff. ${phrase}`,
        ].join('\n')
      : [
          'Here is what we know about this resident:',
          ...factLines,
          '',
          `Write a brief for staff. ${phrase} Use these facts lightly: at most one per idea, and only where it fits naturally.`,
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

// A string trimmed and capped, or '' if it isn't a usable string.
function cleanLine(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

// Turns the model's reply into a brief:
//   { ideas: [{ title, why, try: [string] }], tips: [string] }
// or null if it isn't usable (not JSON, or no idea with at least one try
// line). Tolerates the reply being wrapped in a ```json fence or having
// text around the object, drops malformed ideas and lines rather than
// failing, and caps every count and length. Each try line is a separate
// string so the classifier can later score them one at a time.
function parseBrief(text) {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let raw;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.ideas)) return null;
  const ideas = raw.ideas
    .filter((idea) => idea && typeof idea === 'object')
    .map((idea) => ({
      title: cleanLine(idea.title, MAX_TITLE_LENGTH),
      why: cleanLine(idea.why, MAX_LINE_LENGTH),
      try: (Array.isArray(idea.try) ? idea.try : [])
        .map((line) => cleanLine(line, MAX_LINE_LENGTH))
        .filter(Boolean)
        .slice(0, MAX_TRY_LINES),
    }))
    .filter((idea) => idea.title && idea.try.length)
    .slice(0, BRIEF_IDEAS);
  if (!ideas.length) return null;
  const tips = (Array.isArray(raw.tips) ? raw.tips : [])
    .map((tip) => cleanLine(tip, MAX_LINE_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_TIPS);
  return { ideas, tips };
}

// A brief as plain text, for app builds from before v2 that still read the
// response's `text` field and split it into paragraphs.
function briefToText(brief) {
  const ideas = brief.ideas.map((idea) =>
    [idea.why ? `${idea.title}: ${idea.why}` : idea.title, ...idea.try.map((l) => `- ${l}`)].join(
      '\n'
    )
  );
  const tips = brief.tips.length ? [`Tips:\n${brief.tips.map((t) => `- ${t}`).join('\n')}`] : [];
  return [...ideas, ...tips].join('\n\n');
}

module.exports = {
  PROMPT_VERSION,
  KIND_PHRASES,
  resolveKind,
  sanitizeLifeStory,
  sanitizeTopicsToAvoid,
  buildSystemPrompt,
  buildPrompt,
  parseBrief,
  briefToText,
};
