// Removes the test data made by scripts/seed-test-org.js — and nothing else.
//
// What counts as test data:
//   - organizations whose name starts with "TEST", and everything belonging
//     to them: their members' users docs, username reservations and Auth
//     accounts; their residents (with the private/ and photos/ subcollection
//     docs); their activitySessions; their invite codes (inviteCodes/{code}
//     and the org's private/invite); their auditLog entries; the org doc.
//   - as a safety net, any account whose email ends in
//     @welicare-test.example (e.g. the family member with no org), with its
//     users doc and username reservation.
//
// Dry run by default: it lists everything it would delete and stops.
//
//   npm run teardown:test-org                  # list only
//   npm run teardown:test-org -- --confirm     # actually delete
//
// Photo files in Cloud Storage are not touched (the seed uploads none).

const { initAdmin, TEST_EMAIL_DOMAIN, TEST_ORG_PREFIX } = require('./testOrgAdmin');

const confirm = process.argv.includes('--confirm');
const isTestEmail = (email) => !!email && email.toLowerCase().endsWith(`@${TEST_EMAIL_DOMAIN}`);

async function main() {
  const { db, auth } = initAdmin();

  // Range query for names starting with the prefix, then an exact
  // startsWith check so nothing outside it can slip in.
  const orgSnap = await db
    .collection('organizations')
    .where('name', '>=', TEST_ORG_PREFIX)
    .where('name', '<', TEST_ORG_PREFIX + '')
    .get();
  const orgs = orgSnap.docs.filter((d) => String(d.data().name).startsWith(TEST_ORG_PREFIX));

  /** Document refs to delete, grouped for the printout. */
  const plan = {
    organizations: [],
    users: [],
    usernames: [],
    residents: [],
    activitySessions: [],
    inviteCodes: [],
    auditLog: [],
  };
  const residentSubdocs = [];
  const uids = new Map(); // uid -> email (for the printout)

  for (const org of orgs) {
    const orgId = org.id;
    const [members, pending, residents, sessions, invites, audit, orgPrivate] = await Promise.all([
      db.collection('users').where('orgId', '==', orgId).get(),
      // People still waiting for approval to join (pendingOrgId).
      db.collection('users').where('pendingOrgId', '==', orgId).get(),
      db.collection('residents').where('facilityId', '==', orgId).get(),
      db.collection('activitySessions').where('facilityId', '==', orgId).get(),
      db.collection('inviteCodes').where('orgId', '==', orgId).get(),
      db.collection('auditLog').where('orgId', '==', orgId).get(),
      org.ref.collection('private').get(),
    ]);
    plan.organizations.push({ ref: org.ref, label: `${org.data().name} (${orgId})` });
    for (const d of orgPrivate.docs)
      plan.organizations.push({ ref: d.ref, label: `  ${d.ref.path}` });
    for (const m of [...members.docs, ...pending.docs]) uids.set(m.id, m.data().email ?? '');
    for (const r of residents.docs) {
      plan.residents.push({ ref: r.ref, label: `${r.data().name} (${r.id})` });
      // Subcollections aren't removed with their parent, so list them too.
      for (const sub of ['private', 'photos']) {
        const s = await r.ref.collection(sub).get();
        for (const d of s.docs) residentSubdocs.push({ ref: d.ref, label: `  ${d.ref.path}` });
      }
    }
    for (const s of sessions.docs) plan.activitySessions.push({ ref: s.ref, label: s.id });
    for (const i of invites.docs) plan.inviteCodes.push({ ref: i.ref, label: i.id });
    for (const a of audit.docs) plan.auditLog.push({ ref: a.ref, label: a.id });
  }
  plan.residents.push(...residentSubdocs);

  // Safety net: every Auth account on the test domain, even with no org.
  const authUsers = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) if (isTestEmail(u.email)) uids.set(u.uid, u.email);
    pageToken = page.pageToken;
  } while (pageToken);

  for (const [uid, email] of uids) {
    const userRef = db.doc(`users/${uid}`);
    if ((await userRef.get()).exists) plan.users.push({ ref: userRef, label: `${email} (${uid})` });
    const names = await db.collection('usernames').where('uid', '==', uid).get();
    for (const n of names.docs) plan.usernames.push({ ref: n.ref, label: n.id });
    try {
      await auth.getUser(uid);
      authUsers.push({ uid, email });
    } catch (e) {
      if (e.code !== 'auth/user-not-found') throw e;
    }
  }

  // A member of a TEST org whose email is NOT on the test domain would be a
  // real person who joined with a test code. Their data is still in scope
  // (it belongs to the TEST org), but call it out loudly.
  const outsiders = [...uids.values()].filter((email) => !isTestEmail(email));

  // --- Printout ---
  for (const [group, items] of Object.entries(plan)) {
    console.log(`\n${group} (${items.length})`);
    for (const item of items) console.log(`  ${item.label}`);
  }
  console.log(`\nAuth accounts (${authUsers.length})`);
  for (const u of authUsers) console.log(`  ${u.email} (${u.uid})`);
  if (outsiders.length) {
    console.log(
      `\nWARNING: ${outsiders.length} member(s) of a TEST org are not @${TEST_EMAIL_DOMAIN}:`
    );
    for (const email of outsiders) console.log(`  ${email || '(no email)'}`);
  }

  const total = Object.values(plan).reduce((n, items) => n + items.length, 0);
  if (!confirm) {
    console.log(
      `\nDry run: would delete ${total} documents and ${authUsers.length} accounts. Re-run with --confirm.`
    );
    return;
  }

  // Children before parents is not required by Firestore, but deleting the
  // org last means a half-finished run can simply be re-run: the org (and so
  // the whole plan) is still findable.
  const refs = Object.entries(plan)
    .filter(([group]) => group !== 'organizations')
    .flatMap(([, items]) => items.map((i) => i.ref))
    .concat([...plan.organizations].reverse().map((i) => i.ref));
  for (let i = 0; i < refs.length; i += 500) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + 500)) batch.delete(ref);
    await batch.commit();
  }
  for (let i = 0; i < authUsers.length; i += 1000) {
    await auth.deleteUsers(authUsers.slice(i, i + 1000).map((u) => u.uid));
  }
  console.log(`\nDeleted ${total} documents and ${authUsers.length} accounts.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
