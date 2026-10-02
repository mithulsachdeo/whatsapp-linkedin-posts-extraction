import { esc } from './layout.js';

/**
 * Renders the post detail view (ticket #8): the cached preview (or a
 * URL-only "no preview" block when none was fetched), Open-on-LinkedIn and
 * Copy-link actions, and the full sharing history -- each event's sharer
 * (resolved display name, or the raw sender labelled "Pending attribution"),
 * timestamp, group (admin-only per the group-hidden rule), optional note,
 * and a "First shared" marker on the earliest event. Adapted from
 * Industry/templates/postboard/Postboard.dc.html's `isPost` screen.
 * @param {object} post - see getPostDetail's return shape (src/query/dashboard.js)
 * @param {{ isAdmin: boolean }} params
 */
export function renderPostDetail(post, { isAdmin }) {
  const title = post.previewAuthor || 'Preview unavailable';
  const preview = post.previewAuthor || post.previewExcerpt ? renderPreview(post) : renderNoPreview(post.url);

  return `
    <a class="btn btn-ghost" href="/" style="margin-bottom:var(--space-4);display:inline-flex;align-items:center;gap:6px;text-decoration:none">&larr; All posts</a>
    <div style="display:flex;flex-wrap:wrap;gap:var(--space-8);align-items:flex-start">
      <article style="flex:1 1 420px;min-width:0;max-width:640px">
        <h1 style="font-size:36px;margin-bottom:4px" data-testid="post-detail-title">${esc(title)}</h1>
        ${post.previewRole ? `<p style="color:var(--color-neutral-700);margin-bottom:var(--space-4)">${esc(post.previewRole)}</p>` : ''}
        ${preview}
        <div style="display:flex;flex-wrap:wrap;gap:var(--space-2);margin-top:var(--space-4);align-items:center">
          <a class="btn btn-primary" href="${esc(post.url)}" target="_blank" rel="noopener" style="padding:11px 20px" data-testid="open-on-linkedin">Open on LinkedIn<svg width="15" height="15" viewBox="0 0 24 24" style="fill:none;stroke:currentColor;stroke-width:2.75;stroke-linecap:round;stroke-linejoin:round"><path d="M15 3h6v6"></path><path d="M10 14 21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path></svg></a>
          <button type="button" class="btn btn-secondary" style="padding:11px 20px" data-testid="copy-link" data-url="${esc(post.url)}" onclick="navigator.clipboard.writeText(this.dataset.url);this.textContent='Link copied';setTimeout(()=>{this.textContent='Copy link';},2000);">Copy link</button>
        </div>
      </article>
      <aside style="flex:1 1 320px;min-width:0;max-width:440px">
        <h3 style="margin-bottom:4px" data-testid="share-history-title">${esc(sharedTitle(post.shareCount))}</h3>
        <p style="color:var(--color-neutral-700);font-size:14px;margin-bottom:var(--space-4)">${esc(sharedSub(post))}</p>
        <ol style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:var(--space-4)" data-testid="share-history">
          ${post.shares.map((share) => renderShare(share, isAdmin)).join('')}
        </ol>
      </aside>
    </div>
  `;
}

function renderPreview(post) {
  return `
    <div style="background:var(--color-surface);border-radius:var(--radius-lg);padding:var(--space-6);font-size:16px;line-height:1.6;text-wrap:pretty" data-testid="post-preview">
      <p style="margin:0">${esc(post.previewExcerpt || '')}</p>
    </div>
  `;
}

// Spec: a post whose preview couldn't be fetched still appears, in the
// URL-only "no preview" style -- never hidden.
function renderNoPreview(url) {
  return `
    <div style="background:var(--color-surface);border-radius:var(--radius-lg);padding:var(--space-6);font-size:16px;line-height:1.6;text-wrap:pretty" data-testid="post-preview" data-preview-state="unavailable">
      <p style="margin:0 0 var(--space-2);font-weight:600">LinkedIn didn't return a preview for this post.</p>
      <p style="margin:0;color:var(--color-neutral-700);word-break:break-all;font-size:14px">${esc(url)}</p>
    </div>
  `;
}

function sharedTitle(shareCount) {
  return shareCount === 1 ? 'Shared once' : `Shared ${shareCount} times`;
}

function sharedSub(post) {
  if (!post.firstSharedAt) return '';
  const first = formatDate(post.firstSharedAt);
  const last = formatDate(post.lastSharedAt);
  return first === last ? `On ${first}.` : `Between ${first} and ${last}.`;
}

function renderShare(share, isAdmin) {
  const avatar = share.displayName
    ? `<span style="width:36px;height:36px;flex:none;border-radius:50%;display:grid;place-items:center;background:var(--color-accent-2-200);color:var(--color-accent-2-800);font-size:12px;font-weight:700">${esc(initials(share.displayName))}</span>`
    : `<span style="width:36px;height:36px;flex:none;border-radius:50%;display:grid;place-items:center;border:1.5px dashed var(--color-neutral-600);color:var(--color-neutral-700);font-size:13px;font-weight:700">?</span>`;

  // Spec: sharer shown by name when resolved, otherwise the raw sender
  // string labelled "Pending attribution" -- never fuzzily guessed.
  const name = share.displayName || share.rawSender;
  // Group is admin-only per the group-hidden rule: the query always
  // returns it, but a public visitor never sees it.
  const groupLabel = isAdmin ? ` · ${esc(share.groupName)}` : '';

  return `
    <li style="display:flex;gap:var(--space-3);align-items:flex-start" data-testid="share-event">
      ${avatar}
      <div style="flex:1;min-width:0">
        <div style="display:flex;flex-wrap:wrap;gap:4px 8px;align-items:center">
          <span style="font-weight:700">${esc(name)}</span>
          ${!share.displayName ? '<span class="tag tag-accent-2">Pending attribution</span>' : ''}
          ${share.isFirstShare ? '<span class="tag tag-accent" data-testid="first-shared-tag">First shared</span>' : ''}
        </div>
        <div style="font-size:13px;color:var(--color-neutral-700)">${esc(formatDateTime(share.timestamp))}${groupLabel}</div>
        ${share.note ? `<p style="margin:6px 0 0;font-size:14px;padding:8px 14px;background:var(--color-neutral-100);border-radius:var(--radius-md);max-width:44ch">&ldquo;${esc(share.note)}&rdquo;</p>` : ''}
      </div>
    </li>
  `;
}

function initials(name) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase() || '?'
  );
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
