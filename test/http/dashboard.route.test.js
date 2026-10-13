// Secondary seam: HTTP routes, tested through the route handlers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createTestDb } from '../helpers/testDb.js';
import { createApp } from '../../src/http/app.js';
import { loginAsAdmin } from '../helpers/adminSession.js';

const ADMIN_TOKEN = 'test-admin-token';

async function buildApp() {
  const { db, close } = await createTestDb();
  const app = createApp(db, { adminToken: ADMIN_TOKEN });
  return { app, close, db };
}

test('GET / renders the no-posts-yet empty state for an anonymous visitor', async () => {
  const { app, close } = await buildApp();
  try {
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    assert.match(res.text, /No posts yet/);
    assert.match(res.text, /Last updated: never/);
    assert.doesNotMatch(res.text, /Import a chat export/);
  } finally {
    await close();
  }
});

test('GET / shows admin-flavoured empty-state copy and nav for a logged-in admin', async () => {
  const { app, close } = await buildApp();
  try {
    const agent = await loginAsAdmin(app, ADMIN_TOKEN);
    const res = await agent.get('/');
    assert.equal(res.status, 200);
    assert.match(res.text, />Import</);
    assert.match(res.text, />Review</);
    assert.match(res.text, /Import a chat export/);
  } finally {
    await close();
  }
});

test('GET /import redirects an anonymous visitor to /login', async () => {
  const { app, close } = await buildApp();
  try {
    const res = await request(app).get('/import');
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/login?next=%2Fimport');
  } finally {
    await close();
  }
});

test('GET /import succeeds for a logged-in admin', async () => {
  const { app, close } = await buildApp();
  try {
    const agent = await loginAsAdmin(app, ADMIN_TOKEN);
    const res = await agent.get('/import');
    assert.equal(res.status, 200);
    assert.match(res.text, /Import a chat export/);
  } finally {
    await close();
  }
});

test('GET /review redirects an anonymous visitor to /login', async () => {
  const { app, close } = await buildApp();
  try {
    const res = await request(app).get('/review');
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/login?next=%2Freview');
  } finally {
    await close();
  }
});

test('GET /review succeeds for a logged-in admin', async () => {
  const { app, close } = await buildApp();
  try {
    const agent = await loginAsAdmin(app, ADMIN_TOKEN);
    const res = await agent.get('/review');
    assert.equal(res.status, 200);
    assert.match(res.text, /Review queue/);
  } finally {
    await close();
  }
});

test('the design-system stylesheet is served for the layout to link against', async () => {
  const { app, close } = await buildApp();
  try {
    const res = await request(app).get('/assets/styles.css');
    assert.equal(res.status, 200);
    // The Industry_new2 stylesheet @imports its token files; the accent token
    // now lives in tokens/colors.css, which must also be served for the link
    // to resolve at runtime.
    assert.match(res.text, /tokens\/colors\.css/);
    const colors = await request(app).get('/assets/tokens/colors.css');
    assert.equal(colors.status, 200);
    assert.match(colors.text, /--color-accent/);
  } finally {
    await close();
  }
});

async function seedPosts(db) {
  const member = await db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Ananya Rao');
  const olderPost = await db
    .prepare(
      `INSERT INTO posts (canonical_url, preview_author, first_shared_at, last_shared_at) VALUES (?, ?, ?, ?)`
    )
    .run(
      'https://www.linkedin.com/posts/okr-season-7391',
      'Ananya Rao',
      '2026-09-01T00:00:00.000Z',
      '2026-09-01T00:00:00.000Z'
    );
  const newerPost = await db
    .prepare(`INSERT INTO posts (canonical_url, first_shared_at, last_shared_at) VALUES (?, ?, ?)`)
    .run(
      'https://www.linkedin.com/posts/unattributed-share',
      '2026-09-10T00:00:00.000Z',
      '2026-09-10T00:00:00.000Z'
    );

  await db.prepare(
    `INSERT INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp) VALUES (?, 'group-a', 'Ananya Rao', ?, '2026-09-01T00:00:00.000Z')`
  ).run(Number(olderPost.lastInsertRowid), Number(member.lastInsertRowid));
  await db.prepare(
    `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES (?, 'group-a', '+91 90000 00000', '2026-09-10T00:00:00.000Z')`
  ).run(Number(newerPost.lastInsertRowid));

  return { member, olderPost, newerPost };
}

test('GET / defaults to preview-first, most-recent-first and offers no order/sort control', async () => {
  const { app, close, db } = await buildApp();
  try {
    await seedPosts(db);
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    const okrIndex = res.text.indexOf('okr-season-7391');
    const unattributedIndex = res.text.indexOf('unattributed-share');
    // okr-season has a preview (preview_author set); unattributed-share has
    // none -- preview availability outranks recency, so okr-season leads
    // even though it's the older of the two.
    assert.ok(okrIndex < unattributedIndex, 'the post with a preview should render first, ahead of the newer no-preview post');
    // The share-count sort was removed (it ranked self-promotion, not
    // endorsement): no Order toggle and no most_shared option are rendered.
    assert.doesNotMatch(res.text, /data-testid="sort-toggle"/);
    assert.doesNotMatch(res.text, /most_shared/);
  } finally {
    await close();
  }
});

test('GET /?sort=most_shared is ignored and still orders preview-first, most-recent-first', async () => {
  const { app, close, db } = await buildApp();
  try {
    await seedPosts(db);
    // Give the older post extra shares; a share-count sort would float it, but
    // that sort no longer exists, so the preview/recency order must still win.
    await db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES ((SELECT id FROM posts WHERE canonical_url LIKE '%okr-season%'), 'group-a', '+91 1', '2026-09-02T00:00:00.000Z')`
    ).run();

    const res = await request(app).get('/?sort=most_shared');
    assert.equal(res.status, 200);
    const okrIndex = res.text.indexOf('okr-season-7391');
    const unattributedIndex = res.text.indexOf('unattributed-share');
    assert.ok(okrIndex < unattributedIndex, 'preview/recency order still wins; ?sort=most_shared has no effect');
  } finally {
    await close();
  }
});

test('GET /?member=<id> filters to that member and shows the member header', async () => {
  const { app, close, db } = await buildApp();
  try {
    const { member } = await seedPosts(db);
    const res = await request(app).get(`/?member=${Number(member.lastInsertRowid)}`);
    assert.equal(res.status, 200);
    // The okr post is author-only preview-available (no excerpt), so its
    // card headline is the author name -- the url slug no longer renders.
    assert.match(res.text, /Ananya Rao/);
    assert.doesNotMatch(res.text, /unattributed-share/);
  } finally {
    await close();
  }
});

test('GET /?member=pending filters to posts with an unresolved sharer', async () => {
  const { app, close, db } = await buildApp();
  try {
    await seedPosts(db);
    const res = await request(app).get('/?member=pending');
    assert.equal(res.status, 200);
    assert.match(res.text, /unattributed-share/);
    assert.doesNotMatch(res.text, /okr-season-7391/);
  } finally {
    await close();
  }
});

test('GET /?q=<term> searches the post URL/slug and fetched preview text', async () => {
  const { app, close, db } = await buildApp();
  try {
    await seedPosts(db);
    const res = await request(app).get('/?q=okr');
    assert.equal(res.status, 200);
    // The matched post is author-only preview-available (no excerpt), so its
    // card headline is the author name -- the url slug no longer renders.
    assert.match(res.text, /Ananya Rao/);
    assert.doesNotMatch(res.text, /unattributed-share/);
  } finally {
    await close();
  }
});

test('GET / renders a "Search" submit button grouped directly with the search input', async () => {
  const { app, close, db } = await buildApp();
  try {
    await seedPosts(db);
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    // The submit button is relabelled "Search" (it only submits the typed
    // search text -- the Layout toggle and member select auto-submit on
    // change) and sits immediately next to the search input, not after the
    // other controls. (The date-range filter's own "Apply" button is a
    // separate control further along the same form -- see
    // dashboard.dateRange.route.test.js.)
    const searchGroupMatch = res.text.match(
      /<input class="input" type="search" name="q"[^>]*>\s*<button type="submit" class="btn btn-sm">Search<\/button>/
    );
    assert.ok(searchGroupMatch, 'expected the search input and "Search" button to be adjacent');
  } finally {
    await close();
  }
});

test('GET /?q=<no match> shows the no-results state with a clear/reset action, not the first-run empty state', async () => {
  const { app, close, db } = await buildApp();
  try {
    await seedPosts(db);
    const res = await request(app).get('/?q=nothing-matches-this');
    assert.equal(res.status, 200);
    assert.match(res.text, /No posts match/);
    assert.match(res.text, /data-testid="clear-filters"/);
    assert.doesNotMatch(res.text, /data-testid="empty-state-title"/);
  } finally {
    await close();
  }
});

test('GET / with no posts at all still shows the first-run empty state, not the no-results state', async () => {
  const { app, close } = await buildApp();
  try {
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    assert.match(res.text, /No posts yet/);
    assert.doesNotMatch(res.text, /data-testid="no-results"/);
  } finally {
    await close();
  }
});

// Layout persistence (spec): the Index/Columns choice is a per-device
// cookie, not just a query param, so it survives navigation (e.g. back from
// a post detail page) until the user picks a different layout again.
test('GET / with no ?density and no cookie defaults to the Columns (cards) layout', async () => {
  const { app, close, db } = await buildApp();
  try {
    await seedPosts(db);
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    assert.match(res.text, /data-testid="post-list-cards"/);
    assert.doesNotMatch(res.text, /data-testid="post-list-rows"/);
  } finally {
    await close();
  }
});

test('GET /?density=rows renders the Index layout and sets the layout cookie', async () => {
  const { app, close, db } = await buildApp();
  try {
    await seedPosts(db);
    const res = await request(app).get('/?density=rows');
    assert.equal(res.status, 200);
    assert.match(res.text, /data-testid="post-list-rows"/);
    const setCookie = res.headers['set-cookie'] ?? [];
    assert.ok(setCookie.some((c) => /^layout=rows;/.test(c)), 'expected a layout=rows Set-Cookie header');
  } finally {
    await close();
  }
});

test('GET / carrying only a layout=rows cookie (no ?density) still renders rows -- this is the back-from-detail fix', async () => {
  const { app, close, db } = await buildApp();
  try {
    await seedPosts(db);
    const res = await request(app).get('/').set('Cookie', 'layout=rows');
    assert.equal(res.status, 200);
    assert.match(res.text, /data-testid="post-list-rows"/);
    assert.doesNotMatch(res.text, /data-testid="post-list-cards"/);
  } finally {
    await close();
  }
});

test('GET /?density=cards overrides an existing layout=rows cookie and re-sets the cookie to cards', async () => {
  const { app, close, db } = await buildApp();
  try {
    await seedPosts(db);
    const res = await request(app).get('/?density=cards').set('Cookie', 'layout=rows');
    assert.equal(res.status, 200);
    assert.match(res.text, /data-testid="post-list-cards"/);
    const setCookie = res.headers['set-cookie'] ?? [];
    assert.ok(setCookie.some((c) => /^layout=cards;/.test(c)), 'expected a layout=cards Set-Cookie header');
  } finally {
    await close();
  }
});

// A post is "preview-available" when previewAuthor OR previewExcerpt is set
// (same rule the preview-first sort uses). Author name + excerpt should
// headline the card/row; the generic "From the archive" kicker is reserved
// for posts with neither.
async function seedPreviewAvailablePost(db) {
  const post = await db
    .prepare(
      `INSERT INTO posts (canonical_url, preview_author, preview_role, preview_excerpt, first_shared_at, last_shared_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      'https://www.linkedin.com/posts/okr-season-7391',
      'Ananya Rao',
      'PM @ Acme',
      'Notes on our Q4 OKRs, in full.',
      '2026-09-01T00:00:00.000Z',
      '2026-09-01T00:00:00.000Z'
    );
  const postId = Number(post.lastInsertRowid);
  await db.prepare(
    `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES (?, 'group-a', '+91 1', '2026-09-01T00:00:00.000Z')`
  ).run(postId);
  return postId;
}

async function seedPreviewUnavailablePost(db) {
  const post = await db
    .prepare(`INSERT INTO posts (canonical_url, preview_unavailable, first_shared_at, last_shared_at) VALUES (?, 1, ?, ?)`)
    .run('https://www.linkedin.com/posts/no-preview-9000', '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z');
  const postId = Number(post.lastInsertRowid);
  await db.prepare(
    `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES (?, 'group-a', '+91 2', '2026-09-02T00:00:00.000Z')`
  ).run(postId);
  return postId;
}

test('GET / (cards) shows the author as the kicker and the excerpt as the headline for a preview-available post, with no "From the archive" kicker', async () => {
  const { app, close, db } = await buildApp();
  try {
    await seedPreviewAvailablePost(db);
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /From the archive/);
    const kickerIndex = res.text.indexOf('Ananya Rao');
    const headlineIndex = res.text.indexOf('Notes on our Q4 OKRs');
    assert.ok(kickerIndex !== -1 && headlineIndex !== -1, 'both author kicker and excerpt headline should render');
    assert.ok(kickerIndex < headlineIndex, 'author kicker should render above the excerpt headline');
    // The role byline and the separate story-body excerpt line are dropped --
    // the excerpt is now the headline, so repeating it would duplicate.
    assert.doesNotMatch(res.text, /PM @ Acme/);
  } finally {
    await close();
  }
});

test('GET /?density=rows shows the excerpt as the prominent line and the author as a small label for a preview-available post', async () => {
  const { app, close, db } = await buildApp();
  try {
    await seedPreviewAvailablePost(db);
    const res = await request(app).get('/?density=rows');
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /From the archive/);
    const authorIndex = res.text.indexOf('Ananya Rao');
    const excerptIndex = res.text.indexOf('Notes on our Q4 OKRs');
    assert.ok(authorIndex !== -1 && excerptIndex !== -1);
    assert.ok(authorIndex < excerptIndex, 'the author label should render above the excerpt line');
    assert.doesNotMatch(res.text, /PM @ Acme/);
  } finally {
    await close();
  }
});

test('GET / (cards) still shows "From the archive" for a preview-unavailable post', async () => {
  const { app, close, db } = await buildApp();
  try {
    await seedPreviewUnavailablePost(db);
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    assert.match(res.text, /From the archive/);
    assert.match(res.text, /Preview unavailable/);
  } finally {
    await close();
  }
});

// Layout spec: the header+controls block renders as a single full-width band,
// followed by a horizontal rule, followed by a two-up content row where the
// post-results cell and the Correspondents rail are siblings (results on the
// left, rail on the right).
test('GET / lays out a full-width controls band, a rule, then the results cell and the correspondent rail as content-row siblings', async () => {
  const { app, close, db } = await buildApp();
  try {
    await seedPosts(db);
    const res = await request(app).get('/');
    assert.equal(res.status, 200);

    const bandMatch = res.text.match(/<div data-testid="dashboard-band"[^>]*>/);
    const ruleMatch = res.text.match(/<hr class="rule-heavy"[^>]*>/);
    const contentRowMatch = res.text.match(/<div class="np-content-row"[^>]*>/);
    const postCellMatch = res.text.match(/<section data-testid="post-list-cell"[^>]*>/);
    const railMatch = res.text.match(/<aside data-testid="member-rail"[^>]*>/);

    assert.ok(bandMatch, 'expected a full-width dashboard band');
    assert.ok(ruleMatch, 'expected a rule under the band');
    assert.ok(contentRowMatch, 'expected a content row after the rule');
    assert.ok(postCellMatch, 'expected the post-list cell inside the content row');
    assert.ok(railMatch, 'expected the correspondent rail inside the content row');

    // Ordering: band, then rule, then content row containing both siblings.
    assert.ok(bandMatch.index < ruleMatch.index);
    assert.ok(ruleMatch.index < contentRowMatch.index);
    assert.ok(contentRowMatch.index < postCellMatch.index);
    assert.ok(postCellMatch.index < railMatch.index);

    // The "Correspondents" head and the name list are recombined into one
    // rail block (no separate member-rail-head testid anymore).
    assert.doesNotMatch(res.text, /data-testid="member-rail-head"/);
    assert.match(res.text, /data-testid="member-rail"[^]*?Correspondents/);
  } finally {
    await close();
  }
});

test('GET /?density=rows still renders a preview-unavailable post without an author label or excerpt text', async () => {
  const { app, close, db } = await buildApp();
  try {
    await seedPreviewUnavailablePost(db);
    const res = await request(app).get('/?density=rows');
    assert.equal(res.status, 200);
    assert.match(res.text, /Preview unavailable/);
  } finally {
    await close();
  }
});
