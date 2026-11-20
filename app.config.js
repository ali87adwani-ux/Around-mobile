// Extends app.json. `SINGLE_BUNDLE=1` builds the web app as one JS bundle
// (used by scripts/build-preview.js to produce a self-contained preview page).
module.exports = ({ config }) => {
  if (process.env.SINGLE_BUNDLE) {
    config.plugins = config.plugins.map((p) => (p === 'expo-router' ? ['expo-router', { asyncRoutes: { web: false, default: false } }] : p));
  }
  return config;
};
