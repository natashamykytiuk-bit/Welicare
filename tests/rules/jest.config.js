// Jest config for the Firestore security-rules tests only (npm run
// test:rules). Kept separate from the app tests (package.json "jest"):
// these run in plain Node against the Firestore emulator, with no React
// Native preset and no Firebase mocks — the whole point is to exercise the
// real rules engine.
module.exports = {
  rootDir: '../..',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/rules/**/*.rules.test.js'],
  // The emulator can be slow to answer the first request on Windows.
  testTimeout: 30000,
};
