// ShortLinkResolver port (ticket #6). Mirrors preview/previewFetcher.js's
// shape: ingest.js depends only on `{ resolve(url) -> Promise<string|null> }`
// so the resolution strategy is swappable and stubbable at this boundary in
// tests (spec's testing decision: short-link resolution is stubbed, not hit
// over a real network).
//
// NullShortLinkResolver is ingest()'s own default: it never makes a network
// call and always "fails," so ingestion is offline-safe -- and every lnkd.in
// link falls to the UNRESOLVED_SHORT_LINK review queue -- unless a caller
// explicitly wires in a real resolver. The live app wires
// HttpShortLinkResolver in server.js.
export const NullShortLinkResolver = {
  async resolve() {
    throw new Error('No short-link resolver configured');
  },
};

const RESOLVE_TIMEOUT_MS = 5000;

// Spec: "one HTTP redirect-resolve attempt" -- a single hop, read straight
// off the `Location` header, never following the chain further and never
// authenticating. Only the post's identity is needed, not its contents.
export const HttpShortLinkResolver = {
  /**
   * @param {string} url the `lnkd.in` short URL
   * @returns {Promise<string|null>} the resolved URL, or null if the link
   *   did not redirect (no `Location` header / non-redirect status)
   */
  async resolve(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; PostboardShortLinkBot/1.0)' },
      });
      if (res.status < 300 || res.status >= 400) return null;
      const location = res.headers.get('location');
      if (!location) return null;
      return new URL(location, url).toString();
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  },
};
