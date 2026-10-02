import { esc } from './layout.js';

/**
 * Renders the dashboard body: the "No posts yet" empty state (adapted from
 * Industry/components/postboard-empty-states.html) when the whole board has
 * no data at all; otherwise the discovery controls (search, sort, density,
 * filter-by-member) from Industry/templates/postboard/ plus the post list in
 * rows or cards density (adapted from Industry/components/postboard-post-row.html
 * and postboard-member-filter.html). Group is never shown, per the finalized
 * group-hidden decision.
 * @param {{ posts: Array<object> }} data
 * @param {{
 *   isAdmin: boolean,
 *   density?: 'rows'|'cards',
 *   sort?: 'recent'|'most_shared',
 *   search?: string,
 *   activeMember?: { type: 'member', id: number, displayName: string } | { type: 'pending' } | null,
 *   filterOptions: { totalCount: number, pendingCount: number, members: Array<{ id: number, displayName: string, postCount: number }> },
 * }} params
 */
export function renderDashboard(
  { posts },
  { isAdmin, density = 'rows', sort = 'recent', search = '', activeMember = null, filterOptions, view = 'unread' }
) {
  const hasAnyData = (filterOptions?.totalCount ?? 0) > 0;
  const state = { search, sort, density, activeMember, view };
  if (!hasAnyData) {
    return renderEmptyState({ isAdmin, state });
  }

  const sidebar = renderMemberSidebar(filterOptions, activeMember, state);
  const header = renderHeader(activeMember, posts.length);
  const controls = renderControls(state, filterOptions, activeMember);
  const viewToggle = renderViewToggle(state);
  const results =
    posts.length === 0 ? renderNoResults(search, activeMember) : renderPostList(posts, density, view);

  return `
    <style>
      [data-testid="member-select"] { display: none; }
      @media (max-width: 760px) {
        [data-testid="member-sidebar"] { display: none; }
        [data-testid="member-select"] { display: block; }
      }
    </style>
    <div style="display:flex;flex-wrap:wrap;gap:var(--space-8);align-items:flex-start">
      ${sidebar}
      <section style="flex:1 1 480px;min-width:0">
        ${header}
        ${viewToggle}
        ${controls}
        ${results}
      </section>
    </div>
  `;
}

function renderPostList(posts, density, view) {
  return density === 'cards' ? renderCards(posts, view) : renderRows(posts, view);
}

// Per-device Unread/Read/All toggle (spec): a plain server-rendered link
// group, no client JS -- each option is a full GET carrying forward the rest
// of the dashboard's state (search/sort/density/member) via buildHref.
function renderViewToggle(state) {
  const options = [
    ['unread', 'Unread'],
    ['read', 'Read'],
    ['all', 'All'],
  ];
  const links = options
    .map(([value, label]) => {
      const active = (state.view ?? 'unread') === value;
      const activeStyle = active ? 'background:var(--color-accent-200);color:var(--color-accent-900);font-weight:600' : '';
      return `<a href="${buildHref(state, { view: value })}" aria-current="${active}" style="text-decoration:none;color:inherit;padding:6px 14px;border-radius:999px;font-size:14px;${activeStyle}">${label}</a>`;
    })
    .join('');
  return `<div data-testid="view-toggle" role="radiogroup" aria-label="View" style="display:inline-flex;gap:2px;margin:var(--space-3) 0;background:var(--color-surface);border-radius:999px;padding:3px">${links}</div>`;
}

// Builds a /?… href carrying forward the current search/sort/density/member
// state, so switching one control (e.g. sort) never silently drops another
// (e.g. an in-progress search). `overrides` wins over `state` per key;
// `overrides.member === ''` explicitly clears the member filter (the
// "Everyone" / "All posts" link).
function buildHref(state, overrides = {}) {
  const merged = { ...state, ...overrides };
  const params = new URLSearchParams();
  if (merged.search) params.set('q', merged.search);
  if (merged.sort && merged.sort !== 'recent') params.set('sort', merged.sort);
  if (merged.density && merged.density !== 'rows') params.set('density', merged.density);
  if (merged.view && merged.view !== 'unread') params.set('view', merged.view);

  const memberParam = 'member' in overrides ? overrides.member : memberParamFor(merged.activeMember);
  if (memberParam) params.set('member', memberParam);

  const qs = params.toString();
  return qs ? `/?${qs}` : '/';
}

function memberParamFor(activeMember) {
  if (!activeMember) return '';
  return activeMember.type === 'pending' ? 'pending' : String(activeMember.id);
}

function renderHeader(activeMember, resultCount) {
  if (!activeMember) {
    return `
      <h1 style="font-size:40px;max-width:18ch;margin-bottom:var(--space-3)">Every post the groups shared</h1>
    `;
  }

  const backLink = (state) =>
    `<a class="btn btn-ghost" href="${buildHref(state, { member: '' })}" style="margin-bottom:var(--space-3);display:inline-flex;align-items:center;gap:6px;text-decoration:none">&larr; All posts</a>`;

  if (activeMember.type === 'pending') {
    return `
      ${backLink({ activeMember })}
      <h1 style="font-size:36px;margin-bottom:var(--space-2)">Pending attribution</h1>
      <p style="max-width:58ch;color:var(--color-neutral-700);margin:0">Posts with at least one share from a sender who isn't matched to a member yet. They're counted normally; only the name is waiting.</p>
    `;
  }

  const postWord = resultCount === 1 ? 'post' : 'posts';
  return `
    ${backLink({ activeMember })}
    <div style="display:flex;gap:var(--space-4);align-items:center;flex-wrap:wrap">
      <span style="width:72px;height:72px;flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--color-accent-2-200);color:var(--color-accent-2-800);font-family:var(--font-heading);font-size:26px">${esc(initials(activeMember.displayName))}</span>
      <div>
        <h1 style="font-size:36px;margin-bottom:4px" data-testid="member-header-name">${esc(activeMember.displayName)}</h1>
        <p style="margin:0;color:var(--color-neutral-700)">${resultCount} ${postWord} shared</p>
      </div>
    </div>
  `;
}

function renderControls(state, filterOptions, activeMember) {
  const memberSelect = renderMemberSelect(filterOptions, activeMember, state);
  return `
    <form method="get" action="/" data-testid="dashboard-controls" style="display:flex;flex-wrap:wrap;gap:var(--space-3);align-items:center;margin:var(--space-6) 0 var(--space-3)">
      ${memberParamFor(activeMember) ? `<input type="hidden" name="member" value="${esc(memberParamFor(activeMember))}">` : ''}
      <div style="position:relative;flex:1 1 260px;min-width:0">
        <svg width="17" height="17" viewBox="0 0 24 24" style="position:absolute;left:14px;top:50%;transform:translateY(-50%);fill:none;stroke:var(--color-neutral-700);stroke-width:2.75;stroke-linecap:round;stroke-linejoin:round;pointer-events:none"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
        <input class="input" type="search" name="q" placeholder="Search posts, authors or members" value="${esc(state.search)}" style="padding-left:40px;min-height:42px;width:100%">
      </div>
      <div class="seg" role="radiogroup" aria-label="Sort" data-testid="sort-toggle">
        <label class="seg-opt"><input type="radio" name="sort" value="recent" onchange="this.form.requestSubmit()" ${state.sort === 'recent' ? 'checked' : ''}>Recent</label>
        <label class="seg-opt"><input type="radio" name="sort" value="most_shared" onchange="this.form.requestSubmit()" ${state.sort === 'most_shared' ? 'checked' : ''}>Most shared</label>
      </div>
      <div class="seg" role="radiogroup" aria-label="Density" data-testid="density-toggle">
        <label class="seg-opt"><input type="radio" name="density" value="rows" onchange="this.form.requestSubmit()" ${state.density === 'rows' ? 'checked' : ''}>Rows</label>
        <label class="seg-opt"><input type="radio" name="density" value="cards" onchange="this.form.requestSubmit()" ${state.density === 'cards' ? 'checked' : ''}>Cards</label>
      </div>
      ${memberSelect}
      <button type="submit" class="btn btn-secondary" style="padding:6px 14px">Apply</button>
    </form>
  `;
}

function renderMemberSelect(filterOptions, activeMember, state) {
  const options = [
    `<option value="" ${!activeMember ? 'selected' : ''}>Everyone (${filterOptions.totalCount})</option>`,
    ...filterOptions.members.map(
      (m) =>
        `<option value="${m.id}" ${activeMember?.type === 'member' && activeMember.id === m.id ? 'selected' : ''}>${esc(m.displayName)} (${m.postCount})</option>`
    ),
  ];
  if (filterOptions.pendingCount > 0) {
    options.push(
      `<option value="pending" ${activeMember?.type === 'pending' ? 'selected' : ''}>Pending attribution (${filterOptions.pendingCount})</option>`
    );
  }
  // Narrow-viewport replacement for the sidebar (per the design's member
  // filter component: "Below 760px the list collapses into a single
  // select.input"). name="member" on this select deliberately shadows/
  // replaces the hidden input of the same name the form may also render.
  return `<select data-testid="member-select" class="input" name="member" onchange="this.form.requestSubmit()" style="min-height:42px;flex:1 1 180px">${options.join('')}</select>`;
}

function renderMemberSidebar(filterOptions, activeMember, state) {
  const items = [
    {
      href: buildHref(state, { member: '' }),
      label: 'Everyone',
      count: filterOptions.totalCount,
      active: !activeMember,
      kind: 'everyone',
    },
    ...filterOptions.members.map((m) => ({
      href: buildHref(state, { member: String(m.id) }),
      label: m.displayName,
      count: m.postCount,
      active: activeMember?.type === 'member' && activeMember.id === m.id,
      kind: 'member',
    })),
  ];
  if (filterOptions.pendingCount > 0) {
    items.push({
      href: buildHref(state, { member: 'pending' }),
      label: 'Pending attribution',
      count: filterOptions.pendingCount,
      active: activeMember?.type === 'pending',
      kind: 'pending',
    });
  }

  const rows = items.map(memberFilterRow).join('');
  return `
    <aside data-testid="member-sidebar" style="flex:0 0 220px;position:sticky;top:var(--space-6);padding-top:var(--space-2)">
      <h6 style="color:var(--color-neutral-700);margin-bottom:var(--space-3);font-family:var(--font-body);font-weight:700">Shared by</h6>
      <div style="display:flex;flex-direction:column;gap:2px">${rows}</div>
    </aside>
  `;
}

function memberFilterRow({ href, label, count, active, kind }) {
  const activeStyle = active ? 'background:var(--color-accent-200);color:var(--color-accent-900);font-weight:600' : '';
  return `
    <a href="${href}" aria-current="${active}" style="text-decoration:none;color:inherit;display:flex;align-items:center;gap:10px;padding:5px 12px 5px 5px;border-radius:999px;font-size:14px;${activeStyle}">
      ${memberAvatar(label, kind)}
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(label)}</span>
      <span style="font-size:12px">${count}</span>
    </a>`;
}

function memberAvatar(label, kind) {
  if (kind === 'pending') {
    return `<span style="width:26px;height:26px;flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;border:1.5px dashed var(--color-neutral-600);color:var(--color-neutral-700);font-size:12px;font-weight:700">?</span>`;
  }
  if (kind === 'everyone') {
    return `<span style="width:26px;height:26px;flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--color-neutral-300);color:var(--color-neutral-800);font-size:10px;font-weight:700">All</span>`;
  }
  return `<span style="width:26px;height:26px;flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--color-accent-2-200);color:var(--color-accent-2-800);font-size:10px;font-weight:700">${esc(initials(label))}</span>`;
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

function renderNoResults(search, activeMember) {
  const title = search ? `No posts match “${esc(search)}”` : 'No posts for this filter';
  return `
    <div data-testid="no-results" style="padding:var(--space-8) var(--space-4);display:flex;flex-direction:column;align-items:flex-start;gap:var(--space-2)">
      <span style="width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--color-neutral-200);margin-bottom:var(--space-2)">
        <svg width="24" height="24" viewBox="0 0 24 24" style="fill:none;stroke:var(--color-neutral-700);stroke-width:2.75;stroke-linecap:round;stroke-linejoin:round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
      </span>
      <h3 style="margin:0">${title}</h3>
      <p style="margin:0;color:var(--color-neutral-700);max-width:48ch">Try a different word, or clear the member filter.</p>
      <a class="btn btn-secondary" href="/" data-testid="clear-filters" style="margin-top:var(--space-2);text-decoration:none">Clear search and filters</a>
    </div>
  `;
}

function renderRows(posts, view) {
  const items = posts.map((post) => `<li style="list-style:none">${renderRow(post, view)}</li>`).join('');
  return `<ul style="padding:0;margin:0;display:flex;flex-direction:column;gap:var(--space-2)" data-testid="post-list-rows">${items}</ul>`;
}

function renderRow(post, view) {
  return `
    <div style="display:flex;gap:var(--space-4);align-items:flex-start;padding:var(--space-3) var(--space-4);border-radius:var(--radius-lg);background:var(--color-surface)">
      ${shareCountBadge(post)}
      <div style="flex:1;min-width:0">
        ${postHeadline(post)}
        ${postExcerpt(post)}
        ${postMeta(post)}
      </div>
      ${restoreControl(post, view)}
    </div>`;
}

function renderCards(posts, view) {
  const items = posts.map((post) => `<li style="list-style:none">${renderCard(post, view)}</li>`).join('');
  return `<ul class="card-grid" style="padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:var(--space-3)" data-testid="post-list-cards">${items}</ul>`;
}

function renderCard(post, view) {
  return `
    <div class="card" style="padding:var(--space-4);gap:var(--space-2);display:flex;flex-direction:column;height:100%">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:var(--space-2)">
        ${postHeadline(post)}
        ${shareCountBadge(post, true)}
      </div>
      ${postExcerpt(post)}
      ${postMeta(post)}
      ${restoreControl(post, view)}
    </div>`;
}

// Restore-to-Unread control (spec): only shown in the Read view, undoes the
// read_posts cookie entry for this post via a plain server round-trip.
function restoreControl(post, view) {
  if (view !== 'read') return '';
  return `
    <form method="post" action="/unarchive/${post.id}" style="flex:none">
      <input type="hidden" name="returnTo" value="/?view=read">
      <button type="submit" class="btn btn-ghost" style="padding:6px 14px;font-size:13px" data-testid="restore-post">Restore</button>
    </form>`;
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
  // Links to the post detail view (ticket #8) rather than straight out to
  // LinkedIn -- the detail page is where "Open on LinkedIn" lives, plus the
  // full share history.
  return `
    <div style="display:flex;flex-wrap:wrap;gap:2px 8px;align-items:baseline;min-width:0">
      <a href="/posts/${post.id}" style="font-weight:700;color:var(--color-text)">${esc(title)}</a>
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
    </div>
    ${sharedByLine(post.sharers)}`;
}

// Shows the member display name AND the raw sender/phone for every sharer
// (spec: acceptable while the deployment is internal-for-now). A sharer with
// no resolved member shows the raw sender alone, labelled pending.
function sharedByLine(sharers) {
  if (!sharers || sharers.length === 0) return '';
  const labels = sharers.map((s) =>
    s.displayName
      ? `${esc(s.displayName)} <span style="color:var(--color-neutral-600)">(${esc(s.rawSender)})</span>`
      : `${esc(s.rawSender)} <span style="color:var(--color-neutral-600)">(pending attribution)</span>`
  );
  return `<div data-testid="shared-by" style="font-size:12px;color:var(--color-neutral-700);margin-top:2px">Shared by ${labels.join(', ')}</div>`;
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

function renderEmptyState({ isAdmin, state }) {
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
      ${renderViewToggle(state)}
      ${isAdmin ? adminCopy : memberCopy}
    </div>
  `;
}
