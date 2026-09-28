// Shared by the admin/migration scripts in this folder: works out which
// Firebase project a script should act on, and refuses to guess.
//
// These scripts used to fall back to the live "welicare" project when
// nothing was specified, so a run meant for testing could quietly change
// real data. Now the project must be named on the command line:
//
//   node scripts/migrateUsernames.js --project welicare
//   node scripts/migrateUsernames.js --project=demo-welicare
//
// The one exception is the local emulator: when FIRESTORE_EMULATOR_HOST is
// set, "demo-welicare" (the emulator's project) is used unless another is
// named — it can't touch live data.

/**
 * @param {string[]} [argv] Defaults to process.argv.
 * @returns {string} The project id to use.
 */
function requireProject(argv = process.argv) {
  let projectId = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--project') projectId = argv[i + 1] ?? null;
    else if (argv[i].startsWith('--project=')) projectId = argv[i].slice('--project='.length);
  }
  if (!projectId && process.env.FIRESTORE_EMULATOR_HOST) projectId = 'demo-welicare';
  if (!projectId) {
    console.error(
      'Please say which Firebase project to use, e.g. --project welicare\n' +
        '(scripts no longer default to the live project).'
    );
    process.exit(1);
  }
  return projectId;
}

module.exports = { requireProject };
