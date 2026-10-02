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
const { requireProject } = require('./requireProject');
const path = require('path');
const fromFunctions = (id) =>
  require(require.resolve(id, { paths: [path.join(__dirname, '..', 'functions')] }));
const { initializeApp } = fromFunctions('firebase-admin/app');
const { FieldValue, getFirestore } = fromFunctions('firebase-admin/firestore');

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

// ---------------------------------------------------------------------------
// --rest mode: the same migration over Firestore's REST API, authenticated
// with the token `gcloud auth print-access-token` prints. Exists because on
// some Windows setups the Admin SDK's own Google sign-in fails with
// "Premature close" while gcloud itself works fine — this sidesteps the
// Admin SDK entirely and only uses Node's built-in fetch.
//
//   node scripts/migrateInviteCodes.js --rest            # dry run
//   node scripts/migrateInviteCodes.js --rest --apply    # migrate
// ---------------------------------------------------------------------------

// Minimal converters between plain values and Firestore REST "Value" JSON,
// covering just the types this migration reads and writes.
const toValue = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  return { stringValue: String(v) };
};
const fromValue = (v) =>
  v === undefined ? undefined : 'nullValue' in v ? null : (v.stringValue ?? v.booleanValue ?? v);
const toFields = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toValue(v)]));

async function migrateViaRest({ baseUrl, token, apply }) {
  // Every request carries the gcloud token; a non-OK reply (other than an
  // expected 404) stops the run with the server's message.
  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${await res.text()}`);
    return res.json();
  }

  // Page through every organization doc.
  const orgs = [];
  let pageToken = '';
  do {
    const page = await api(
      'GET',
      `${baseUrl}/organizations?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`
    );
    orgs.push(...(page?.documents ?? []));
    pageToken = page?.nextPageToken ?? '';
  } while (pageToken);

  let moved = 0;
  let conflicts = 0;
  for (const org of orgs) {
    const orgId = org.name.split('/').pop();
    const fields = org.fields ?? {};
    if (!('inviteCode' in fields)) continue; // already migrated
    const code = fromValue(fields.inviteCode);
    // PATCH with the field named in updateMask but absent from the body is
    // how the REST API deletes a single field.
    const dropField = () =>
      api('PATCH', `${baseUrl}/organizations/${orgId}?updateMask.fieldPaths=inviteCode`, {
        fields: {},
      });
    if (!code) {
      console.log(`${orgId}: no code, removing empty field`);
      if (apply) await dropField();
      continue;
    }
    const existing = await api('GET', `${baseUrl}/inviteCodes/${code}`);
    const existingOrg = existing ? fromValue(existing.fields?.orgId) : null;
    if (existing && existingOrg !== orgId) {
      console.log(`${orgId}: CONFLICT — code ${code} already belongs to ${existingOrg}; skipped`);
      conflicts += 1;
      continue;
    }
    console.log(`${orgId}: moving code ${code}`);
    if (apply) {
      if (!existing) {
        // documentId + POST creates the doc, and fails if it already exists.
        await api('POST', `${baseUrl}/inviteCodes?documentId=${encodeURIComponent(code)}`, {
          fields: toFields({
            orgId,
            createdBy: fromValue(fields.createdBy) ?? null,
            createdAt: new Date(),
            revoked: false,
            uses: 0,
          }),
        });
      }
      await api('PATCH', `${baseUrl}/organizations/${orgId}/private/invite`, {
        fields: toFields({ code, updatedAt: new Date() }),
      });
      await dropField();
    }
    moved += 1;
  }
  console.log(
    `${apply ? 'Migrated' : 'Would migrate'} ${moved} code(s); ${conflicts} conflict(s).`
  );
  return { moved, conflicts };
}

module.exports = { migrate, migrateViaRest };

if (require.main === module) {
  const apply = process.argv.includes('--apply');
  const projectId = requireProject();
  const run = process.argv.includes('--rest')
    ? () => {
        // gcloud prints a short-lived OAuth token for whoever is signed in
        // to gcloud; on Windows it's gcloud.cmd.
        const { execSync } = require('child_process');
        const token = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
        const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
        return migrateViaRest({ baseUrl, token, apply });
      }
    : () => {
        return migrate(getFirestore(initializeApp({ projectId })), { apply });
      };
  run().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
