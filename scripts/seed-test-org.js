// Seeds two clearly-fake organizations for end-to-end testing across all
// five modes:
//
//   "TEST Maple Grove Care" — 2 administrators, 3 caregivers, 2 volunteers,
//     3 family members, 5 fictional residents and ~3 weeks of backdated
//     Resident Mode activity sessions (including Guest Mode visits).
//   "TEST Cedar House" — 1 administrator, 1 caregiver, 2 fictional residents,
//     for checking that one organization never sees the other's data.
//
// Every document is written in exactly the shape the app (or its Cloud
// Functions) writes it — see the comment above each builder for the screen
// or function it mirrors. Admin SDK writes bypass firestore.rules, so the
// shapes are copied by hand rather than checked by the rules; if one of
// those flows changes, update the matching builder here too.
//
//   npm run seed:test-org
//
// Needs GOOGLE_APPLICATION_CREDENTIALS (service account key path),
// WELICARE_TEST_PASSWORD and WELICARE_TEST_PIN — see docs/TESTING.md. Refuses
// to run if any test org or test account already exists; run
// `npm run teardown:test-org -- --confirm` first to start over.
//
// Not representable, because the app has no such fields (so nothing is
// invented for them):
//   - approval status: the app has no approval step. The two members meant
//     to be "pending" are ordinary members; docs/TESTING.md says so.
//   - dementia stage, mobility and dietary notes: residents have no such
//     fields. Profiles vary through the life story questionnaire and the
//     "topics to avoid" safety notes instead.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { initAdmin, Timestamp, TEST_EMAIL_DOMAIN, TEST_ORG_PREFIX } = require('./testOrgAdmin');

// ---------------------------------------------------------------------------
// Secrets from the environment — never hardcoded, never written to a file.
// ---------------------------------------------------------------------------

const PASSWORD = process.env.WELICARE_TEST_PASSWORD;
const PIN = process.env.WELICARE_TEST_PIN;

// The same password rules SignUpScreen enforces (utils/validation.js
// getPasswordRules), so every seeded account could have been made in the app.
function passwordProblems(pw) {
  const problems = [];
  if (pw.length < 8) problems.push('at least 8 characters');
  if (!/[A-Z]/.test(pw)) problems.push('an uppercase letter');
  if (!/[a-z]/.test(pw)) problems.push('a lowercase letter');
  if (!/[0-9]/.test(pw)) problems.push('a number');
  if (!/[^A-Za-z0-9\s]/.test(pw)) problems.push('a special character');
  if (/\s/.test(pw)) problems.push('no spaces');
  return problems;
}

// utils/pin.js hashPin: expo-crypto's SHA-256 digest, which is lowercase hex
// by default — identical to Node's createHash('sha256').digest('hex').
function hashPin(pin) {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

// utils/username.js normalizeUsername — the usernames/{key} doc id.
function normalizeUsername(username) {
  return username.trim().toLowerCase();
}

// functions/index.js randomInviteCode: 8 characters from the look-alike-free
// alphabet, shown as two groups of four ("MGK7-4TXR").
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function randomInviteCode() {
  const chars = Array.from(
    { length: 8 },
    () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]
  );
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

// Small seeded random generator (mulberry32), so the activity history is the
// same shape on every run and easy to compare between seeds.
function makeRandom(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// The test data. Every person and resident here is fictional.
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.now();
// Accounts, orgs and residents are dated a month back, so the three weeks of
// sessions below all happen after they "existed".
const CREATED_AT = Timestamp.fromDate(new Date(NOW - 30 * DAY_MS));

const ORGS = {
  A: {
    key: 'A',
    name: `${TEST_ORG_PREFIX} Maple Grove Care`,
    type: 'Long-term care home',
    province: 'Alberta',
    city: 'Edmonton',
    creator: 'admin1',
  },
  B: {
    key: 'B',
    name: `${TEST_ORG_PREFIX} Cedar House`,
    type: 'Memory care unit',
    province: 'British Columbia',
    city: 'Kelowna',
    creator: 'cedar-admin1',
  },
};

// `intendedStatus` is only for the login table: the app has no approval
// field, so "pending" can't be stored (see the header comment).
// `org: null` + orgStepSkipped is the family member who skipped the
// organization step (nextOnboardingRoute lets non-admins through with it).
const PEOPLE = [
  {
    id: 'admin1',
    org: 'A',
    role: 'Administrator',
    fullName: 'Dana Whitlock',
    intendedStatus: 'approved (org creator)',
  },
  {
    id: 'admin2',
    org: 'A',
    role: 'Administrator',
    fullName: 'Priya Rasmussen',
    intendedStatus: 'approved',
  },
  {
    id: 'caregiver1',
    org: 'A',
    role: 'Caregiver',
    fullName: 'Marcus Oyelaran',
    intendedStatus: 'approved',
  },
  {
    id: 'caregiver2',
    org: 'A',
    role: 'Caregiver',
    fullName: 'Sofia Lindqvist',
    intendedStatus: 'approved',
  },
  {
    id: 'caregiver3',
    org: 'A',
    role: 'Caregiver',
    fullName: 'Tomas Brightwater',
    intendedStatus: 'PENDING (not representable)',
  },
  {
    id: 'volunteer1',
    org: 'A',
    role: 'Volunteer',
    fullName: 'Jun Halvorsen',
    intendedStatus: 'approved',
  },
  {
    id: 'volunteer2',
    org: 'A',
    role: 'Volunteer',
    fullName: 'Keira Moss',
    intendedStatus: 'PENDING (not representable)',
  },
  {
    id: 'family1',
    org: 'A',
    role: 'Family Caregiver',
    fullName: 'Ruth Thornbury-Hale',
    intendedStatus: 'approved',
  },
  {
    id: 'family2',
    org: 'A',
    role: 'Family Caregiver',
    fullName: 'Leon Achterberg',
    intendedStatus: 'approved',
  },
  {
    id: 'family3',
    org: null,
    role: 'Family Caregiver',
    fullName: 'Imogen Farrow',
    intendedStatus: 'no org (skipped org step)',
  },
  {
    id: 'cedar-admin1',
    org: 'B',
    role: 'Administrator',
    fullName: 'Nadia Ferreira',
    intendedStatus: 'approved (org creator)',
  },
  {
    id: 'cedar-caregiver1',
    org: 'B',
    role: 'Caregiver',
    fullName: 'Owen Castellane',
    intendedStatus: 'approved',
  },
].map((p) => ({
  ...p,
  email: `${p.id}@${TEST_EMAIL_DOMAIN}`,
  // Usernames may only hold letters, digits, '.' and '_' (isValidUsername).
  username: `test_${p.id.replace(/-/g, '_')}`,
}));

// Every LifeStory key BuildProfileScreen saves (firestore.rules
// validLifeStory allows no others), with BuildProfile's "empty" values:
// null for text/choices, [] for chip lists.
const EMPTY_LIFE_STORY = {
  preferredName: null,
  age: null,
  grewUpIn: null,
  otherPlacesLived: null,
  relationshipStatus: null,
  hasChildren: null,
  childrenDetails: null,
  hasGrandchildren: null,
  grandchildrenDetails: null,
  importantPeople: null,
  career: null,
  careerLove: null,
  hobbies: [],
  hobbiesOtherDetail: null,
  creativeHobbies: [],
  creativeHobbiesOtherDetail: null,
  musicGenres: [],
  musicGenresOtherDetail: null,
  favouriteMusicians: null,
  favouriteMovies: null,
  favouriteFoods: null,
  happiestMemory: null,
  specialPlace: null,
};

// Residents. `creator` makes the resident (caregiverId/createdBy, as in
// AddResidentScreen); `assigned` are extra people on assignedCaregivers —
// that list is how a family member is linked to a resident (firestore.rules
// linkedToResident). `weight` sets how often they appear in the activity
// history. Choice values (age, relationshipStatus, hobbies, genres) come
// from BuildProfileScreen's option lists.
const RESIDENTS = [
  {
    id: 'peggy',
    org: 'A',
    name: 'Margaret Thornbury',
    creator: 'caregiver1',
    assigned: ['caregiver2', 'family1'],
    weight: 5,
    lifeStory: {
      preferredName: 'Peggy',
      age: '80-90',
      grewUpIn: 'A wheat farm outside Swift Current, Saskatchewan, the eldest of six.',
      otherPlacesLived: 'Regina for teachers’ college, then Red Deer for forty years.',
      relationshipStatus: 'Widowed',
      hasChildren: true,
      childrenDetails: 'Two daughters, Ruth and Clara. Ruth visits most Sundays.',
      hasGrandchildren: true,
      grandchildrenDetails: 'Five grandchildren; the youngest, Poppy, is learning piano.',
      importantPeople: 'Her late husband Walter; her sister June; the church choir ladies.',
      career: 'Grade-one teacher for 32 years.',
      careerLove: 'Watching children learn to read — she still recites Dick and Jane.',
      hobbies: ['Gardening', 'Church/Faith', 'Knitting', 'Cards & Games'],
      hobbiesOtherDetail: null,
      creativeHobbies: ['Knitting', 'Singing'],
      creativeHobbiesOtherDetail: null,
      musicGenres: ['Big Band', 'Gospel', 'Oldies/50s-60s'],
      musicGenresOtherDetail: null,
      favouriteMusicians: 'Glenn Miller, Patsy Cline, Anne Murray, the Mormon Tabernacle Choir',
      favouriteMovies: 'The Sound of Music, Anne of Green Gables, Singin’ in the Rain',
      favouriteFoods: 'Saskatoon berry pie, perogies, strong tea with milk',
      happiestMemory: 'Dancing with Walter at the Legion hall on VE-Day anniversary, 1955.',
      specialPlace: 'Her vegetable garden and the lilac hedge by the back porch.',
    },
    topicsToAvoid: 'Walter’s final illness — she becomes very upset. Also the farm auction.',
  },
  {
    id: 'desmond',
    org: 'A',
    name: 'Desmond Achterberg',
    creator: 'caregiver1',
    assigned: ['family2'],
    weight: 4,
    lifeStory: {
      preferredName: 'Des',
      age: '70-80',
      grewUpIn: 'Rotterdam, Netherlands; came to Canada at 19.',
      otherPlacesLived: 'Halifax, Thunder Bay, Fort McMurray.',
      relationshipStatus: 'Divorced',
      hasChildren: true,
      childrenDetails: 'One son, Leon, who lives nearby.',
      hasGrandchildren: false,
      grandchildrenDetails: null,
      importantPeople: 'His son Leon; his old crewmates from the lake freighters.',
      career: 'Ship’s engineer on Great Lakes freighters, later a heavy-duty mechanic.',
      careerLove: 'Fixing engines nobody else could — he loves talking about diesel engines.',
      hobbies: ['Fishing', 'Sports', 'Cards & Games'],
      hobbiesOtherDetail: null,
      creativeHobbies: ['Woodworking'],
      creativeHobbiesOtherDetail: null,
      musicGenres: ['Classic Rock', 'Blues', 'Country'],
      musicGenresOtherDetail: null,
      favouriteMusicians: 'Creedence Clearwater Revival, B.B. King, Johnny Cash, Golden Earring',
      favouriteMovies: 'Jaws, The Great Escape, anything with Clint Eastwood',
      favouriteFoods: 'Pea soup (erwtensoep), pickled herring, black coffee',
      happiestMemory: 'Landing a 30-pound lake trout on Lake Superior with his son.',
      specialPlace: 'The engine room of the SS Norquay — loud, warm and his.',
    },
    topicsToAvoid: 'Asking about his ex-wife. Loud sudden noises startle him.',
  },
  {
    id: 'rosalind',
    org: 'A',
    name: 'Rosalind Okafor-Lee',
    creator: 'caregiver2',
    assigned: ['caregiver1'],
    weight: 3,
    // Partial: roughly half the questionnaire answered.
    lifeStory: {
      preferredName: 'Rosie',
      age: '90-100',
      grewUpIn: 'Halifax, Nova Scotia.',
      relationshipStatus: 'Widowed',
      career: 'Hospital switchboard operator, then a music teacher.',
      hobbies: ['Reading', 'Church/Faith'],
      creativeHobbies: ['Playing Music'],
      musicGenres: ['Jazz', 'Classical', 'Gospel'],
      favouriteMusicians: 'Ella Fitzgerald, Oscar Peterson, Portia White',
    },
    topicsToAvoid: null,
  },
  {
    id: 'hal',
    org: 'A',
    name: 'Harold Brennick',
    creator: 'caregiver2',
    assigned: [],
    weight: 3,
    // Partial, and much younger — early-onset, so different eras and tastes.
    lifeStory: {
      preferredName: 'Hal',
      age: '60-70',
      grewUpIn: 'Lethbridge, Alberta.',
      hasChildren: false,
      career: 'Carpenter and finishing contractor.',
      hobbies: ['Walking', 'Sports'],
      creativeHobbies: ['Woodworking'],
      musicGenres: ['Country', 'Pop'],
      favouriteMusicians: 'Garth Brooks, Shania Twain, Tragically Hip',
      favouriteFoods: 'Alberta beef burgers',
    },
    topicsToAvoid:
      'Hockey losses — he gets frustrated. Prefers not to be asked about work he can no longer do.',
  },
  {
    id: 'evelyn',
    org: 'A',
    name: 'Evelyn Castellanos-Mayhew',
    creator: 'caregiver1',
    assigned: ['family1'],
    weight: 1,
    // Nearly empty: only an age range, as if someone started the form.
    lifeStory: { age: '80-90' },
    topicsToAvoid: null,
  },
  {
    id: 'winifred',
    org: 'B',
    name: 'Winifred Pargeter',
    creator: 'cedar-caregiver1',
    assigned: [],
    weight: 2,
    lifeStory: {
      preferredName: 'Winnie',
      age: '80-90',
      grewUpIn: 'Nelson, British Columbia.',
      career: 'Orchard owner.',
      hobbies: ['Gardening', 'Cooking'],
      musicGenres: ['Folk', 'Opera'],
      favouriteMusicians: 'Joni Mitchell, Maria Callas',
    },
    topicsToAvoid: 'The 2003 wildfire.',
  },
  {
    id: 'augustin',
    org: 'B',
    name: 'Augustin Delacroix-Mbeki',
    creator: 'cedar-caregiver1',
    assigned: [],
    weight: 1,
    lifeStory: null,
    topicsToAvoid: null,
  },
];

// Resident Mode activities, with the exact activityType / activityId pairs
// the screens log (useActivitySession callers) and a typical visit length.
const ACTIVITIES = [
  { activityType: 'game', activityId: 'memoryMatch', minMin: 3, maxMin: 15, weight: 4 },
  { activityType: 'game', activityId: 'molehunt', minMin: 3, maxMin: 12, weight: 3 },
  { activityType: 'game', activityId: 'wordGames', minMin: 4, maxMin: 15, weight: 3 },
  { activityType: 'music', activityId: 'music', minMin: 5, maxMin: 35, weight: 5 },
  { activityType: 'movies', activityId: 'movies', minMin: 20, maxMin: 95, weight: 2 },
  { activityType: 'trivia', activityId: 'trivia', minMin: 5, maxMin: 15, weight: 2 },
  { activityType: 'photoAlbum', activityId: 'photoAlbum', minMin: 3, maxMin: 12, weight: 2 },
  { activityType: 'meditation', activityId: 'guidedMeditation', minMin: 5, maxMin: 15, weight: 1 },
  {
    activityType: 'conversation',
    activityId: 'conversationStarters',
    minMin: 5,
    maxMin: 20,
    weight: 2,
  },
];
const DIFFICULTIES = ['gentle', 'medium', 'challenge'];

// Who runs sessions, and how often (relative). Family members only ever
// run sessions for the residents they're linked to.
const LOGGERS = {
  A: [
    { id: 'caregiver1', weight: 5 },
    { id: 'caregiver2', weight: 5 },
    { id: 'caregiver3', weight: 2 },
    { id: 'volunteer1', weight: 4 },
    { id: 'volunteer2', weight: 2 },
    { id: 'admin2', weight: 1 },
    { id: 'family1', weight: 2 },
    { id: 'family2', weight: 1 },
  ],
  B: [
    { id: 'cedar-caregiver1', weight: 3 },
    { id: 'cedar-admin1', weight: 1 },
  ],
};
// Share of visits run in Guest Mode (no resident) — staff only.
const GUEST_SHARE = 0.15;

function pickWeighted(rand, items) {
  const total = items.reduce((n, i) => n + i.weight, 0);
  let r = rand() * total;
  for (const item of items) {
    r -= item.weight;
    if (r < 0) return item;
  }
  return items[items.length - 1];
}

// ---------------------------------------------------------------------------
// Document builders — one per app flow.
// ---------------------------------------------------------------------------

// SignUpScreen writeProfile + PINSetupScreen's { pinHash } + the orgId set by
// createOrganization / joinOrganization (or JoinCreateOrganizationScreen's
// orgStepSkipped when skipped).
function userDoc(person, uid, orgIds, pinHash) {
  const d = {
    uid,
    email: person.email,
    fullName: person.fullName,
    username: person.username,
    country: 'Canada',
    role: person.role,
    createdAt: CREATED_AT,
    pinHash,
  };
  if (person.org) d.orgId = orgIds[person.org];
  else d.orgStepSkipped = true;
  return d;
}

// functions/index.js createOrganization's org doc.
function orgDoc(org, creatorUid) {
  return {
    name: org.name,
    type: org.type,
    province: org.province,
    city: org.city,
    isPersonal: false,
    createdBy: creatorUid,
    adminId: creatorUid,
    createdAt: CREATED_AT,
  };
}

// AddResidentScreen handleCreate, plus the preferredName / hasLifeStory
// copies saveResidentProfile keeps on the resident after a life story save.
function residentDoc(r, uidOf, orgIds) {
  const creatorUid = uidOf[r.creator];
  const d = {
    name: r.name,
    caregiverId: creatorUid,
    createdBy: creatorUid,
    facilityId: orgIds[r.org],
    assignedCaregivers: [creatorUid, ...r.assigned.map((id) => uidOf[id])],
    createdAt: CREATED_AT,
    hasLifeStory: !!r.lifeStory,
    musicProvider: 'youtube',
  };
  if (r.lifeStory) d.preferredName = r.lifeStory.preferredName ?? null;
  return d;
}

// Backdated activitySessions, in utils/activitySessions.js buildSessionDoc's
// exact shape. Guest visits have residentId null and isGuest true, which is
// what keeps them out of any one resident's stats.
function buildSessions(orgKey, orgId, uidOf, roleOf, rand) {
  const residents = RESIDENTS.filter((r) => r.org === orgKey);
  const sessions = [];
  const days = 21;
  for (let day = days; day >= 1; day -= 1) {
    const perDay = orgKey === 'A' ? 4 + Math.floor(rand() * 6) : 1 + Math.floor(rand() * 2);
    for (let n = 0; n < perDay; n += 1) {
      const logger = pickWeighted(rand, LOGGERS[orgKey]);
      const role = roleOf[logger.id];
      let resident = null;
      if (role === 'Family Caregiver') {
        // Family members only see (and so only run sessions for) linked residents.
        const linked = residents.filter((r) => r.assigned.includes(logger.id));
        resident = pickWeighted(rand, linked);
      } else if (rand() >= GUEST_SHARE) {
        resident = pickWeighted(rand, residents);
      }
      const activity = pickWeighted(rand, ACTIVITIES);
      const minutes = activity.minMin + rand() * (activity.maxMin - activity.minMin);
      const durationSeconds = Math.max(10, Math.round(minutes * 60));
      // Daytime visits, 9:00–18:00 local-ish, on that day.
      const dayStart = new Date(NOW - day * DAY_MS);
      dayStart.setHours(9, 0, 0, 0);
      const startedAt = new Date(dayStart.getTime() + Math.floor(rand() * 9 * 60) * 60 * 1000);
      const endedAt = new Date(startedAt.getTime() + durationSeconds * 1000);
      const isGame = activity.activityType === 'game';
      const roundsStarted = isGame ? 1 + Math.floor(rand() * 5) : 0;
      const roundsCompleted = isGame ? Math.max(0, roundsStarted - Math.floor(rand() * 2)) : 0;
      sessions.push({
        facilityId: orgId,
        residentId: resident ? resident.docId : null,
        isGuest: !resident,
        activityType: activity.activityType,
        activityId: activity.activityId,
        difficulty: isGame ? DIFFICULTIES[Math.floor(rand() * DIFFICULTIES.length)] : null,
        roundsStarted,
        roundsCompleted,
        startedAt,
        endedAt,
        durationSeconds,
        userId: uidOf[logger.id],
        userRole: role,
      });
    }
  }
  return sessions;
}

// ---------------------------------------------------------------------------
// Output: the login table, printed and written to docs/TESTING.md.
// ---------------------------------------------------------------------------

function loginRows(uidOf) {
  const nameOf = Object.fromEntries(RESIDENTS.map((r) => [r.id, r.name]));
  return PEOPLE.map((p) => {
    const linked =
      p.role === 'Family Caregiver'
        ? RESIDENTS.filter((r) => r.assigned.includes(p.id))
            .map((r) => nameOf[r.id])
            .join(', ') || '—'
        : '';
    return {
      Org: p.org ? ORGS[p.org].name : '(none)',
      Role: p.role,
      'Display name': p.fullName,
      Email: p.email,
      Username: p.username,
      'Approval status': p.intendedStatus,
      'Linked residents (for family)': linked,
      uid: uidOf[p.id],
    };
  });
}

function markdownTable(rows, columns) {
  const esc = (v) => String(v ?? '').replace(/\|/g, '\\|');
  return [
    `| ${columns.join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${columns.map((c) => esc(r[c])).join(' | ')} |`),
  ].join('\n');
}

function testingMarkdown(rows, codes) {
  const columns = [
    'Org',
    'Role',
    'Display name',
    'Email',
    'Username',
    'Approval status',
    'Linked residents (for family)',
  ];
  const residentList = RESIDENTS.map(
    (r) =>
      `- **${r.name}** (${ORGS[r.org].name}) — ${
        !r.lifeStory
          ? 'no life story'
          : Object.keys(r.lifeStory).length >= 20
            ? 'full life story'
            : Object.keys(r.lifeStory).length <= 1
              ? 'nearly empty life story'
              : 'partial life story'
      }${r.topicsToAvoid ? ', has topics to avoid' : ''}`
  ).join('\n');

  return `# Testing with seeded organizations

Generated by \`scripts/seed-test-org.js\` on ${new Date(NOW).toISOString().slice(0, 10)}. Re-running the seed
regenerates this file (the join codes change each time).

All people and residents below are fictional. Emails use the reserved
\`@${TEST_EMAIL_DOMAIN}\` domain and can't receive mail.

**Password and PIN:** every account shares one password and one PIN, taken from the
\`WELICARE_TEST_PASSWORD\` and \`WELICARE_TEST_PIN\` environment variables when the seed
was run. They are deliberately not written here or in any committed file.

## Join codes

| Org | Join code |
| --- | --- |
| ${ORGS.A.name} | \`${codes.A}\` |
| ${ORGS.B.name} | \`${codes.B}\` |

## Accounts

${markdownTable(rows, columns)}

## Residents

${residentList}

About 3 weeks of backdated Resident Mode activity sessions exist for both orgs (mostly Org A),
logged by caregivers, volunteers, an administrator and linked family members, with roughly
15% run in Guest Mode.

## Known gaps in the seed (the app has no field for these)

- **Approval status.** The app has no approval step or approval field: anyone who joins with a
  code is an active member straight away. \`caregiver3\` and \`volunteer2\` were *meant* to be
  pending, but are ordinary active members.
- **Dementia stage, mobility, dietary notes.** Residents have no such fields. Profiles differ
  through the life story questionnaire and the "topics to avoid" safety notes instead.

## End-to-end checklist

> **Isolation and permissions must be tested by signing in to the app.** The seed and teardown
> scripts use the Firebase Admin SDK, which bypasses \`firestore.rules\` entirely — so nothing
> the scripts can read proves what a real user can see.

- [ ] **Admin approval flow** — *blocked: the app has no approval step (see above).* Intended
      test once it exists: sign in as \`caregiver3\` (should be held as pending), sign in as
      \`admin1\` and approve them, then sign back in as \`caregiver3\` and reach Caregiver Mode.
- [ ] **Family view-only restrictions** — as \`family1\`: only Margaret Thornbury and Evelyn
      Castellanos-Mayhew are visible; "Select from organization" is not offered; no other Maple
      Grove residents appear; the resident profile photo can't be changed; safety notes are
      read-only; Overall Stats / organization settings aren't reachable.
- [ ] **Volunteer activity logging** — as \`volunteer1\`: run a Resident Mode activity for a
      resident for at least 10 seconds, then confirm it shows up in the Hour Tracker and in the
      resident's stats (as a caregiver). Life stories are hidden unless the org turns on
      "Volunteers can view life stories".
- [ ] **Guest Mode doesn't attribute time to a resident** — as \`caregiver1\` or \`volunteer1\`,
      run an activity in Guest Mode for 10+ seconds. It should count toward the staff member's
      hours but not change any resident's stats.
- [ ] **Resident Mode PIN exit** — enter Resident Mode on a resident, try to leave, and confirm
      the shared test PIN is required (and a wrong PIN keeps the lock).
- [ ] **Family member with no org joins by code** — sign in as \`family3\`, open organization
      settings, join with Org A's code (\`${codes.A}\`). Afterwards they see *no* residents
      until linked to one (family members never see the whole facility).
- [ ] **Cross-org isolation** — as \`cedar-admin1\` / \`cedar-caregiver1\`: no Maple Grove
      residents, stats, members, library entries or activity log appear. As \`admin1\` /
      \`caregiver1\`: no Cedar House data appears. Also try Org B's join code while signed in
      as an Org A member — it should be refused.

## Running the seed and teardown (Windows)

Keep the service account key outside git, e.g. \`secrets\\welicare-service-account.json\`
(\`secrets/\`, \`*service-account*.json\` and \`.env\` are in \`.gitignore\`). Create a \`.env\`
in the project root:

\`\`\`
GOOGLE_APPLICATION_CREDENTIALS=secrets\\welicare-service-account.json
WELICARE_TEST_PASSWORD=<choose one: 8+ chars, upper, lower, digit, symbol>
WELICARE_TEST_PIN=<4 digits>
\`\`\`

Then:

\`\`\`
npm run seed:test-org
npm run teardown:test-org
npm run teardown:test-org -- --confirm
\`\`\`

The first teardown command only lists what would be deleted; \`--confirm\` deletes it.
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!PASSWORD || !PIN) {
    console.error('Set WELICARE_TEST_PASSWORD and WELICARE_TEST_PIN (see docs/TESTING.md).');
    process.exit(1);
  }
  const problems = passwordProblems(PASSWORD);
  if (problems.length) {
    console.error(`WELICARE_TEST_PASSWORD must have: ${problems.join(', ')}.`);
    process.exit(1);
  }
  if (!/^\d{4}$/.test(PIN)) {
    console.error('WELICARE_TEST_PIN must be exactly 4 digits.');
    process.exit(1);
  }

  const { db, auth } = initAdmin();

  // Refuse to seed twice: two "TEST Maple Grove Care" orgs, or accounts
  // whose password no longer matches, would make the tests confusing.
  const existingOrgs = await db
    .collection('organizations')
    .where('name', '>=', TEST_ORG_PREFIX)
    .where('name', '<', TEST_ORG_PREFIX + '')
    .get();
  const existingEmails = [];
  for (const p of PEOPLE) {
    try {
      await auth.getUserByEmail(p.email);
      existingEmails.push(p.email);
    } catch (e) {
      if (e.code !== 'auth/user-not-found') throw e;
    }
  }
  if (!existingOrgs.empty || existingEmails.length) {
    console.error(
      'Test data already exists ' +
        `(${existingOrgs.size} TEST org(s), ${existingEmails.length} test account(s)).\n` +
        'Run `npm run teardown:test-org -- --confirm` first.'
    );
    process.exit(1);
  }

  // 1. Auth accounts, already verified (as if the email link was clicked).
  const uidOf = {};
  const roleOf = {};
  for (const p of PEOPLE) {
    const user = await auth.createUser({ email: p.email, password: PASSWORD, emailVerified: true });
    uidOf[p.id] = user.uid;
    roleOf[p.id] = p.role;
    console.log(`Created account ${p.email}`);
  }

  // 2. Firestore. Collected first, then committed in batches of <= 500.
  const writes = [];
  const set = (ref, data) => writes.push({ ref, data });
  const pinHash = hashPin(PIN);

  const orgIds = {};
  const codes = {};
  for (const org of Object.values(ORGS)) {
    const ref = db.collection('organizations').doc();
    orgIds[org.key] = ref.id;
    const creatorUid = uidOf[org.creator];
    set(ref, orgDoc(org, creatorUid));
    // Invite code, as createOrganization's writeInviteCode stores it. `uses`
    // counts the members who (notionally) joined with it — everyone but the
    // creator, like joinOrganization's increment. A collision with an
    // existing code is vanishingly unlikely, but it's checked anyway, as
    // pickFreeInviteCode does.
    let code;
    do {
      code = randomInviteCode();
    } while ((await db.doc(`inviteCodes/${code}`).get()).exists);
    codes[org.key] = code;
    const joined = PEOPLE.filter((p) => p.org === org.key && p.id !== org.creator).length;
    set(db.doc(`inviteCodes/${code}`), {
      orgId: ref.id,
      createdBy: creatorUid,
      createdAt: CREATED_AT,
      revoked: false,
      uses: joined,
    });
    set(db.doc(`organizations/${ref.id}/private/invite`), { code, updatedAt: CREATED_AT });
  }

  for (const p of PEOPLE) {
    set(db.doc(`users/${uidOf[p.id]}`), userDoc(p, uidOf[p.id], orgIds, pinHash));
    // SignUpScreen's username claim: only { uid }, keyed by the lowercase name.
    set(db.doc(`usernames/${normalizeUsername(p.username)}`), { uid: uidOf[p.id] });
  }

  for (const r of RESIDENTS) {
    const ref = db.collection('residents').doc();
    r.docId = ref.id;
    set(ref, residentDoc(r, uidOf, orgIds));
    if (r.lifeStory) {
      set(ref.collection('private').doc('lifeStory'), { ...EMPTY_LIFE_STORY, ...r.lifeStory });
    }
    if (r.topicsToAvoid) {
      // ResidentSafetyScreen's saveTopicsToAvoid, saved by the creator.
      set(ref.collection('private').doc('safety'), {
        topicsToAvoid: r.topicsToAvoid,
        updatedAt: CREATED_AT,
        updatedBy: uidOf[r.creator],
      });
    }
  }

  const rand = makeRandom(20260929);
  let sessionCount = 0;
  for (const org of Object.values(ORGS)) {
    for (const s of buildSessions(org.key, orgIds[org.key], uidOf, roleOf, rand)) {
      set(db.collection('activitySessions').doc(), s);
      sessionCount += 1;
    }
  }

  for (let i = 0; i < writes.length; i += 500) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + 500)) batch.set(w.ref, w.data);
    await batch.commit();
  }
  console.log(
    `\nWrote ${writes.length} Firestore documents ` +
      `(${RESIDENTS.length} residents, ${sessionCount} activity sessions).\n`
  );

  // 3. Login table (console + docs/TESTING.md).
  const rows = loginRows(uidOf);
  console.table(
    rows.map(({ uid: _uid, ...row }) => row),
    [
      'Org',
      'Role',
      'Display name',
      'Email',
      'Username',
      'Approval status',
      'Linked residents (for family)',
    ]
  );
  console.log(`\nJoin codes: ${ORGS.A.name} = ${codes.A}   ${ORGS.B.name} = ${codes.B}`);
  console.log('Password / PIN: the values of WELICARE_TEST_PASSWORD / WELICARE_TEST_PIN.');

  const docsDir = path.join(__dirname, '..', 'docs');
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(path.join(docsDir, 'TESTING.md'), testingMarkdown(rows, codes));
  console.log('\nWrote docs/TESTING.md');
}

main().catch((e) => {
  console.error(e);
  console.error(
    '\nSeeding stopped part-way. Run `npm run teardown:test-org -- --confirm` to clean up.'
  );
  process.exit(1);
});
