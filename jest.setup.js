// Runs before every Jest test file (see "jest.setupFiles" in package.json).
// Swaps every Firebase module — and the app's own firebaseConfig.js, which
// would otherwise try to connect to the real project — for the shared mocks
// in tests/mocks/firebase.js.
//
// jest.mock factories can only reference variables whose names start with
// "mock", hence the require() inside each factory.

jest.mock('firebase/firestore', () => require('./tests/mocks/firebase').firestore);
jest.mock('firebase/auth', () => require('./tests/mocks/firebase').authModule);
jest.mock('firebase/functions', () => require('./tests/mocks/firebase').functionsModule);
jest.mock('./firebaseConfig', () => ({
  app: {},
  auth: require('./tests/mocks/firebase').auth,
  db: {},
  functions: {},
}));

// Icons render as a simple placeholder — tests care about behaviour, not
// glyphs, and this avoids font-loading noise.
jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  const Icon = ({ name }) => <Text>{`icon:${name}`}</Text>;
  return { Ionicons: Icon };
});

// Fresh mocks for every test, so tests can't affect each other.
beforeEach(() => {
  require('./tests/mocks/firebase').resetFirebaseMocks();
});
