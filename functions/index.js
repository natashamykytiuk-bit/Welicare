const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');
const youtubeApiKey = defineSecret('YOUTUBE_API_KEY');

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

function isEmpty(value) {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

function buildFactLines(lifeStory) {
  const lines = [];
  for (const [key, label] of FIELD_LABELS) {
    if (!isEmpty(lifeStory[key])) lines.push(`- ${label}: ${lifeStory[key]}`);
  }
  if (lifeStory.hasChildren) {
    lines.push(`- Children: ${lifeStory.childrenDetails || 'Yes'}`);
  }
  if (lifeStory.hasGrandchildren) {
    lines.push(`- Grandchildren: ${lifeStory.grandchildrenDetails || 'Yes'}`);
  }
  if (!isEmpty(lifeStory.hobbies)) {
    const detail = lifeStory.hobbies.includes('Other') && lifeStory.hobbiesOtherDetail
      ? [...lifeStory.hobbies.filter((h) => h !== 'Other'), lifeStory.hobbiesOtherDetail]
      : lifeStory.hobbies;
    lines.push(`- Hobbies: ${detail.join(', ')}`);
  }
  if (!isEmpty(lifeStory.creativeHobbies)) {
    const detail = lifeStory.creativeHobbies.includes('Other') && lifeStory.creativeHobbiesOtherDetail
      ? [...lifeStory.creativeHobbies.filter((h) => h !== 'Other'), lifeStory.creativeHobbiesOtherDetail]
      : lifeStory.creativeHobbies;
    lines.push(`- Creative hobbies: ${detail.join(', ')}`);
  }
  if (!isEmpty(lifeStory.musicGenres)) {
    const detail = lifeStory.musicGenres.includes('Other') && lifeStory.musicGenresOtherDetail
      ? [...lifeStory.musicGenres.filter((g) => g !== 'Other'), lifeStory.musicGenresOtherDetail]
      : lifeStory.musicGenres;
    lines.push(`- Favourite music: ${detail.join(', ')}`);
  }
  return lines;
}

function buildPrompt(kind, lifeStory) {
  const phrase = KIND_PHRASES[kind] ?? 'suggestions';
  const factLines = lifeStory ? buildFactLines(lifeStory) : [];

  if (factLines.length === 0) {
    return `Please generate warm, general ${phrase} suggestions appropriate for an elderly person in a care setting. No specific personal information is available for this person.`;
  }

  return [
    'Here is what we know about this person:',
    ...factLines,
    '',
    `Based on this, please generate ${phrase} that are specifically tailored to this person. If limited information is available, use what is provided and make warm, general suggestions appropriate for an elderly person in a care setting.`,
  ].join('\n');
}

// Redeployed to repair a missing public-invoker IAM binding on the
// underlying Cloud Run service, left over from a failed first deploy.
exports.generateSuggestions = onCall({ secrets: [anthropicApiKey] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  const { kind, lifeStory } = request.data ?? {};
  if (!KIND_PHRASES[kind]) {
    throw new HttpsError('invalid-argument', 'kind must be one of activityIdeas, conversationStarters, musicMovieRecs.');
  }

  const prompt = buildPrompt(kind, lifeStory);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': anthropicApiKey.value(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new HttpsError('internal', `Anthropic API error: ${errorText}`);
  }

  const data = await response.json();
  const text = data.content?.map((block) => block.text).join('\n') ?? '';
  return { text };
});

// Server-side YouTube search so the API key never ships in the app — same
// reasoning as generateSuggestions and Anthropic. Shared by both Music and
// Movies & Videos; category picks the filtering behavior for each.
exports.searchYouTube = onCall({ secrets: [youtubeApiKey] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  const query = typeof request.data?.query === 'string' ? request.data.query.trim() : '';
  if (!query) {
    throw new HttpsError('invalid-argument', 'query must be a non-empty string.');
  }

  const category = request.data?.category === 'video' ? 'video' : 'music';

  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    maxResults: '10',
    q: query,
    key: youtubeApiKey.value(),
  });
  // videoCategoryId=10 scopes Music results so an artist's name doesn't
  // surface interviews, news clips, etc. There's no equivalently reliable
  // category for older films/TV clips — videoCategoryId=1 (Film &
  // Animation) is inconsistently tagged and would exclude a lot of
  // legitimate results — so 'video' search omits the category filter
  // entirely for better coverage.
  if (category === 'music') {
    params.set('videoCategoryId', '10');
  }

  const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new HttpsError('internal', `YouTube API error: ${errorText}`);
  }

  const data = await response.json();
  const results = (data.items ?? [])
    .filter((item) => item.id?.videoId)
    .slice(0, 10)
    .map((item) => ({
      videoId: item.id.videoId,
      title: item.snippet?.title ?? '',
      channelTitle: item.snippet?.channelTitle ?? '',
      thumbnailUrl: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? '',
    }));

  return { results };
});

// Lazily initialised so the existing functions (which never touch the Admin
// SDK) don't pay for it on cold start.
let adminApp = null;
function getAdmin() {
  const admin = require('firebase-admin');
  if (!adminApp) adminApp = admin.initializeApp();
  return admin;
}

// Other Administrators in `orgId`, excluding `uid`. "Administrator" means
// the role on each member's users doc — the same field ModeSelectionScreen
// branches on — not the org doc's createdBy/adminId, which is just the one
// admin allowed to edit the org's details.
async function otherAdmins(db, orgId, uid) {
  const snap = await db.collection('users').where('orgId', '==', orgId).where('role', '==', 'Administrator').get();
  return snap.docs.filter((d) => d.id !== uid);
}

// In-app account deletion, called from DeleteAccountScreen. Removes this
// person's own information; a real organization and its residents are
// shared data and stay (deleteOrganization removes those instead).
//
// - Sole administrator: refused with failed-precondition, so an
//   organization is never left with nobody to manage it. They have to
//   transfer the role first (transferOrgAdmin) or delete the org.
// - Org owner (createdBy/adminId) with other admins: ownership moves to
//   one of them, so someone can still edit the org's details.
// - Personal organization (a Family Caregiver's auto-created one): deleted
//   along with its residents, since nobody else could ever reach them.
//   Same for facility-less residents only this person looks after.
// - Every other resident: the caller is just removed from
//   assignedCaregivers. createdBy/caregiverId stay (they're historical).
// - Every usernames/* doc for this uid, the users doc, and finally the
//   Firebase Auth account.
//
// The client re-authenticates with the password before calling this, so a
// device left signed in can't be used to delete someone's account.
exports.deleteAccount = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  const uid = request.auth.uid;
  const admin = getAdmin();
  const db = admin.firestore();
  // Imported from the firestore subpath — admin.firestore.FieldValue is
  // undefined in firebase-admin v12's namespace export.
  const { FieldValue } = require('firebase-admin/firestore');

  const user = (await db.doc(`users/${uid}`).get()).data() ?? {};
  const orgId = user.orgId ?? null;
  const orgSnap = orgId ? await db.doc(`organizations/${orgId}`).get() : null;
  const org = orgSnap?.exists ? orgSnap.data() : null;
  const personalOrgId = org && org.isPersonal === true && org.createdBy === uid ? orgId : null;

  // Checked before anything is written, so a refusal leaves the account
  // exactly as it was.
  let newOwner = null;
  if (org && !personalOrgId) {
    const isOwner = org.createdBy === uid || org.adminId === uid;
    if (isOwner || user.role === 'Administrator') {
      const others = await otherAdmins(db, orgId, uid);
      if (others.length === 0) {
        throw new HttpsError(
          'failed-precondition',
          'You are the only administrator of this organization. Make someone else the administrator first.',
          { reason: 'sole-admin' }
        );
      }
      if (isOwner) newOwner = others[0].id;
    }
  }

  // Two queries because older residents are linked by createdBy only.
  const [created, assigned, personalResidents] = await Promise.all([
    db.collection('residents').where('createdBy', '==', uid).get(),
    db.collection('residents').where('assignedCaregivers', 'array-contains', uid).get(),
    personalOrgId
      ? db.collection('residents').where('facilityId', '==', personalOrgId).get()
      : Promise.resolve({ docs: [] }),
  ]);
  const inPersonalOrg = new Set(personalResidents.docs.map((d) => d.id));
  const residents = new Map();
  for (const snap of [...created.docs, ...assigned.docs, ...personalResidents.docs]) residents.set(snap.id, snap);

  // BulkWriter batches and retries on its own — no 500-op batch limit.
  const writer = db.bulkWriter();
  for (const snap of residents.values()) {
    const data = snap.data();
    const assignedList = Array.isArray(data.assignedCaregivers) ? data.assignedCaregivers : [];
    const others = assignedList.filter((id) => id !== uid);
    if (inPersonalOrg.has(snap.id) || (!data.facilityId && others.length === 0)) {
      writer.delete(snap.ref);
    } else if (assignedList.includes(uid)) {
      writer.update(snap.ref, { assignedCaregivers: FieldValue.arrayRemove(uid) });
    }
  }

  if (personalOrgId) writer.delete(db.doc(`organizations/${personalOrgId}`));
  if (newOwner) writer.update(db.doc(`organizations/${orgId}`), { createdBy: newOwner, adminId: newOwner });

  const usernames = await db.collection('usernames').where('uid', '==', uid).get();
  for (const snap of usernames.docs) writer.delete(snap.ref);

  writer.delete(db.doc(`users/${uid}`));
  await writer.close();

  // Last, so if anything above fails the person can still sign in and try
  // again rather than being left with half-cleaned data and no account.
  await admin.auth().deleteUser(uid);
  return { ok: true };
});

// Checks the caller owns `orgId` (createdBy/adminId) and is an
// Administrator. Every org-management function needs this because the
// Admin SDK bypasses firestore.rules, so they must authorise themselves.
async function requireOrgOwner(db, orgId, uid) {
  if (typeof orgId !== 'string' || !orgId) {
    throw new HttpsError('invalid-argument', 'orgId is required.');
  }
  const [orgSnap, userSnap] = await Promise.all([
    db.doc(`organizations/${orgId}`).get(),
    db.doc(`users/${uid}`).get(),
  ]);
  if (!orgSnap.exists) {
    throw new HttpsError('not-found', 'Organization not found.');
  }
  const org = orgSnap.data();
  if (!(org.createdBy === uid || org.adminId === uid) || userSnap.data()?.role !== 'Administrator') {
    throw new HttpsError('permission-denied', 'Only this organization\'s administrator can do this.');
  }
  return org;
}

// Members of the caller's organization, for OrganizationalSettingsScreen's
// "Transfer administrator" picker. A function rather than a client query
// because firestore.rules only let a user read their own users doc. Returns
// only what the picker shows — never emails or PIN hashes.
exports.listOrgMembers = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  const db = getAdmin().firestore();
  const orgId = request.data?.orgId;
  await requireOrgOwner(db, orgId, request.auth.uid);
  const snap = await db.collection('users').where('orgId', '==', orgId).get();
  return {
    members: snap.docs
      .filter((d) => d.id !== request.auth.uid)
      .map((d) => ({
        uid: d.id,
        name: d.data().fullName || d.data().username || 'Unnamed member',
        role: d.data().role ?? '',
      })),
  };
});

// Hands the organization to another member: they become its owner
// (createdBy/adminId, so they can edit or delete it) and get the
// Administrator role if they didn't have it. The previous owner keeps
// their Administrator role — they're just no longer the only admin, which
// is what lets deleteAccount go ahead for them afterwards.
exports.transferOrgAdmin = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  const db = getAdmin().firestore();
  const { orgId, newAdminUid } = request.data ?? {};
  await requireOrgOwner(db, orgId, request.auth.uid);
  const target = typeof newAdminUid === 'string' && newAdminUid ? await db.doc(`users/${newAdminUid}`).get() : null;
  if (!target?.exists || target.data().orgId !== orgId || newAdminUid === request.auth.uid) {
    throw new HttpsError('invalid-argument', 'That person is not a member of this organization.');
  }
  const batch = db.batch();
  batch.update(db.doc(`organizations/${orgId}`), { createdBy: newAdminUid, adminId: newAdminUid });
  batch.update(target.ref, { role: 'Administrator' });
  await batch.commit();
  return { ok: true };
});

// Deletes an organization and everything scoped to it, called from
// OrganizationalSettingsScreen. Server-side because the client can't do
// this under firestore.rules (e.g. clearing orgId on other members' user
// docs), and so a half-finished delete can't be left behind by a dropped
// connection mid-way through.
//
// Only the organization's own Administrator may call it — checked here
// against both the org doc (createdBy/adminId) and the caller's role, since
// the Admin SDK bypasses firestore.rules entirely.
//
// - Every resident with facilityId == this org is deleted, along with its
//   life story.
// - Every facility-scoped musicLibrary entry is deleted (the "global"
//   baseline is untouched — it's never scoped to an org).
// - orgId is cleared from every member's user doc, so on their next
//   sign-in App.js routes them to JoinCreateOrganization. Their accounts
//   themselves are kept.
exports.deleteOrganization = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  const orgId = request.data?.orgId;
  const admin = getAdmin();
  const db = admin.firestore();
  // Imported from the firestore subpath — admin.firestore.FieldValue is
  // undefined in firebase-admin v12's namespace export.
  const { FieldValue } = require('firebase-admin/firestore');
  await requireOrgOwner(db, orgId, request.auth.uid);

  const [residents, music, members] = await Promise.all([
    db.collection('residents').where('facilityId', '==', orgId).get(),
    db.collection('musicLibrary').where('facilityId', '==', orgId).get(),
    db.collection('users').where('orgId', '==', orgId).get(),
  ]);

  const writer = db.bulkWriter();
  for (const snap of residents.docs) writer.delete(snap.ref);
  for (const snap of music.docs) writer.delete(snap.ref);
  for (const snap of members.docs) writer.update(snap.ref, { orgId: FieldValue.delete() });
  // Org doc last, so a failure partway leaves it in place for a retry.
  await writer.close();
  await db.doc(`organizations/${orgId}`).delete();

  return { ok: true, residentsDeleted: residents.size, membersRemoved: members.size };
});
