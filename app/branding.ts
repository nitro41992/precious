import branding from "../branding.json";

// Single source of truth for the app's user-facing identity. `branding.json` is
// also consumed by app.config.js (Expo) so the name lives in one place.
export const APP_NAME = branding.displayName;
export const APP_DOMAIN = branding.domain;
export const APP_SCHEME = branding.scheme;
export const APP_VERSION = branding.version;

// Deep link the magic-link / Google OAuth flows return to. Scheme is unchanged
// by the rebrand, so this value stays `preciouscaptures://auth/callback`.
export const AUTH_CALLBACK_URL = `${APP_SCHEME}://auth/callback`;
