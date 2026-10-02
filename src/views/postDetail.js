import { esc } from './layout.js';

/**
 * Renders the post detail view (ticket #8) in the Industry_new2 article idiom:
 * a kicker + headline, the cached preview as drop-capped body (or a URL-only
 * "no preview" block when none was fetched), Open-on-LinkedIn / Copy-link
 * actions, and the full "Circulation record" -- each event's sharer (resolved
 * display name, or the raw sender labelled "Pending attribution"), timestamp,
 * group (admin-only per the group-hidden rule), optional note, and a "First
 * shared" marker on the earliest event.
 * @param {object} post - see getPostDetail's return shape (src/query/dashboard.js)
 * @param {{ isAdmin: boolean }} params
 */
export function renderPostDetail(post, { isAdmin }) {
  const title = post.previewAuthor || 'Preview unavailable';
  const hasPreview = Boolean(post.previewAuthor || post.previewExcerpt);
  const preview = hasPreview ? renderPreview(post) : renderNoPreview(post.url);

  return `
    <a class="btn btn-link" href="/" style="margin-bottom:var(--space-3)">← Back to the front page</a>
    <div class="article">
      <div class="article-main">
        <div class="kicker">From the archive</div>
        <h1 class="headline headline-xl" data-testid="post-detail-title">${esc(title)}</h1>
        <div class="article-byline">
          ${post.previewRole ? `<span class="byline">${esc(post.previewRole)}</span>` : ''}
          <span style="font-style:italic;color:var(--color-muted);font-family:var(--font-body)">Originally published on LinkedIn</span>
        </div>
        ${preview}
        <div style="display:flex;flex-wrap:wrap;gap:var(--space-2);margin-top:var(--space-6);align-items:center">
          <a class="btn btn-ink" href="/out/${post.id}" data-testid="open-on-linkedin" target="_blank" rel="noopener">Read the original on LinkedIn ↗</a>
          <button type="button" class="btn" data-testid="copy-link" data-url="${esc(post.url)}" onclick="navigator.clipboard.writeText(this.dataset.url);this.textContent='Link copied';setTimeout(()=>{this.textContent='Copy link';},2000);">Copy link</button>
        </div>
      </div>
      <aside class="article-aside">
        <h3 class="headline headline-md" style="margin:0" data-testid="share-history-title">Sharing history</h3>
        <p class="standfirst" style="font-size:var(--text-sm);margin:2px 0 var(--space-4)">${esc(sharedSub(post))}</p>
        <ol style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column" data-testid="share-history">
          ${post.shares.map((share) => renderShare(share, isAdmin)).join('')}
        </ol>
      </aside>
    </div>
  `;
}

function renderPreview(post) {
  const body = post.previewExcerpt || '';
  return `
    <p class="article-body dropcap" data-testid="post-preview">${esc(body)}</p>
  `;
}

// Spec: a post whose preview couldn't be fetched still appears, in the
// URL-only "no preview" style -- never hidden.
function renderNoPreview(url) {
  return `
    <div data-testid="post-preview" data-preview-state="unavailable">
      <p class="standfirst" style="margin:0 0 var(--space-2)">LinkedIn didn't return a preview for this post, so only the link was printed.</p>
      <p class="dateline" style="margin:0;word-break:break-all">${esc(url)}</p>
    </div>
  `;
}

function sharedSub(post) {
  if (!post.firstSharedAt) return 'Circulation record';
  const first = formatDate(post.firstSharedAt);
  const last = formatDate(post.lastSharedAt);
  return first === last ? `On ${first}.` : `Between ${first} and ${last}.`;
}

function renderShare(share, isAdmin) {
  // Spec: sharer shown by name when resolved, otherwise the raw sender
  // string labelled "Pending attribution" -- never fuzzily guessed.
  const name = share.displayName || share.rawSender;
  // Group is admin-only per the group-hidden rule: the query always returns
  // it, but a public visitor never sees it.
  const groupLabel = isAdmin ? esc(share.groupName) : '';

  return `
    <li style="padding:var(--space-3) 0;border-bottom:1px dotted var(--color-neutral-600)" data-testid="share-event">
      <div style="display:flex;justify-content:space-between;gap:var(--space-2);font:700 var(--text-xs)/1.3 var(--font-ui);letter-spacing:.1em;text-transform:uppercase;color:var(--color-muted)">
        <span>${esc(formatDateTime(share.timestamp))}</span>
        ${groupLabel ? `<span>${groupLabel}</span>` : ''}
      </div>
      <div style="display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;margin-top:4px">
        <span class="headline headline-sm">${esc(name)}</span>
        ${!share.displayName ? '<span class="tag tag-dashed">Pending attribution</span>' : ''}
        ${share.isFirstShare ? '<span class="tag tag-red" data-testid="first-shared-tag">First shared</span>' : ''}
      </div>
      ${share.note ? `<p style="font:italic var(--text-base)/1.45 var(--font-body);margin:6px 0 0;padding-left:12px;border-left:3px solid var(--color-accent)">“${esc(share.note)}”</p>` : ''}
    </li>
  `;
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

function formatDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}
