// One-off migration: removes the `email` field from every usernames/{name}
// doc. Those docs are publicly readable (for username availability checks),
// so storing emails there exposed every account's email address. Sign-in by
// username now asks the resolveSignInEmail Cloud Function, which reads the
// email from Firebase Auth instead.
//
// Uses Firestore's REST API with `gcloud auth print-access-token` (see
// migrateInviteCodes.js for why not the Admin SDK).
//
//   node scripts/migrateUsernames.js            # dry run — changes nothing
//   node scripts/migrateUsernames.js --apply    # remove the emails
//
// Safe to re-run. If FIRESTORE_EMULATOR_HOST is set it talks to the
// emulator instead (used by tests), never to production.

async function migrateUsernames({ baseUrl, token, apply }) {
  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${await res.text()}`);
    return res.json();
  }

  const docs = [];
  let pageToken = '';
  do {
    const page = await api(
      'GET',
      `${baseUrl}/usernames?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`
    );
    docs.push(...(page?.documents ?? []));
    pageToken = page?.nextPageToken ?? '';
  } while (pageToken);

  let cleaned = 0;
  for (const d of docs) {
    if (!('email' in (d.fields ?? {}))) continue;
    const name = d.name.split('/').pop();
    // The username itself isn't sensitive, but keep logs free of it anyway.
    console.log(`username #${cleaned + 1}: removing stored email`);
    if (apply) {
      // Naming a field in updateMask without sending a value deletes it.
      await api(
        'PATCH',
        `${baseUrl}/usernames/${encodeURIComponent(name)}?updateMask.fieldPaths=email`,
        {
          fields: {},
        }
      );
    }
    cleaned += 1;
  }
  console.log(
    `${apply ? 'Removed' : 'Would remove'} ${cleaned} stored email(s) of ${docs.length} username(s).`
  );
  return { cleaned, total: docs.length };
}

module.exports = { migrateUsernames };

if (require.main === module) {
  const apply = process.argv.includes('--apply');
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  const projectId = emulator ? 'demo-welicare' : process.env.GCLOUD_PROJECT || 'welicare';
  const baseUrl = emulator
    ? `http://${emulator}/v1/projects/${projectId}/databases/(default)/documents`
    : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const token = emulator
    ? 'owner'
    : require('child_process')
        .execSync('gcloud auth print-access-token', { encoding: 'utf8' })
        .trim();
  migrateUsernames({ baseUrl, token, apply }).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
