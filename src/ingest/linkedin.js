// LinkedIn POST URL extraction and canonicalization.
//
// Scope note (ticket #2): only the three POST-shaped URL forms the ticket
// names are extracted and persisted as Posts. Non-post LinkedIn links
// (profiles/company/jobs -> OTHER_LINKEDIN) and lnkd.in short-link
// resolution are spec'd (review-queue section) but out of this ticket's
// scope -- they are silently ignored here rather than guessed at. Follow-up:
// a future review-queue ticket should route those to review_items instead.
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
  const matches = text.match(URL_RE) ?? [];
  return matches
    .map((raw) => raw.replace(/[.,;!?]+$/, '')) // trailing sentence punctuation
    .filter(isLinkedInPostUrl);
}

function isLinkedInPostUrl(raw) {
  const url = tryParseUrl(raw);
  if (!url) return false;
  if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return false;
  return POST_PATH_RES.some((re) => re.test(url.pathname));
}

/**
 * Canonicalizes a LinkedIn post URL into its dedup key: lowercased host,
 * stripped tracking query/fragment noise (utm_*, trackingId, rcm, ...), no
 * trailing slash.
 * @param {string} raw
 * @returns {string|null} canonical URL, or null if not a recognizable post URL
 */
export function canonicalizeUrl(raw) {
  const url = tryParseUrl(raw);
  if (!url || !isLinkedInPostUrl(raw)) return null;

  let pathname = url.pathname.replace(/\/+$/, '');
  if (!pathname.startsWith('/')) pathname = '/' + pathname;

  return `https://www.linkedin.com${pathname}`;
}

function tryParseUrl(raw) {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}
