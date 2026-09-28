// Jest config for the Cloud Functions tests (npm run test:functions). Like
// the rules tests, these run in plain Node against the emulators (Auth,
// Firestore and Functions under the demo-welicare project) — nothing is
// mocked, so they exercise the real functions/index.js code.
module.exports = {
  rootDir: '../..',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/functions/**/*.functions.test.js'],
  // Cold-starting a function in the emulator can take a few seconds.
  testTimeout: 60000,
};
