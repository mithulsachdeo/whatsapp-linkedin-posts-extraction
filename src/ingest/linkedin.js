// LinkedIn URL extraction, classification, and canonicalization.
//
// Ticket #2 shipped POST-shaped extraction/canonicalization only. Ticket #5
// added classification of every other LinkedIn URL (profile/company/jobs/etc)
// as OTHER_LINKEDIN, per the spec's "deterministic classification" decision.
// Ticket #6 adds `lnkd.in` short links as a fourth classification
// ('SHORT_LINK'): extracted alongside real linkedin.com URLs, but resolution
// (the HTTP redirect lookup) is the ingestion pipeline's concern, not this
// module's -- this module only recognizes the shape.
const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

const POST_PATH_RES = [
  /^\/posts\//,
  /^\/feed\/update\/urn:li:activity:/,
  /^\/pulse\//,
];

/**
 * Finds every LinkedIn POST-shaped URL in free text.
 * @param {string} text
 * @returns {string[]} raw URLs, in order, duplicates included
 */
export function extractPostUrls(text) {
  return extractLinkedInUrls(text).filter((raw) => classifyLinkedInUrl(raw) === 'POST');
}

/**
 * Finds every LinkedIn URL in free text, of any shape (post, other, or an
 * unresolved `lnkd.in` short link).
 * @param {string} text
 * @returns {string[]} raw URLs, in order, duplicates included
 */
export function extractLinkedInUrls(text) {
  const matches = text.match(URL_RE) ?? [];
  return matches
    .map((raw) => raw.replace(/[.,;!?]+$/, '')) // trailing sentence punctuation
    .filter((raw) => isLinkedInUrl(raw) || isShortLinkUrl(raw));
}

/**
 * Classifies a LinkedIn (or `lnkd.in`) URL per the spec's deterministic rules.
 * @param {string} raw
 * @returns {'POST'|'OTHER_LINKEDIN'|'SHORT_LINK'|null} null if neither a
 *   linkedin.com nor an lnkd.in URL at all
 */
export function classifyLinkedInUrl(raw) {
  const url = tryParseUrl(raw);
  if (!url) return null;
  if (isShortLinkUrl(raw)) return 'SHORT_LINK';
  if (!isLinkedInUrl(raw)) return null;
  return POST_PATH_RES.some((re) => re.test(url.pathname)) ? 'POST' : 'OTHER_LINKEDIN';
}

function isLinkedInUrl(raw) {
  const url = tryParseUrl(raw);
  if (!url) return false;
  return /(^|\.)linkedin\.com$/i.test(url.hostname);
}

function isShortLinkUrl(raw) {
  const url = tryParseUrl(raw);
  if (!url) return false;
  return /(^|\.)lnkd\.in$/i.test(url.hostname);
}

function isLinkedInPostUrl(raw) {
  return classifyLinkedInUrl(raw) === 'POST';
}

/**
 * Canonicalizes a LinkedIn post URL into its dedup key: lowercased host,
 * stripped tracking query/fragment noise (utm_*, trackingId, rcm, ...), no
 * trailing slash.
 * @param {string} raw
 * @returns {string|null} canonical URL, or null if not a recognizable post URL
 */
export function canonicalizeUrl(raw) {
  if (!isLinkedInPostUrl(raw)) return null;
  return canonicalizeAnyLinkedInUrl(raw);
}

/**
 * Normalizes any linkedin.com URL (post-shaped or not) the same way
 * `canonicalizeUrl` does, without requiring it to be post-shaped. Used when
 * an admin promotes an OTHER_LINKEDIN review item to a post (the spec gives
 * the admin final say over the classifier), and when storing an
 * OTHER_LINKEDIN item's URL so it dedupes/displays consistently.
 * @param {string} raw
 * @returns {string|null} canonical URL, or null if not a linkedin.com URL
 */
export function canonicalizeAnyLinkedInUrl(raw) {
  const url = tryParseUrl(raw);
  if (!url || !isLinkedInUrl(raw)) return null;

  let pathname = url.pathname.replace(/\/+$/, '');
  if (!pathname.startsWith('/')) pathname = '/' + pathname;

  return `https://www.linkedin.com${pathname}`;
}

/**
 * Canonicalizes an `lnkd.in` short link into its dedup key -- the Post's
 * canonical_url while it is still an unresolved interim POST (ticket #11):
 * lowercased host + path, with tracking query/fragment noise stripped. Keeps
 * the same shape as canonicalizeUrl/canonicalizeAnyLinkedInUrl so re-import
 * stays idempotent on (group, timestamp, raw_sender, canonical_url).
 * @param {string} raw
 * @returns {string|null} canonical lnkd.in URL, or null if not an lnkd.in URL
 */
export function canonicalizeShortLinkUrl(raw) {
  const url = tryParseUrl(raw);
  if (!url || !isShortLinkUrl(raw)) return null;

  let pathname = url.pathname.replace(/\/+$/, '');
  if (!pathname.startsWith('/')) pathname = '/' + pathname;

  return `https://lnkd.in${pathname}`;
}

function tryParseUrl(raw) {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}
