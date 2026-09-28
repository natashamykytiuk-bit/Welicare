// One-off migration for Manage Volunteer Permissions: moves each resident's
// life story off the resident doc into its own private doc, so
// firestore.rules can keep it from volunteers (rules work per document and
// can't hide a single field):
//
//   residents/{id}.lifeStory  →  residents/{id}/private/lifeStory
//                                 residents/{id}.hasLifeStory   (true/false)
//                                 residents/{id}.preferredName  (if set)
//
// and then removes the old field. Until this has run, the app still reads
// the old field as a fallback — but volunteers can read it there too.
//
// Uses Firestore's REST API with the token `gcloud auth print-access-token`
// prints (the Admin SDK's own sign-in fails on some Windows setups — see
// migrateInviteCodes.js). Life story values are copied exactly as Firestore
// returns them, with no conversion.
//
//   node scripts/migrateLifeStories.js            # dry run — changes nothing
//   node scripts/migrateLifeStories.js --apply    # migrate
//
// Safe to re-run: residents without the old field are skipped, and an
// existing private life story (e.g. saved in the app since) is never
// overwritten — the stale old field is just removed.
//
// If FIRESTORE_EMULATOR_HOST is set it talks to the emulator instead (used
// by the tests), never to production.

// Mirrors hasAnyLifeStoryData (utils/lifeStory.js) on REST values: an answer
// counts unless it's null, an empty string, or an empty list.
function valueHasData(v) {
  if (!v || 'nullValue' in v) return false;
  if ('stringValue' in v) return v.stringValue !== '';
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).length > 0;
  return true;
}

async function migrateLifeStories({ baseUrl, token, apply }) {
  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 404) return null;
    // A failed "must not exist yet" precondition means someone already
    // saved a life story in the app — reported to the caller, not thrown.
    if (res.status === 400 || res.status === 409) {
      const text = await res.text();
      if (/exist/i.test(text)) return { alreadyExists: true };
      throw new Error(`${method} ${url} → ${res.status} ${text}`);
    }
    if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${await res.text()}`);
    return res.json();
  }

  const residents = [];
  let pageToken = '';
  do {
    const page = await api(
      'GET',
      `${baseUrl}/residents?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`
    );
    residents.push(...(page?.documents ?? []));
    pageToken = page?.nextPageToken ?? '';
  } while (pageToken);

  let moved = 0;
  let empty = 0;
  let keptNewer = 0;
  for (const resident of residents) {
    const id = resident.name.split('/').pop();
    const fields = resident.fields ?? {};
    if (!('lifeStory' in fields)) continue; // already migrated

    const storyFields = fields.lifeStory.mapValue?.fields ?? null;
    const hasStory = !!storyFields && Object.values(storyFields).some(valueHasData);
    const preferred = storyFields?.preferredName?.stringValue || null;

    // Fields to update on the resident. Listing lifeStory in the update mask
    // without a value is how the REST API deletes that field.
    const residentUpdate = { hasLifeStory: { booleanValue: hasStory } };
    const mask = ['lifeStory', 'hasLifeStory'];
    if (preferred && !fields.preferredName) {
      residentUpdate.preferredName = { stringValue: preferred };
      mask.push('preferredName');
    }

    if (!storyFields) {
      console.log(`${id}: empty life story — removing old field`);
      empty += 1;
    } else {
      console.log(`${id}: moving life story (${Object.keys(storyFields).length} answers)`);
    }

    if (apply) {
      if (storyFields) {
        // currentDocument.exists=false: create only, never overwrite a life
        // story someone saved in the app since.
        const result = await api(
          'PATCH',
          `${baseUrl}/residents/${id}/private/lifeStory?currentDocument.exists=false`,
          { fields: storyFields }
        );
        if (result?.alreadyExists) {
          console.log(`${id}: a newer life story is already saved — keeping it`);
          keptNewer += 1;
        }
      }
      const maskQuery = mask.map((m) => `updateMask.fieldPaths=${m}`).join('&');
      await api('PATCH', `${baseUrl}/residents/${id}?${maskQuery}`, { fields: residentUpdate });
    }
    if (storyFields) moved += 1;
  }
  console.log(
    `${apply ? 'Migrated' : 'Would migrate'} ${moved} life stor${moved === 1 ? 'y' : 'ies'}; ` +
      `${empty} empty; ${keptNewer} kept newer.`
  );
  return { moved, empty, keptNewer };
}

module.exports = { migrateLifeStories };

if (require.main === module) {
  const apply = process.argv.includes('--apply');
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  const projectId = emulator ? 'demo-welicare' : process.env.GCLOUD_PROJECT || 'welicare';
  const base = emulator
    ? `http://${emulator}/v1/projects/${projectId}/databases/(default)/documents`
    : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const token = emulator
    ? 'owner'
    : require('child_process')
        .execSync('gcloud auth print-access-token', { encoding: 'utf8' })
        .trim();
  migrateLifeStories({ baseUrl: base, token, apply }).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
