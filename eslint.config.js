// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
// Synced/generated web files are linted in the web repo; re-linting them here is noise.
const synced = Object.keys(require("./shared.lock.json").files);

module.exports = defineConfig([
  expoConfig,
  { ignores: ["dist/*", "node_modules/*", ".expo/*", ...synced] },
]);
