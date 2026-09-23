// Grants (or revokes) "planning access" — the `allModes` custom claim that
// makes ModeSelectionScreen show every mode card (Family, Caregiver,
// Volunteer, Admin) regardless of the account's role. Meant for the
// developer's own account while designing/testing the app.
//
// Run from the repo root with Application Default Credentials
// (`gcloud auth application-default login`), same as the other scripts:
//
//   node scripts/setAllModesAccess.js you@example.com          # grant
//   node scripts/setAllModesAccess.js you@example.com --revoke # revoke
//
// Other existing custom claims on the account are preserved. The person
// has to sign out and back in (or wait up to an hour for their token to
// refresh) before the change shows in the app.
const admin = require('../functions/node_modules/firebase-admin');

async function main() {
  const [email, flag] = process.argv.slice(2);
  if (!email) {
    console.error('Usage: node scripts/setAllModesAccess.js <email> [--revoke]');
    process.exit(1);
  }
  admin.initializeApp({ projectId: 'welicare' });
  const user = await admin.auth().getUserByEmail(email);
  const claims = { ...(user.customClaims ?? {}) };
  if (flag === '--revoke') delete claims.allModes;
  else claims.allModes = true;
  await admin.auth().setCustomUserClaims(user.uid, claims);
  console.log(`${flag === '--revoke' ? 'Revoked' : 'Granted'} all-modes access for ${email} (uid ${user.uid}).`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
