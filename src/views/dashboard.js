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
 *   from?: string, to?: string,
 *   dateRangeBounds?: { min: string | null, max: string | null } | null,
 * }} params
 */
export function renderDashboard(
  { posts },
  {
    isAdmin,
    density = 'cards',
    sort = 'recent',
    search = '',
    activeMember = null,
    filterOptions,
    view = 'unread',
    from = '',
    to = '',
    dateRangeBounds = null,
    gutterPhotos = [],
    guttersHidden = false,
  }
) {
  const hasAnyData = (filterOptions?.totalCount ?? 0) > 0;
  const state = { search, sort, density, activeMember, view, from, to };
  // Gutter photo ads (spec): Posts-page-only chrome, rendered here rather
  // than in layout.js so Import/Review/Login/Post-detail never get it for
  // free. guttersHidden (the gutters_hidden cookie) suppresses rendering
  // entirely -- no markup at all -- so a dismissed visitor never sees a
  // flash of ad content on reload. Shown regardless of hasAnyData: it's page
  // chrome, not part of the post list.
  const gutterAds = guttersHidden ? '' : renderGutterAds(gutterPhotos);
  if (!hasAnyData) {
    return gutterAds + renderEmptyState({ isAdmin, state });
  }

  const rail = renderCorrespondentsRail(filterOptions, activeMember, state);
  const header = renderHeader(activeMember, posts.length);
  const controls = renderControls(state, filterOptions, activeMember, dateRangeBounds);
  const viewToggle = renderViewToggle(state);
  const results =
    posts.length === 0 ? renderNoResults(search, activeMember, state) : renderPostList(posts, density, view);

  // Full-width band (header + view toggle + controls) spans the container,
  // then a rule, then a flex content row: the post list takes the freed-up
  // width on the left (its auto-fill card grid naturally gains columns) and
  // the Correspondents rail sits to the right at its old ~220-280px width,
  // `position:sticky` so it stays visible while the post list scrolls.
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
      .np-content-row { display:flex; gap:var(--space-8); align-items:flex-start; position:relative; z-index:20; }
      .np-content-row > * { min-width:0; }
      .np-content-row [data-testid="post-list-cell"] { flex:1 1 auto; }
      .np-content-row [data-testid="member-rail"] {
        flex:0 1 280px;
        min-width:220px;
        max-width:280px;
        position:sticky;
        top:var(--space-6);
      }
      @media (max-width: 760px) {
        [data-testid="member-rail"] { display: none; }
        [data-testid="member-select"] { display: block; }
        .np-content-row { display:block; }
      }
    </style>
    ${gutterAds}
    <div data-testid="dashboard-band">
      ${header}
      ${viewToggle}
      ${controls}
    </div>
    <hr class="rule-heavy">
    <div class="np-content-row">
      <section data-testid="post-list-cell">
        ${results}
      </section>
      ${rail}
    </div>
  `;
}

// Fisher-Yates, pure (returns a new array) -- used only to pick which 6 of
// the 15 gutter photos are visible at page load; rotation afterwards is the
// client script's job (gutter-ads.js).
function shuffled(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Newspaper gutter photo ads (spec): two `position:fixed` <aside>s pinned to
// the left/right viewport edges, outside the centred 1200px column, each
// showing 3 of the 15 B&W photos. `photoFilenames` is the full pool (read
// from disk by app.js, server-side, no hardcoded list); guarded here for an
// empty/missing list -- renders nothing rather than two empty asides.
//
// Entrance (Q9): starts at opacity:0 and is faded in by gutter-ads.js once
// the card-convergence-blast entrance animation finishes (see that script
// for the exact hook). z-index:1 keeps it below the content row
// (.np-content-row is z-index:20) and the convergence overlay (z-index in
// the tens of thousands in motion.css), and pointer-events are scoped to
// just the photo/close-button area so the fixed aside's own box never
// intercepts clicks on the page beneath it.
//
// Newspaper look (Q3): var(--texture-paper) (already defined in
// Industry_new2/tokens/colors.css for the page's own paper-grain) is reused
// as a multiply-blended overlay for the grain, plus a thin double rule
// frame in var(--color-text) -- no halftone dot screen.
//
// Rotation pool: the full photo list is embedded as a comma-joined
// data-photos attribute so gutter-ads.js knows every candidate for the 5s
// cross-fade, not just the 6 initially visible.
function renderGutterAds(photoFilenames) {
  if (!Array.isArray(photoFilenames) || photoFilenames.length === 0) return '';

  const pool = shuffled(photoFilenames);
  const left = pool.slice(0, 3);
  const right = pool.slice(3, 6);
  if (left.length === 0 && right.length === 0) return '';

  const slot = (filename) => `
      <div class="gutter-slot" data-gutter-slot>
        <img src="/assets/gutter-photos/${esc(filename)}" alt="" loading="lazy" data-gutter-img="${esc(filename)}">
      </div>`;

  const aside = (testId, label, closeLabel, filenames) => `
    <aside class="gutter-ads" data-testid="${testId}" aria-label="${esc(label)}">
      <button type="button" class="gutter-close" data-gutter-close aria-label="${esc(closeLabel)}">&times;</button>
      ${filenames.map(slot).join('')}
    </aside>`;

  return `
    <style>
      .gutter-ads-root { position:fixed; inset:0; z-index:1; pointer-events:none; opacity:0; transition:opacity 900ms ease; }
      .gutter-ads-root.gutter-ads-visible { opacity:1; }
      @media (prefers-reduced-motion: reduce) { .gutter-ads-root { transition:none; } }
      .gutter-ads {
        position:fixed; top:50%; transform:translateY(-50%);
        /* Fluid width: fill the side margin outside the 1200px column, capped
           at 220px. The -space-12 absorbs the edge inset + the gap to the
           content column + the scrollbar width (100vw includes the scrollbar
           on Windows), so the panel never overlaps the content. */
        width:min(220px, calc((100vw - 1200px) / 2 - var(--space-12)));
        display:flex; flex-direction:column; gap:var(--space-4);
        pointer-events:auto;
      }
      .gutter-ads[data-testid="gutter-left"] { left:var(--space-4); }
      .gutter-ads[data-testid="gutter-right"] { right:var(--space-4); }
      /* Only show once the margin can actually hold a ~110px+ panel. Below
         this the gutters would crowd the reading column, so they hide (like
         news-site rail ads collapsing on narrow screens). */
      @media (max-width: 1520px) { .gutter-ads { display:none; } }
      .gutter-close {
        align-self:flex-end; width:28px; height:28px; flex:none;
        background:var(--color-surface); border:var(--rule-mid) solid var(--color-text);
        font:600 16px/1 var(--font-ui); color:var(--color-text); cursor:pointer;
      }
      .gutter-close:hover { background:var(--color-accent-100); }
      .gutter-close:focus-visible { outline:2px solid var(--color-accent); outline-offset:2px; }
      .gutter-slot {
        position:relative; width:220px; height:min(28vh, 300px);
        background:var(--color-surface);
        box-shadow:0 0 0 1px var(--color-bg), 0 0 0 5px var(--color-text), var(--shadow-sm);
        overflow:hidden;
      }
      .gutter-slot::after {
        content:""; position:absolute; inset:0; pointer-events:none;
        background-image:var(--texture-paper); mix-blend-mode:multiply; opacity:.6;
      }
      .gutter-slot img {
        position:absolute; inset:0; width:100%; height:100%;
        object-fit:cover; object-position:center; display:block;
        transition:opacity 450ms ease;
      }
      @media (prefers-reduced-motion: reduce) { .gutter-slot img { transition:none; } }
    </style>
    <div class="gutter-ads-root" data-testid="gutter-ads-root" data-photos="${esc(photoFilenames.join(','))}">
      ${aside('gutter-left', 'Gallery', 'Close galleries', left)}
      ${aside('gutter-right', 'Gallery', 'Close galleries', right)}
    </div>
  `;
}

// Test-only alias: exercises the empty/missing-photo-list guard directly at
// the view layer, since the HTTP seam always sees this repo's real,
// populated Industry_new2/gutter-photos/ directory (see
// dashboard.gutterAds.route.test.js for why).
export const renderGutterAdsForTest = renderGutterAds;

export const BATCH_SIZE = 18;

function renderPostList(posts, density, view) {
  const initialPosts = posts.slice(0, BATCH_SIZE);
  const remainingCount = posts.length - initialPosts.length;
  const initialBand =
    density === 'rows' ? renderRows(initialPosts, view) : renderCards(initialPosts, view);

  if (remainingCount <= 0) {
    return `
      <div data-testid="post-list-container">
        ${initialBand}
        <div class="edition-colophon" data-testid="edition-colophon">
          <span>❖ All dispatches in this edition have been printed ❖</span>
        </div>
      </div>
    `;
  }

  return `
    <div data-testid="post-list-container">
      ${initialBand}
      <div class="edition-trigger-wrap" data-testid="edition-trigger-wrap">
        <button type="button" class="edition-trigger" data-next-offset="${BATCH_SIZE}" data-remaining-count="${remainingCount}" data-density="${density}" data-view="${view}">
          <span>📰 Print Next Edition (${remainingCount} Dispatches Remaining)</span>
        </button>
      </div>
    </div>
  `;
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
  if (merged.from) params.set('from', merged.from);
  if (merged.to) params.set('to', merged.to);

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

function renderControls(state, filterOptions, activeMember, dateRangeBounds) {
  const memberSelect = renderMemberSelect(filterOptions, activeMember);
  // No "Order" toggle: the board always lists most-recently-shared first.
  // A share-count order was removed (it ranked self-promotion, not endorsement).
  const densityToggle = radioToggle('Layout', 'density', [
    ['rows', 'Index'],
    ['cards', 'Columns'],
  ], state.density, 'density-toggle');
  const dateRangeFilter = renderDateRangeFilter(state, dateRangeBounds);

  return `
    <form method="get" action="/" data-testid="dashboard-controls" style="display:flex;flex-wrap:wrap;gap:var(--space-4) var(--space-6);align-items:flex-end;padding-bottom:var(--space-3);margin-bottom:var(--space-4);border-bottom:1px solid var(--color-text)">
      ${memberParamFor(activeMember) ? `<input type="hidden" name="member" value="${esc(memberParamFor(activeMember))}">` : ''}
      <div style="display:flex;gap:var(--space-2);flex:1 1 240px;min-width:0">
        <input class="input" type="search" name="q" placeholder="Search the archive…" value="${esc(state.search)}" aria-label="Search posts" style="flex:1 1 auto;min-width:0">
        <button type="submit" class="btn btn-sm">Search</button>
      </div>
      ${densityToggle}
      ${memberSelect}
      ${dateRangeFilter}
    </form>
  `;
}

// Date-range filter (spec): two native <input type="date"> inside the same
// GET form as search/density/member, so the "Apply" button submits every
// control's current value together -- no hidden inputs needed to preserve
// the other filters. min/max come from getDateRangeBounds (the
// member/search/view-filtered set, excluding the date filter itself); From
// and To mutually constrain each other's bound from whichever is currently
// selected. An active selection is rendered verbatim even if it now falls
// outside the recomputed bounds -- never clamped or reset.
function renderDateRangeFilter(state, bounds) {
  const boundMin = bounds?.min ?? '';
  const boundMax = bounds?.max ?? '';
  const fromAttrs = dateInputAttrs(boundMin, state.to || boundMax);
  const toAttrs = dateInputAttrs(state.from || boundMin, boundMax);
  const clearLink = state.from || state.to
    ? `<a class="btn btn-link" href="${buildHref(state, { from: '', to: '' })}" data-testid="clear-dates">Clear dates</a>`
    : '';

  return `
    <div data-testid="date-range-filter" style="display:flex;gap:var(--space-2);align-items:flex-end">
      <label style="display:flex;flex-direction:column;gap:2px;font:600 11px/1.2 var(--font-ui);letter-spacing:.08em;text-transform:uppercase;color:var(--color-muted)">
        From
        <input class="input" type="date" name="from" value="${esc(state.from)}"${fromAttrs} aria-label="From date">
      </label>
      <label style="display:flex;flex-direction:column;gap:2px;font:600 11px/1.2 var(--font-ui);letter-spacing:.08em;text-transform:uppercase;color:var(--color-muted)">
        To
        <input class="input" type="date" name="to" value="${esc(state.to)}"${toAttrs} aria-label="To date">
      </label>
      <button type="submit" class="btn btn-sm" data-testid="date-range-apply">Apply</button>
      ${clearLink}
    </div>
  `;
}

function dateInputAttrs(min, max) {
  const minAttr = min ? ` min="${esc(min)}"` : '';
  const maxAttr = max ? ` max="${esc(max)}"` : '';
  return `${minAttr}${maxAttr}`;
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

// A single <aside> holding the rail head (title + subtitle) and the name
// list together, sticky-positioned so it stays visible while the post list
// scrolls past it in the content row.
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
    <aside data-testid="member-rail" style="border-top:var(--rule-heavy) solid var(--color-text);padding-top:var(--space-3)">
      <h3 class="headline headline-sm" style="margin:0">Correspondents</h3>
      <p class="standfirst" style="font-size:var(--text-sm);margin:0">Who passed along what. Select a name to read their file.</p>
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

function renderNoResults(search, activeMember, state = {}) {
  // Date-range empty state (spec) takes priority over the generic
  // search/filter one -- it's the filter most likely to be the actual cause
  // when it's active, and it carries its own targeted Clear dates fix.
  const dateRangeActive = Boolean(state.from || state.to);
  const title = dateRangeActive
    ? 'No posts shared in this date range'
    : search
    ? `No posts match “${esc(search)}”`
    : 'No posts for this filter';
  const clearDatesLink = dateRangeActive
    ? `<a class="btn btn-link" href="${buildHref(state, { from: '', to: '' })}" data-testid="clear-dates">Clear dates</a>`
    : '';

  return `
    <div data-testid="no-results" class="empty">
      <div class="kicker">No stories filed</div>
      <h2 class="headline headline-lg" style="margin:var(--space-2) 0">${title}</h2>
      <p class="standfirst">Try another word, or clear the correspondent filter.</p>
      <div style="display:flex;gap:var(--space-3);align-items:center;margin-top:var(--space-2)">
        <a class="btn" href="/" data-testid="clear-filters">Clear search and filters</a>
        ${clearDatesLink}
      </div>
    </div>
  `;
}

export function renderEditionFragment(posts, { offset, totalCount, density, view, editionIndex = 2 }) {
  const nextOffset = offset + posts.length;
  const remainingCount = Math.max(0, totalCount - nextOffset);
  const band =
    density === 'rows'
      ? `<div class="index edition-band" data-edition="${editionIndex}">${posts.map((post, i) => indexRow(post, view, offset + i)).join('')}</div>`
      : `<div class="columns edition-band" data-edition="${editionIndex}">${posts.map((post, i) => columnStory(post, view, offset + i)).join('')}</div>`;

  const footer =
    remainingCount > 0
      ? `
        <div class="edition-trigger-wrap" data-testid="edition-trigger-wrap">
          <button type="button" class="edition-trigger" data-next-offset="${nextOffset}" data-remaining-count="${remainingCount}" data-density="${density}" data-view="${view}">
            <span>📰 Print Next Edition (${remainingCount} Dispatches Remaining)</span>
          </button>
        </div>`
      : `
        <div class="edition-colophon" data-testid="edition-colophon">
          <span>❖ All dispatches in this edition have been printed ❖</span>
        </div>`;

  return `
    <div class="edition-divider">
      <span class="kicker">Edition ${editionIndex}</span>
      <span class="meta">${posts.length} Dispatches · Printed from archive</span>
    </div>
    ${band}
    ${footer}
  `;
}

// Rows density: the ruled newspaper index. Each row links to the post detail;
// in the Read view it also carries a Restore-to-Unread control.
function renderRows(posts, view) {
  const rows = posts.map((post, i) => indexRow(post, view, i)).join('');
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

function indexRow(post, view, index = 0) {
  const { label, headline } = previewAvailable(post)
    ? rowPreviewText(post)
    : { label: '', headline: 'Preview unavailable' };
  const row = `
    <a class="index-row anim-card-block" href="/posts/${post.id}" style="--i:${index};flex:1 1 auto;grid-template-columns:minmax(0,1fr)">
      <span style="min-width:0">
        ${label ? `<span class="meta" style="display:block">${esc(label)}</span>` : ''}
        <span class="headline headline-sm" style="display:block">${esc(headline)}</span>
        ${previewAvailable(post) ? '' : `<span style="display:block;font:var(--text-sm)/1.45 var(--font-body);color:var(--color-neutral-800);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(post.url)}</span>`}
        ${indexMeta(post)}
      </span>
    </a>`;
  const restore = restoreControl(post, view);
  return restore
    ? `<div class="anim-card-block" style="--i:${index};display:flex;align-items:center;gap:var(--space-4)">${row}${restore}</div>`
    : row;
}

// A post is "preview-available" when either field the preview-first sort
// relies on is set -- same rule, so a post the sort treats as "has a
// preview" never falls back to the "From the archive" / url copy here.
function previewAvailable(post) {
  return Boolean(post.previewAuthor || post.previewExcerpt);
}

// Prominent line = the excerpt, author name = the small label above it.
// Fallbacks (never show the same string as both): author-only -> author is
// the headline, no label; excerpt-only -> excerpt is the headline, no label.
function rowPreviewText(post) {
  if (post.previewExcerpt) {
    return { label: post.previewAuthor || '', headline: post.previewExcerpt };
  }
  return { label: '', headline: post.previewAuthor };
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
  const stories = posts.map((post, i) => columnStory(post, view, i)).join('');
  return `<div class="columns" data-testid="post-list-cards">${stories}</div>`;
}

// Cards clamp the excerpt-as-headline to a few lines via CSS so a long post
// can't blow up the card layout (the excerpt is otherwise shown in full).
const HEADLINE_CLAMP_STYLE = 'display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden';

function columnStory(post, view, index = 0) {
  const { kicker, headline } = previewAvailable(post)
    ? cardPreviewText(post)
    : { kicker: 'From the archive', headline: 'Preview unavailable' };
  const story = `
    <a class="story story-link anim-card-block" href="/posts/${post.id}" style="--i:${index};display:block">
      <div class="kicker-row">
        ${kicker ? `<span class="kicker">${esc(kicker)}</span>` : ''}
        ${post.pendingAttribution ? '<span class="kicker kicker-sepia">Pending attribution</span>' : ''}
      </div>
      <h3 class="headline headline-md" style="${HEADLINE_CLAMP_STYLE}">${esc(headline)}</h3>
      ${previewAvailable(post) ? '' : `<p class="story-body">${esc(post.url)}</p>`}
      <div class="story-foot meta">
        ${sharedBy(post.sharers)}
        <span class="dateline" style="white-space:nowrap">${esc(formatDateRange(post.firstSharedAt, post.lastSharedAt))}</span>
      </div>
    </a>`;
  const restore = restoreControl(post, view);
  return restore
    ? `<div class="story anim-card-block" style="--i:${index};break-inside:avoid">${story}${restore}</div>`
    : story;
}

// Kicker = author name, headline = excerpt. Fallbacks (never show the same
// string as both kicker and headline): author-only -> headline is the
// author name, no kicker; excerpt-only -> headline is the excerpt, no kicker.
function cardPreviewText(post) {
  if (post.previewExcerpt) {
    return { kicker: post.previewAuthor || '', headline: post.previewExcerpt };
  }
  return { kicker: '', headline: post.previewAuthor };
}

// Shows "by <member display name>" for a matched sharer (the raw sender/phone
// contact string is intentionally not shown). A sharer with no resolved member
// shows the raw sender alone, labelled pending attribution.
function sharedBy(sharers) {
  if (!sharers || sharers.length === 0) return '';
  const labels = sharers.map((s) =>
    s.displayName
      ? esc(s.displayName)
      : `${esc(s.rawSender)} <span style="color:var(--color-neutral-600)">(pending attribution)</span>`
  );
  return `<span data-testid="shared-by">by ${labels.join(', ')}</span>`;
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
