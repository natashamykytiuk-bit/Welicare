// Signup and activation numbers, read from data the app already stores —
// no tracking SDK and no extra writes. Prints counts only: no names, emails,
// uids or anything about residents beyond how many were added.
//
// Per week (last 8, weeks starting Monday, UTC):
//   signups by role      users/{uid}.createdAt + role
//   orgs created         organizations/{id}.createdAt
//   residents added      residents/{id}.createdAt
// Plus, for the last 7 days: how many people and organizations ran at least
// one resident activity (activitySessions.startedAt) — the activation signal.
//
// Test data from scripts/seed-test-org.js ("TEST …" orgs and
// @welicare-test.example accounts) is left out.
//
//   npm run metrics   (GOOGLE_APPLICATION_CREDENTIALS set, as for the seed scripts)

const { initAdmin, TEST_EMAIL_DOMAIN, TEST_ORG_PREFIX } = require('./testOrgAdmin');

const WEEKS = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

// Monday (UTC) of the week a date falls in, as YYYY-MM-DD.
function weekOf(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

async function main() {
  const { db } = initAdmin();
  const since = new Date(Date.now() - WEEKS * 7 * DAY_MS);
  const lastWeek = new Date(Date.now() - 7 * DAY_MS);

  // Test orgs are found by name so their members, residents and sessions
  // can be skipped below.
  const orgs = await db.collection('organizations').select('name', 'createdAt').get();
  const testOrgs = new Set(
    orgs.docs.filter((d) => (d.get('name') ?? '').startsWith(TEST_ORG_PREFIX)).map((d) => d.id)
  );
  const isTestUser = (d) =>
    testOrgs.has(d.get('orgId')) ||
    (d.get('email') ?? '').toLowerCase().endsWith(`@${TEST_EMAIL_DOMAIN}`);

  // shortcut: reads the whole users/residents collections (select() keeps it
  // to a few fields); move to count() aggregations past ~50k docs.
  const [users, residents, sessions] = await Promise.all([
    db
      .collection('users')
      .where('createdAt', '>=', since)
      .select('createdAt', 'role', 'orgId', 'email')
      .get(),
    db
      .collection('residents')
      .where('createdAt', '>=', since)
      .select('createdAt', 'facilityId')
      .get(),
    db
      .collection('activitySessions')
      .where('startedAt', '>=', lastWeek)
      .select('userId', 'facilityId')
      .get(),
  ]);

  // rows[week] = { 'signup:<role>': n, orgs: n, residents: n }
  const rows = {};
  const bump = (date, key) => {
    const w = weekOf(date);
    rows[w] ??= {};
    rows[w][key] = (rows[w][key] ?? 0) + 1;
  };
  for (const d of users.docs) {
    if (!isTestUser(d)) bump(d.get('createdAt').toDate(), `signup:${d.get('role') ?? 'unknown'}`);
  }
  for (const d of orgs.docs) {
    const at = d.get('createdAt')?.toDate();
    if (at && at >= since && !testOrgs.has(d.id)) bump(at, 'orgs');
  }
  for (const d of residents.docs) {
    if (!testOrgs.has(d.get('facilityId'))) bump(d.get('createdAt').toDate(), 'residents');
  }

  console.log('Week of      | signups by role                          | orgs | residents');
  for (const w of Object.keys(rows).sort()) {
    const r = rows[w];
    const signups = Object.keys(r)
      .filter((k) => k.startsWith('signup:'))
      .map((k) => `${k.slice(7)} ${r[k]}`)
      .join(', ');
    console.log(
      `${w}   | ${(signups || '-').padEnd(40)} | ${String(r.orgs ?? 0).padStart(4)} | ${r.residents ?? 0}`
    );
  }

  // Distinct ids are counted in memory and never printed.
  const real = sessions.docs.filter((d) => !testOrgs.has(d.get('facilityId')));
  const activeUsers = new Set(real.map((d) => d.get('userId'))).size;
  const activeOrgs = new Set(real.map((d) => d.get('facilityId')).filter(Boolean)).size;
  console.log(
    `\nLast 7 days: ${activeUsers} people in ${activeOrgs} organizations ran a resident activity.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
