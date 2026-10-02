// Per-device "read" filter (spec: per-browser "Read / archive opened
// posts"). This cookie is a purely personal view preference -- it never
// touches the posts/sharing_events tables, never changes global counts or
// ordering, and carries no admin/session meaning. Compact by design: just a
// comma-joined list of post ids, oldest-read first.
export const READ_COOKIE_NAME = 'read_posts';

// Browsers reject cookies whose full `name=value` exceeds ~4KB; stay well
// under that for the value alone, leaving room for the name and attributes.
export const MAX_COOKIE_VALUE_BYTES = 3800;

// Long-lived: this is meant to persist "opened" state indefinitely, not
// expire like a session. 400 days is the practical ceiling most browsers
// honor for Max-Age.
export const MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

/**
 * Parses the raw value of the read_posts cookie (not the whole Cookie
 * header) into an ordered array of post ids, oldest first. Malformed or
 * non-numeric entries are dropped rather than failing the request.
 * @param {string | undefined} rawValue
 * @returns {number[]}
 */
export function parseReadIds(rawValue) {
  if (!rawValue) return [];
  return rawValue
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id) && id >= 0);
}

/**
 * Finds and parses the read_posts cookie out of a raw `Cookie` request
 * header, e.g. `req.headers.cookie`.
 * @param {string | undefined} cookieHeader
 * @returns {number[]}
 */
export function readIdsFromCookieHeader(cookieHeader) {
  if (!cookieHeader) return [];
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name !== READ_COOKIE_NAME) continue;
    return parseReadIds(decodeURIComponent(part.slice(eq + 1).trim()));
  }
  return [];
}

// Drops the oldest ids (front of the array) until the serialized value fits
// the byte budget. Spec: "an old read post reappearing as unread is
// acceptable" -- so this is a deliberate, documented lossy trim, not a bug.
function trimToBudget(ids) {
  let trimmed = ids;
  while (trimmed.length > 0 && Buffer.byteLength(trimmed.join(','), 'utf8') > MAX_COOKIE_VALUE_BYTES) {
    trimmed = trimmed.slice(1);
  }
  return trimmed;
}

/**
 * Returns a new ids array with postId marked read (moved to the end if
 * already present), trimmed to the cookie's byte budget.
 * @param {number[]} ids
 * @param {number} postId
 */
export function addReadId(ids, postId) {
  const withoutDup = ids.filter((id) => id !== postId);
  return trimToBudget([...withoutDup, postId]);
}

/**
 * Returns a new ids array with postId removed (restore-to-unread).
 * @param {number[]} ids
 * @param {number} postId
 */
export function removeReadId(ids, postId) {
  return ids.filter((id) => id !== postId);
}

/**
 * The Set-Cookie header value for a given read-ids list.
 * HttpOnly: only the server needs to read this, and it rules out any
 * client-JS tampering/inspection surface. SameSite=Lax matches the rest of
 * the app's cookies.
 * @param {number[]} ids
 */
export function serializeReadCookie(ids) {
  return `${READ_COOKIE_NAME}=${ids.join(',')}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_SECONDS}`;
}
