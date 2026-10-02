// PreviewFetcher port (spec: "best-effort, cached, replaceable"). ingest.js
// depends only on this shape -- `{ fetch(url) -> Promise<{author,role,excerpt}> }`
// -- so the fetch strategy is swappable and fully stubbable at this boundary
// in tests (spec's testing decision: previews are stubbed, not hit over a
// real network, so the test suite stays deterministic and offline).
//
// NullPreviewFetcher is ingest()'s own default: it never makes a network
// call, so ingestion is offline-safe unless a caller explicitly wires in a
// real fetcher. The live app wires HttpPreviewFetcher in server.js.
export const NullPreviewFetcher = {
  async fetch() {
    throw new Error('No preview fetcher configured');
  },
};

const FETCH_TIMEOUT_MS = 5000;

// Best-effort, unauthenticated Open-Graph scrape. Honest caveat (spec):
// LinkedIn heavily rate-limits/blocks unauthenticated fetches, so a
// meaningful share of posts are expected to fail and fall back to the
// URL-only "no preview" style -- that is acceptable by design, not a bug.
export const HttpPreviewFetcher = {
  /**
   * @param {string} url canonical LinkedIn post URL
   * @returns {Promise<{ author: string|null, role: string|null, excerpt: string|null }>}
   */
  async fetch(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; PostboardPreviewBot/1.0)' },
      });
      if (!res.ok) throw new Error(`Preview fetch failed with status ${res.status}`);
      const html = await res.text();
      return parseOpenGraph(html);
    } finally {
      clearTimeout(timeout);
    }
  },
};

function parseOpenGraph(html) {
  const title = matchMeta(html, 'og:title');
  const description = matchMeta(html, 'og:description');
  // LinkedIn's og:title is typically "<Author> on LinkedIn: <excerpt...>" --
  // best-effort split; if that shape isn't found, fall back to the whole
  // title as the author with no finer-grained role.
  const authorMatch = title ? title.match(/^(.+?)\s+on LinkedIn/i) : null;
  return {
    author: authorMatch ? authorMatch[1] : title ?? null,
    role: null,
    excerpt: description ?? null,
  };
}

function matchMeta(html, property) {
  const re = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["']`, 'i');
  const match = html.match(re);
  return match ? decodeHtmlEntities(match[1]) : null;
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
