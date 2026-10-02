import { esc } from './layout.js';

/**
 * Renders the dashboard body in the Industry_new2 "front page" idiom: the
 * first-run empty state ("No posts yet") when the board has no data at all;
 * otherwise the discovery controls (search, order, layout, filter-by-member)
 * plus the post list -- rows render as a ruled newspaper index, cards as
 * column stories -- and a "Correspondents" rail. Group is never shown, per the
 * group-hidden decision (D1).
 * @param {{ posts: Array<object> }} data
 * @param {{
 *   isAdmin: boolean,
 *   density?: 'rows'|'cards',
 *   sort?: 'recent',
 *   search?: string,
 *   activeMember?: { type: 'member', id: number, displayName: string } | { type: 'pending' } | null,
 *   filterOptions: { totalCount: number, pendingCount: number, members: Array<{ id: number, displayName: string, postCount: number }> },
 * }} params
 */
export function renderDashboard(
  { posts },
  { isAdmin, density = 'cards', sort = 'recent', search = '', activeMember = null, filterOptions, view = 'unread' }
) {
  const hasAnyData = (filterOptions?.totalCount ?? 0) > 0;
  const state = { search, sort, density, activeMember, view };
  if (!hasAnyData) {
    return renderEmptyState({ isAdmin, state });
  }

  const rail = renderCorrespondentsRail(filterOptions, activeMember, state);
  const header = renderHeader(activeMember, posts.length);
  const controls = renderControls(state, filterOptions, activeMember);
  const viewToggle = renderViewToggle(state);
  const results =
    posts.length === 0 ? renderNoResults(search, activeMember) : renderPostList(posts, density, view);

  return `
    <style>
      [data-testid="member-select"] { display: none; }
      .np-toggle { display:flex; gap:var(--space-3); align-items:center; }
      .np-toggle > span { font:600 var(--text-xs)/1.3 var(--font-ui); letter-spacing:.12em; text-transform:uppercase; color:var(--color-muted); }
      .np-toggle label { position:relative; font:600 12px/1.2 var(--font-ui); letter-spacing:.12em; text-transform:uppercase; color:var(--color-muted); padding:4px 0; border-bottom:2px solid transparent; cursor:pointer; }
      .np-toggle label:hover { color:var(--color-accent-text); }
      .np-toggle label:has(input:checked) { color:var(--color-text); font-weight:800; border-bottom-color:var(--color-accent); }
      .np-toggle input { position:absolute; opacity:0; width:0; height:0; }
      .np-toggle input:focus-visible + span { outline:2px solid var(--color-accent); outline-offset:3px; }
      @media (max-width: 760px) {
        [data-testid="member-rail"] { display: none; }
        [data-testid="member-select"] { display: block; }
      }
    </style>
    <div style="display:flex;flex-wrap:wrap;gap:var(--space-8);align-items:flex-start">
      <section style="flex:999 1 520px;min-width:0">
        ${header}
        ${viewToggle}
        ${controls}
        ${results}
      </section>
      ${rail}
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
  const current = state.view ?? 'unread';
  const links = options
    .map(([value, label]) => {
      const active = current === value;
      const activeStyle = active
        ? 'color:var(--color-text);font-weight:800;border-bottom-color:var(--color-accent)'
        : 'color:var(--color-muted);border-bottom-color:transparent';
      return `<a href="${buildHref(state, { view: value })}" aria-current="${active}" style="text-decoration:none;font:600 12px/1.2 var(--font-ui);letter-spacing:.12em;text-transform:uppercase;padding:4px 0;border-bottom:2px solid transparent;${activeStyle}">${label}</a>`;
    })
    .join('');
  return `<div data-testid="view-toggle" role="group" aria-label="View" style="display:flex;gap:var(--space-4);align-items:center;margin:var(--space-3) 0">${links}</div>`;
}

// Builds a /?… href carrying forward the current search/sort/density/member
// state, so switching one control never silently drops another. `overrides`
// wins over `state` per key; `overrides.member === ''` explicitly clears the
// member filter (the "Everyone" link).
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
      <div class="kicker">The front page</div>
      <h1 class="headline headline-xl" style="margin:var(--space-2) 0 var(--space-4);max-width:18ch">Every post the groups shared</h1>
    `;
  }

  const backLink = (st) =>
    `<a class="btn btn-link" href="${buildHref(st, { member: '' })}" style="margin-bottom:var(--space-3)">← Back to the front page</a>`;

  if (activeMember.type === 'pending') {
    return `
      ${backLink({ activeMember })}
      <div class="kicker kicker-sepia">Byline pending</div>
      <h1 class="headline headline-lg" style="margin:var(--space-2) 0 var(--space-2)">Pending attribution</h1>
      <p class="standfirst" style="max-width:60ch">Posts with at least one share from a sender who isn't matched to a member yet. They're counted normally; only the name is waiting.</p>
      <hr class="rule-double" />
    `;
  }

  const postWord = resultCount === 1 ? 'post' : 'posts';
  return `
    ${backLink({ activeMember })}
    <div style="display:flex;gap:var(--space-4);align-items:center;flex-wrap:wrap">
      <span style="width:72px;height:72px;flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--color-accent-2-200);color:var(--color-accent-2-800);font-family:var(--font-display);font-size:28px">${esc(initials(activeMember.displayName))}</span>
      <div>
        <div class="kicker">Correspondent's file</div>
        <h1 class="headline headline-lg" style="margin:4px 0" data-testid="member-header-name">${esc(activeMember.displayName)}</h1>
        <p class="standfirst" style="margin:0">${resultCount} ${postWord} passed along</p>
      </div>
    </div>
    <hr class="rule-double" />
  `;
}

function renderControls(state, filterOptions, activeMember) {
  const memberSelect = renderMemberSelect(filterOptions, activeMember);
  // No "Order" toggle: the board always lists most-recently-shared first.
  // A share-count order was removed (it ranked self-promotion, not endorsement).
  const densityToggle = radioToggle('Layout', 'density', [
    ['rows', 'Index'],
    ['cards', 'Columns'],
  ], state.density, 'density-toggle');

  return `
    <form method="get" action="/" data-testid="dashboard-controls" style="display:flex;flex-wrap:wrap;gap:var(--space-4) var(--space-6);align-items:flex-end;padding-bottom:var(--space-3);margin-bottom:var(--space-4);border-bottom:1px solid var(--color-text)">
      ${memberParamFor(activeMember) ? `<input type="hidden" name="member" value="${esc(memberParamFor(activeMember))}">` : ''}
      <input class="input" type="search" name="q" placeholder="Search the archive…" value="${esc(state.search)}" aria-label="Search posts" style="flex:1 1 240px;min-width:0">
      ${densityToggle}
      ${memberSelect}
      <button type="submit" class="btn btn-sm">Apply</button>
    </form>
  `;
}

function radioToggle(label, name, options, current, testid) {
  const opts = options
    .map(
      ([value, text]) =>
        `<label><input type="radio" name="${name}" value="${value}" onchange="this.form.requestSubmit()" ${current === value ? 'checked' : ''}><span>${text}</span></label>`
    )
    .join('');
  return `<div class="np-toggle" role="radiogroup" aria-label="${label}" data-testid="${testid}"><span>${label}</span>${opts}</div>`;
}

function renderMemberSelect(filterOptions, activeMember) {
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
  // Narrow-viewport replacement for the correspondents rail. name="member"
  // deliberately shadows the hidden input of the same name the form may render.
  return `<select data-testid="member-select" class="input" name="member" aria-label="Filter by correspondent" onchange="this.form.requestSubmit()" style="flex:1 1 180px">${options.join('')}</select>`;
}

function renderCorrespondentsRail(filterOptions, activeMember, state) {
  const items = [
    {
      href: buildHref(state, { member: '' }),
      label: 'Everyone',
      count: filterOptions.totalCount,
      active: !activeMember,
    },
    ...filterOptions.members.map((m) => ({
      href: buildHref(state, { member: String(m.id) }),
      label: m.displayName,
      count: m.postCount,
      active: activeMember?.type === 'member' && activeMember.id === m.id,
    })),
  ];
  if (filterOptions.pendingCount > 0) {
    items.push({
      href: buildHref(state, { member: 'pending' }),
      label: 'Pending attribution',
      count: filterOptions.pendingCount,
      active: activeMember?.type === 'pending',
    });
  }

  const rows = items.map(correspondentRow).join('');
  return `
    <aside data-testid="member-rail" style="flex:1 1 220px;max-width:280px;min-width:0;position:sticky;top:var(--space-6);border-top:var(--rule-heavy) solid var(--color-text);padding-top:var(--space-3)">
      <h3 class="headline headline-sm" style="margin:0">Correspondents</h3>
      <p class="standfirst" style="font-size:var(--text-sm);margin:0 0 var(--space-3)">Who passed along what. Select a name to read their file.</p>
      <div style="display:flex;flex-direction:column">${rows}</div>
    </aside>
  `;
}

function correspondentRow({ href, label, count, active }) {
  const nameStyle = active
    ? 'color:var(--color-accent-800);font-weight:700'
    : 'color:var(--color-text)';
  const marker = active ? '▸ ' : '';
  return `
    <a href="${href}" aria-current="${active}" style="text-decoration:none;font:var(--text-base)/1.3 var(--font-ui);display:flex;align-items:baseline;gap:6px;padding:6px 0;${nameStyle}">
      <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${marker}${esc(label)}</span>
      <span style="flex:1;border-bottom:1.5px dotted var(--color-neutral-500);transform:translateY(-4px)"></span>
      <span style="font-family:var(--font-mono)">${count}</span>
    </a>`;
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
    <div data-testid="no-results" class="empty">
      <div class="kicker">No stories filed</div>
      <h2 class="headline headline-lg" style="margin:var(--space-2) 0">${title}</h2>
      <p class="standfirst">Try another word, or clear the correspondent filter.</p>
      <a class="btn" href="/" data-testid="clear-filters" style="margin-top:var(--space-2)">Clear search and filters</a>
    </div>
  `;
}

// Rows density: the ruled newspaper index. Each row links to the post detail;
// in the Read view it also carries a Restore-to-Unread control.
function renderRows(posts, view) {
  const rows = posts.map((post) => indexRow(post, view)).join('');
  return `<div class="index" data-testid="post-list-rows">${rows}</div>`;
}

// Restore-to-Unread control: only shown in the Read view; undoes this post's
// read_posts cookie entry via a plain server round-trip (no client JS).
function restoreControl(post, view) {
  if (view !== 'read') return '';
  return `
    <form method="post" action="/unarchive/${post.id}" style="flex:none">
      <input type="hidden" name="returnTo" value="/?view=read">
      <button type="submit" class="btn btn-link" data-testid="restore-post">Restore to unread</button>
    </form>`;
}

function indexRow(post, view) {
  const title = post.previewAuthor || 'Preview unavailable';
  const row = `
    <a class="index-row" href="/posts/${post.id}" style="flex:1 1 auto;grid-template-columns:minmax(0,1fr)">
      <span style="min-width:0">
        <span class="headline headline-sm" style="display:block">${esc(title)}</span>
        ${post.previewRole ? `<span class="meta" style="display:block">${esc(post.previewRole)}</span>` : ''}
        <span style="display:block;font:var(--text-sm)/1.45 var(--font-body);color:var(--color-neutral-800);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(post.previewExcerpt || post.url)}</span>
        ${indexMeta(post)}
      </span>
    </a>`;
  const restore = restoreControl(post, view);
  return restore
    ? `<div style="display:flex;align-items:center;gap:var(--space-4)">${row}${restore}</div>`
    : row;
}

function indexMeta(post) {
  const dateRange = formatDateRange(post.firstSharedAt, post.lastSharedAt);
  return `
    <span style="display:flex;flex-wrap:wrap;gap:2px 10px;align-items:center;font:var(--text-sm)/1.4 var(--font-ui);color:var(--color-muted);margin-top:4px">
      ${sharedBy(post.sharers)}
      ${dateRange ? `<span class="dateline">${esc(dateRange)}</span>` : ''}
      ${post.pendingAttribution ? '<span class="tag tag-dashed">Pending attribution</span>' : ''}
    </span>`;
}

// Cards density: column stories (CSS multi-column), each a block linking to
// its detail page. No photos: the app carries no imagery.
function renderCards(posts, view) {
  const stories = posts.map((post) => columnStory(post, view)).join('');
  return `<div class="columns" data-testid="post-list-cards">${stories}</div>`;
}

function columnStory(post, view) {
  const title = post.previewAuthor || 'Preview unavailable';
  const story = `
    <a class="story story-link" href="/posts/${post.id}" style="display:block">
      <div class="kicker-row">
        <span class="kicker">From the archive</span>
        ${post.pendingAttribution ? '<span class="kicker kicker-sepia">Pending attribution</span>' : ''}
      </div>
      <h3 class="headline headline-md">${esc(title)}</h3>
      ${post.previewRole ? `<div class="byline">${esc(post.previewRole)}</div>` : ''}
      <p class="story-body">${esc(post.previewExcerpt || post.url)}</p>
      <div class="story-foot meta">
        ${sharedBy(post.sharers)}
        <span class="dateline" style="white-space:nowrap">${esc(formatDateRange(post.firstSharedAt, post.lastSharedAt))}</span>
      </div>
    </a>`;
  const restore = restoreControl(post, view);
  return restore
    ? `<div class="story" style="break-inside:avoid">${story}${restore}</div>`
    : story;
}

// Shows the member display name AND the raw sender/phone for every sharer
// (spec: acceptable while the deployment is internal-for-now). A sharer with
// no resolved member shows the raw sender alone, labelled pending.
function sharedBy(sharers) {
  if (!sharers || sharers.length === 0) return '';
  const labels = sharers.map((s) =>
    s.displayName
      ? `${esc(s.displayName)} <span style="color:var(--color-neutral-600)">(${esc(s.rawSender)})</span>`
      : `${esc(s.rawSender)} <span style="color:var(--color-neutral-600)">(pending attribution)</span>`
  );
  return `<span data-testid="shared-by">Passed along by ${labels.join(', ')}</span>`;
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
    <p class="standfirst" style="max-width:52ch">Bring in a WhatsApp chat export and every LinkedIn post shared in it is printed here once, with who passed it along and when.</p>
    <a class="btn btn-ink" href="/import" style="margin-top:var(--space-4)">Import a chat export</a>
  `;
  const memberCopy = `
    <p class="standfirst" style="max-width:52ch">The presses are quiet. Posts shared in the groups will appear here after the admin brings in the first chat export.</p>
  `;

  return `
    <div class="empty anim-rise">
      <div class="kicker">Stop the presses</div>
      <h1 class="headline headline-xl" data-testid="empty-state-title" style="margin:var(--space-2) 0 var(--space-3)">No posts yet</h1>
      ${renderViewToggle(state)}
      ${isAdmin ? adminCopy : memberCopy}
    </div>
  `;
}
