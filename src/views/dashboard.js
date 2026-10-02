import { esc } from './layout.js';

/**
 * Renders the dashboard body: the "No posts yet" empty state (adapted from
 * Industry/components/postboard-empty-states.html) when there are no posts,
 * otherwise the post list in rows or cards density (adapted from
 * Industry/components/postboard-post-row.html). Sort/filter/search controls
 * are out of scope for this ticket and land with a later dashboard-controls
 * ticket; default sort (most-recent-first) comes from the query layer.
 * Group is never shown, per the finalized group-hidden decision.
 * @param {{ posts: Array<object> }} data
 * @param {{ isAdmin: boolean, density: 'rows'|'cards' }} params
 */
export function renderDashboard({ posts }, { isAdmin, density = 'rows' }) {
  if (posts.length === 0) {
    return renderEmptyState({ isAdmin });
  }

  const toggle = renderDensityToggle(density);
  const list = density === 'cards' ? renderCards(posts) : renderRows(posts);

  return `
    <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:var(--space-2);margin-bottom:var(--space-3)">
      <h1 style="font-size:40px;margin:0">Every post the groups shared</h1>
      ${toggle}
    </div>
    ${list}
  `;
}

function renderDensityToggle(density) {
  const link = (value, label) =>
    `<a href="/?density=${value}" aria-current="${density === value ? 'page' : 'false'}" class="btn ${density === value ? 'btn-primary' : 'btn-secondary'}" style="padding:6px 14px;font-size:13px">${label}</a>`;
  return `<div style="display:flex;gap:var(--space-2)" data-testid="density-toggle">${link('rows', 'Rows')}${link('cards', 'Cards')}</div>`;
}

function renderRows(posts) {
  const items = posts.map((post) => `<li style="list-style:none">${renderRow(post)}</li>`).join('');
  return `<ul style="padding:0;margin:0;display:flex;flex-direction:column;gap:var(--space-2)" data-testid="post-list-rows">${items}</ul>`;
}

function renderRow(post) {
  return `
    <div style="display:flex;gap:var(--space-4);align-items:flex-start;padding:var(--space-3) var(--space-4);border-radius:var(--radius-lg);background:var(--color-surface)">
      ${shareCountBadge(post)}
      <div style="flex:1;min-width:0">
        ${postHeadline(post)}
        ${postExcerpt(post)}
        ${postMeta(post)}
      </div>
    </div>`;
}

function renderCards(posts) {
  const items = posts.map((post) => `<li style="list-style:none">${renderCard(post)}</li>`).join('');
  return `<ul class="card-grid" style="padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:var(--space-3)" data-testid="post-list-cards">${items}</ul>`;
}

function renderCard(post) {
  return `
    <div class="card" style="padding:var(--space-4);gap:var(--space-2);display:flex;flex-direction:column;height:100%">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:var(--space-2)">
        ${postHeadline(post)}
        ${shareCountBadge(post, true)}
      </div>
      ${postExcerpt(post)}
      ${postMeta(post)}
    </div>`;
}

function shareCountBadge(post, small = false) {
  const size = small ? 40 : 52;
  return `
    <div style="width:${size}px;height:${size}px;flex:none;border-radius:50%;background:var(--color-accent-200);color:var(--color-accent-800);display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1">
      <span style="font-family:var(--font-heading);font-size:${small ? 16 : 21}px">${post.shareCount}</span>
      <span style="font-size:10px;margin-top:2px">${post.shareCount === 1 ? 'share' : 'shares'}</span>
    </div>`;
}

function postHeadline(post) {
  const title = post.previewAuthor || 'Preview unavailable';
  return `
    <div style="display:flex;flex-wrap:wrap;gap:2px 8px;align-items:baseline;min-width:0">
      <a href="${esc(post.url)}" target="_blank" rel="noopener" style="font-weight:700;color:var(--color-text)">${esc(title)}</a>
      ${post.previewRole ? `<span style="font-size:13px;color:var(--color-neutral-700)">${esc(post.previewRole)}</span>` : ''}
    </div>`;
}

function postExcerpt(post) {
  const text = post.previewExcerpt || post.url;
  return `<p style="margin:3px 0 8px;font-size:14px;color:${post.previewExcerpt ? 'inherit' : 'var(--color-neutral-700)'};display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(text)}</p>`;
}

function postMeta(post) {
  const dateRange = formatDateRange(post.firstSharedAt, post.lastSharedAt);
  const sharerCount = post.distinctSharerCount === 1 ? '1 sharer' : `${post.distinctSharerCount} sharers`;
  return `
    <div style="color:var(--color-neutral-700);display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;font-size:12.5px">
      <span>${sharerCount}</span>
      ${dateRange ? `<span>${esc(dateRange)}</span>` : ''}
      ${post.pendingAttribution ? '<span class="tag tag-accent-2">Pending attribution</span>' : ''}
    </div>`;
}

function formatDateRange(firstSharedAt, lastSharedAt) {
  if (!firstSharedAt) return '';
  const first = formatDate(firstSharedAt);
  const last = formatDate(lastSharedAt);
  return first === last ? first : `${first} – ${last}`;
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

function renderEmptyState({ isAdmin }) {
  const adminCopy = `
    <p style="font-size:16px;max-width:46ch;text-wrap:pretty">Import a WhatsApp chat export and every LinkedIn post shared in it shows up here once, with who shared it and when.</p>
    <a class="btn btn-primary" href="/import" style="padding:12px 22px;font-size:15px;display:inline-block;margin-top:var(--space-2)">Import a chat export</a>
  `;
  const memberCopy = `
    <p style="font-size:16px;max-width:46ch;text-wrap:pretty">No chats have been imported yet. Posts shared in the group will appear here after the admin's first import.</p>
  `;

  return `
    <div style="max-width:560px;padding:var(--space-8) 0">
      <div style="display:flex;margin-bottom:var(--space-6)">
        <span style="width:72px;height:72px;border-radius:50%;background:var(--color-accent-200)"></span>
        <span style="width:72px;height:72px;border-radius:50%;background:var(--color-accent-2-200);margin-left:-22px"></span>
        <span style="width:72px;height:72px;border-radius:50%;background:var(--color-neutral-300);margin-left:-22px"></span>
      </div>
      <h1 style="font-size:40px" data-testid="empty-state-title">No posts yet</h1>
      ${isAdmin ? adminCopy : memberCopy}
    </div>
  `;
}
