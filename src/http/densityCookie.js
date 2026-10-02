// Per-device "layout" preference (spec: the Index/Columns choice must
// persist across navigation -- e.g. opening a post then clicking "Back to
// the front page" -- until the user picks a different layout). Same
// server-rendered, no-JS pattern as readCookie.js: a plain cookie the route
// reads and writes, carrying no admin/session meaning.
export const DENSITY_COOKIE_NAME = 'layout';

// Same ceiling as readCookie.js's MAX_AGE_SECONDS: long-lived rather than a
// session cookie, since this is meant to stick until explicitly changed.
export const MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

/**
 * Normalizes a raw density value (from a query param or cookie) to a known
 * density, or null if it's missing/unrecognized -- never throws.
 * @param {unknown} value
 * @returns {'rows' | 'cards' | null}
 */
export function parseDensity(value) {
  return value === 'rows' || value === 'cards' ? value : null;
}

/**
 * Finds and parses the layout cookie out of a raw `Cookie` request header,
 * e.g. `req.headers.cookie`.
 * @param {string | undefined} cookieHeader
 * @returns {'rows' | 'cards' | null}
 */
export function densityFromCookieHeader(cookieHeader) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name !== DENSITY_COOKIE_NAME) continue;
    return parseDensity(part.slice(eq + 1).trim());
  }
  return null;
}

/**
 * The Set-Cookie header value for a given density. HttpOnly/SameSite=Lax
 * match the rest of the app's cookies (see readCookie.js).
 * @param {'rows' | 'cards'} density
 */
export function serializeDensityCookie(density) {
  return `${DENSITY_COOKIE_NAME}=${density}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_SECONDS}`;
}
