// Gutter photo ads dismissal (spec: closing either newspaper gutter hides
// both, permanently, via a long-lived cookie). Unlike readCookie.js /
// densityCookie.js this cookie is written client-side (gutter-ads.js sets
// `document.cookie` directly on close, so JS can both act immediately and
// persist the choice without a round trip) -- so it is NOT HttpOnly. The
// server only ever reads it, to decide whether to render the gutters at all
// (no flash of ad content on reload), same shape as densityFromCookieHeader.
export const GUTTER_COOKIE_NAME = 'gutters_hidden';

// Same long-lived ceiling as the other "sticks until changed" cookies in
// this app (readCookie.js, densityCookie.js): there is no re-enable UI, so
// this is meant to persist indefinitely in practice.
export const MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

/**
 * Finds the gutters_hidden cookie in a raw `Cookie` request header and
 * reports whether the gutters should be suppressed. Any present value counts
 * as "hidden" -- there's no re-enable state to distinguish.
 * @param {string | undefined} cookieHeader
 * @returns {boolean}
 */
export function gutterHiddenFromCookieHeader(cookieHeader) {
  if (!cookieHeader) return false;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    const name = (eq === -1 ? part : part.slice(0, eq)).trim();
    if (name === GUTTER_COOKIE_NAME) return true;
  }
  return false;
}
