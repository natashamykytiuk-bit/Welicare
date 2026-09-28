// ESLint config (flat format, ESLint 9). Run with `npm run lint`, which is
// `expo lint` under the hood.
//
// - eslint-config-expo: Expo's recommended rules for React Native + web,
//   including eslint-plugin-react-hooks (rules-of-hooks and
//   exhaustive-deps), so that plugin doesn't need adding separately.
// - eslint-config-prettier: switches off every rule that's purely about
//   formatting, so ESLint and Prettier never fight — Prettier owns layout,
//   ESLint owns correctness. It has to come last to win.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Generated output, dependencies, and local AI-assistant folders.
    ignores: [
      'dist/*',
      'web-build/*',
      '.expo/*',
      'node_modules/*',
      '.agents/*',
      'Claude outputs/*',
    ],
  },
  {
    // Cloud Functions and the one-off admin scripts run in Node, not the app.
    files: ['functions/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      globals: {
        require: 'readonly',
        module: 'writable',
        process: 'readonly',
        __dirname: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
      },
    },
  },
  prettierConfig,
]);
