import { esc } from './layout.js';

/**
 * Renders the dashboard body: the "No posts yet" empty state (adapted from
 * Industry/components/postboard-empty-states.html) when there are no posts,
 * otherwise a minimal list -- card/row density, sort, search, and member
 * filter are out of scope for the walking skeleton and land with the
 * dashboard-query ticket.
 * @param {{ posts: Array<object> }} data
 * @param {{ isAdmin: boolean }} params
 */
export function renderDashboard({ posts }, { isAdmin }) {
  if (posts.length === 0) {
    return renderEmptyState({ isAdmin });
  }

  const items = posts
    .map(
      (post) => `
      <li style="background:var(--color-surface);border-radius:var(--radius-lg);padding:var(--space-4);margin-bottom:var(--space-3);list-style:none">
        <a href="${esc(post.url)}" target="_blank" rel="noopener">${esc(post.previewAuthor || post.url)}</a>
        <div style="font-size:13px;color:var(--color-neutral-700)">${post.shareCount} share${post.shareCount === 1 ? '' : 's'}${post.pendingAttribution ? ' · <span class="tag tag-accent-2">Pending attribution</span>' : ''}</div>
      </li>`
    )
    .join('');

  return `
    <h1 style="font-size:40px;margin-bottom:var(--space-3)">Every post the groups shared</h1>
    <ul style="padding:0;margin:0">${items}</ul>
  `;
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
