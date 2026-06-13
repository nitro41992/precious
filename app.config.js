// Expo config. The app's user-facing identity lives in branding.json so a
// rebrand touches one source. Scheme + Android package are intentionally kept
// stable across the rename (no reinstall / OAuth-redirect churn).
const branding = require("./branding.json");

module.exports = {
  expo: {
    name: branding.displayName,
    slug: branding.slug,
    scheme: branding.scheme,
    version: branding.version,
    orientation: "portrait",
    android: {
      package: branding.androidPackage
    }
  }
};
