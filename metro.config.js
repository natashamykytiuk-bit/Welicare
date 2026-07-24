const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Metro's package.json "exports" resolution (default: true) resolves Firebase's
// Node bundle instead of its React Native bundle, breaking Firebase Auth
// (e.g. AsyncStorage persistence never gets wired up, auth calls fail with
// generic/unexpected error codes). Firebase's official RN guidance is to
// disable it so Metro falls back to the "react-native" main field instead.
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
