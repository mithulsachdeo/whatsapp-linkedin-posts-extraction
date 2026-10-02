// Secondary seam: HTTP routes, tested through the route handlers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createTestDb } from '../helpers/testDb.js';
import { createApp } from '../../src/http/app.js';

const ADMIN_TOKEN = 'test-admin-token';

function buildApp() {
  const { db, close } = createTestDb();
  const app = createApp(db, { adminToken: ADMIN_TOKEN });
  return { app, close, db };
}

test('GET / renders the no-posts-yet empty state for an anonymous visitor', async () => {
  const { app, close } = buildApp();
  try {
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    assert.match(res.text, /No posts yet/);
    assert.match(res.text, /Last updated: never/);
    assert.doesNotMatch(res.text, /Import a chat export/);
  } finally {
    close();
  }
});

test('GET / shows admin-flavoured empty-state copy and nav when the admin token is presented', async () => {
  const { app, close } = buildApp();
  try {
    const res = await request(app).get('/').set('x-admin-token', ADMIN_TOKEN);
    assert.equal(res.status, 200);
    assert.match(res.text, />Import</);
    assert.match(res.text, />Review</);
    assert.match(res.text, /Import a chat export/);
  } finally {
    close();
  }
});

test('GET /import is forbidden without the admin token', async () => {
  const { app, close } = buildApp();
  try {
    const res = await request(app).get('/import');
    assert.equal(res.status, 403);
  } finally {
    close();
  }
});

test('GET /import succeeds with the admin token', async () => {
  const { app, close } = buildApp();
  try {
    const res = await request(app).get('/import').set('x-admin-token', ADMIN_TOKEN);
    assert.equal(res.status, 200);
    assert.match(res.text, /Import a chat export/);
  } finally {
    close();
  }
});

test('GET /review is forbidden without the admin token', async () => {
  const { app, close } = buildApp();
  try {
    const res = await request(app).get('/review');
    assert.equal(res.status, 403);
  } finally {
    close();
  }
});

test('GET /review succeeds with the admin token', async () => {
  const { app, close } = buildApp();
  try {
    const res = await request(app).get('/review').set('x-admin-token', ADMIN_TOKEN);
    assert.equal(res.status, 200);
    assert.match(res.text, /Review queue/);
  } finally {
    close();
  }
});

test('the design-system stylesheet is served for the layout to link against', async () => {
  const { app, close } = buildApp();
  try {
    const res = await request(app).get('/assets/styles.css');
    assert.equal(res.status, 200);
    assert.match(res.text, /--color-accent/);
  } finally {
    close();
  }
});

function seedPosts(db) {
  const member = db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Ananya Rao');
  const olderPost = db
    .prepare(
      `INSERT INTO posts (canonical_url, preview_author, first_shared_at, last_shared_at) VALUES (?, ?, ?, ?)`
    )
    .run(
      'https://www.linkedin.com/posts/okr-season-7391',
      'Ananya Rao',
      '2026-09-01T00:00:00.000Z',
      '2026-09-01T00:00:00.000Z'
    );
  const newerPost = db
    .prepare(`INSERT INTO posts (canonical_url, first_shared_at, last_shared_at) VALUES (?, ?, ?)`)
    .run(
      'https://www.linkedin.com/posts/unattributed-share',
      '2026-09-10T00:00:00.000Z',
      '2026-09-10T00:00:00.000Z'
    );

  db.prepare(
    `INSERT INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp) VALUES (?, 'group-a', 'Ananya Rao', ?, '2026-09-01T00:00:00.000Z')`
  ).run(olderPost.lastInsertRowid, Number(member.lastInsertRowid));
  db.prepare(
    `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES (?, 'group-a', '+91 90000 00000', '2026-09-10T00:00:00.000Z')`
  ).run(newerPost.lastInsertRowid);

  return { member, olderPost, newerPost };
}

test('GET / defaults to most-recent-first and offers the most-shared sort', async () => {
  const { app, close, db } = buildApp();
  try {
    seedPosts(db);
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    const okrIndex = res.text.indexOf('okr-season-7391');
    const unattributedIndex = res.text.indexOf('unattributed-share');
    assert.ok(unattributedIndex < okrIndex, 'most-recently-shared post should render first by default');
    assert.match(res.text, /name="sort" value="most_shared"/);
  } finally {
    close();
  }
});

test('GET /?sort=most_shared re-sorts by share count', async () => {
  const { app, close, db } = buildApp();
  try {
    const { newerPost } = seedPosts(db);
    // Give the older post a second share so it outranks the single-share post.
    db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES ((SELECT id FROM posts WHERE canonical_url LIKE '%okr-season%'), 'group-a', '+91 1', '2026-09-02T00:00:00.000Z')`
    ).run();

    const res = await request(app).get('/?sort=most_shared');
    assert.equal(res.status, 200);
    const okrIndex = res.text.indexOf('okr-season-7391');
    const unattributedIndex = res.text.indexOf('unattributed-share');
    assert.ok(okrIndex < unattributedIndex, 'the more-shared post should render first');
  } finally {
    close();
  }
});

test('GET /?member=<id> filters to that member and shows the member header', async () => {
  const { app, close, db } = buildApp();
  try {
    const { member } = seedPosts(db);
    const res = await request(app).get(`/?member=${member.lastInsertRowid}`);
    assert.equal(res.status, 200);
    assert.match(res.text, /Ananya Rao/);
    assert.match(res.text, /okr-season-7391/);
    assert.doesNotMatch(res.text, /unattributed-share/);
  } finally {
    close();
  }
});

test('GET /?member=pending filters to posts with an unresolved sharer', async () => {
  const { app, close, db } = buildApp();
  try {
    seedPosts(db);
    const res = await request(app).get('/?member=pending');
    assert.equal(res.status, 200);
    assert.match(res.text, /unattributed-share/);
    assert.doesNotMatch(res.text, /okr-season-7391/);
  } finally {
    close();
  }
});

test('GET /?q=<term> searches the post URL/slug and fetched preview text', async () => {
  const { app, close, db } = buildApp();
  try {
    seedPosts(db);
    const res = await request(app).get('/?q=okr');
    assert.equal(res.status, 200);
    assert.match(res.text, /okr-season-7391/);
    assert.doesNotMatch(res.text, /unattributed-share/);
  } finally {
    close();
  }
});

test('GET /?q=<no match> shows the no-results state with a clear/reset action, not the first-run empty state', async () => {
  const { app, close, db } = buildApp();
  try {
    seedPosts(db);
    const res = await request(app).get('/?q=nothing-matches-this');
    assert.equal(res.status, 200);
    assert.match(res.text, /No posts match/);
    assert.match(res.text, /data-testid="clear-filters"/);
    assert.doesNotMatch(res.text, /data-testid="empty-state-title"/);
  } finally {
    close();
  }
});

test('GET / with no posts at all still shows the first-run empty state, not the no-results state', async () => {
  const { app, close } = buildApp();
  try {
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    assert.match(res.text, /No posts yet/);
    assert.doesNotMatch(res.text, /data-testid="no-results"/);
  } finally {
    close();
  }
});
