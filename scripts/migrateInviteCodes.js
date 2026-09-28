// One-off migration: moves each organization's invite code off the
// organization doc (which any signed-in user can fetch by id) into the
// server-only lookup table and the org's members-only private doc:
//
//   organizations/{orgId}.inviteCode   →  inviteCodes/{CODE} { orgId, … }
//                                         organizations/{orgId}/private/invite { code }
//
// and then removes the old field. Codes stay the same, so anyone holding an
// existing code can still join with it.
//
// Dry run by default — prints what it would do. Pass --apply to write.
// Uses Application Default Credentials, same as the other scripts:
//
//   node scripts/migrateInviteCodes.js            # dry run
//   node scripts/migrateInviteCodes.js --apply    # migrate
//
// Safe to re-run: orgs without an inviteCode field are skipped, and an
// existing inviteCodes/{CODE} doc for the same org is left as-is.
// firebase-admin is only installed under functions/, so resolve it (and
// its /firestore subpath export) from there.
const path = require('path');
const fromFunctions = (id) =>
  require(require.resolve(id, { paths: [path.join(__dirname, '..', 'functions')] }));
const admin = fromFunctions('firebase-admin');
const { FieldValue } = fromFunctions('firebase-admin/firestore');

async function migrate(db, { apply }) {
  const orgs = await db.collection('organizations').get();
  let moved = 0;
  let conflicts = 0;
  for (const org of orgs.docs) {
    const code = org.data().inviteCode;
    if (code === undefined) continue; // already migrated
    if (!code) {
      // Personal orgs carried inviteCode: null — just drop the field.
      console.log(`${org.id}: no code, removing empty field`);
      if (apply) await org.ref.update({ inviteCode: FieldValue.delete() });
      continue;
    }
    const codeRef = db.doc(`inviteCodes/${code}`);
    const existing = (await codeRef.get()).data();
    if (existing && existing.orgId !== org.id) {
      // Two orgs somehow shared a code. Leave this one alone and report it;
      // its admin can issue a fresh code from Organizational Settings.
      console.log(
        `${org.id}: CONFLICT — code ${code} already belongs to ${existing.orgId}; skipped`
      );
      conflicts += 1;
      continue;
    }
    console.log(`${org.id}: moving code ${code}`);
    if (apply) {
      if (!existing) {
        await codeRef.set({
          orgId: org.id,
          createdBy: org.data().createdBy ?? null,
          createdAt: FieldValue.serverTimestamp(),
          revoked: false,
          uses: 0,
        });
      }
      await org.ref
        .collection('private')
        .doc('invite')
        .set({ code, updatedAt: FieldValue.serverTimestamp() });
      await org.ref.update({ inviteCode: FieldValue.delete() });
    }
    moved += 1;
  }
  console.log(
    `${apply ? 'Migrated' : 'Would migrate'} ${moved} code(s); ${conflicts} conflict(s).`
  );
  return { moved, conflicts };
}

module.exports = { migrate };

if (require.main === module) {
  admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'welicare' });
  migrate(admin.firestore(), { apply: process.argv.includes('--apply') }).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
