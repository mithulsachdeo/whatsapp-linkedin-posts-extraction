// Per-device "Read / archive opened posts" (spec): clicking Open-on-LinkedIn
// records the post as read for this device and redirects out; the dashboard
// filters Unread/Read/All by that cookie; Restore undoes it. Purely a
// per-browser view preference -- never touches shared post/share data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createTestDb } from '../helpers/testDb.js';
import { createApp } from '../../src/http/app.js';
import { READ_COOKIE_NAME } from '../../src/http/readCookie.js';
import { getDashboard } from '../../src/query/dashboard.js';

async function buildApp() {
  const { db, close } = await createTestDb();
  const app = createApp(db);
  return { app, db, close };
}

async function seedPost(db, url = 'https://www.linkedin.com/posts/okr-season-7391') {
  const post = await db.prepare(`INSERT INTO posts (canonical_url) VALUES (?)`).run(url);
  const postId = Number(post.lastInsertRowid);
  await db.prepare(
    `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES (?, 'group-a', '+91 1', '2026-09-01T00:00:00.000Z')`
  ).run(postId);
  return postId;
}

function readCookieValue(res) {
  const setCookie = res.headers['set-cookie'] ?? [];
  const entry = setCookie.find((c) => c.startsWith(`${READ_COOKIE_NAME}=`));
  if (!entry) return null;
  return entry.split(';')[0].slice(READ_COOKIE_NAME.length + 1);
}

test('GET /out/:postId 302s to the post\'s canonical URL', async () => {
  const { app, db, close } = await buildApp();
  try {
    const postId = await seedPost(db);
    const res = await request(app).get(`/out/${postId}`);
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, 'https://www.linkedin.com/posts/okr-season-7391');
  } finally {
    await close();
  }
});

test('GET /out/:postId sets the read_posts cookie to include that id', async () => {
  const { app, db, close } = await buildApp();
  try {
    const postId = await seedPost(db);
    const res = await request(app).get(`/out/${postId}`);
    assert.equal(readCookieValue(res), String(postId));
  } finally {
    await close();
  }
});

test('GET /out/:postId preserves ids already in the cookie', async () => {
  const { app, db, close } = await buildApp();
  try {
    const postId = await seedPost(db);
    const res = await request(app).get(`/out/${postId}`).set('Cookie', `${READ_COOKIE_NAME}=5,6`);
    assert.equal(readCookieValue(res), `5,6,${postId}`);
  } finally {
    await close();
  }
});

test('GET /out/:postId 404s for an unknown id, and does NOT redirect anywhere (security: never redirect to a user-supplied URL)', async () => {
  const { app, close } = await buildApp();
  try {
    const res = await request(app).get('/out/999999');
    assert.equal(res.status, 404);
    assert.equal(res.headers.location, undefined);
  } finally {
    await close();
  }
});

test('GET /out/:postId 404s for a non-numeric id', async () => {
  const { app, close } = await buildApp();
  try {
    const res = await request(app).get('/out/not-a-number');
    assert.equal(res.status, 404);
  } finally {
    await close();
  }
});

test('GET /posts/:id Open-on-LinkedIn link points at /out/:id, not straight out to LinkedIn', async () => {
  const { app, db, close } = await buildApp();
  try {
    const postId = await seedPost(db);
    const res = await request(app).get(`/posts/${postId}`);
    assert.match(res.text, new RegExp(`href="/out/${postId}"[^>]*data-testid="open-on-linkedin"`));
    assert.doesNotMatch(res.text, /href="https:\/\/www\.linkedin\.com[^"]*"[^>]*data-testid="open-on-linkedin"/);
  } finally {
    await close();
  }
});

test('GET /posts/:id does NOT mark the post read -- only the /out click does', async () => {
  const { app, db, close } = await buildApp();
  try {
    const postId = await seedPost(db);
    const res = await request(app).get(`/posts/${postId}`);
    assert.equal(readCookieValue(res), null);
  } finally {
    await close();
  }
});

test('GET / defaults to the Unread view: a read post is hidden', async () => {
  const { app, db, close } = await buildApp();
  try {
    const readId = await seedPost(db, 'https://www.linkedin.com/posts/already-read');
    const unreadId = await seedPost(db, 'https://www.linkedin.com/posts/still-unread');
    const res = await request(app).get('/').set('Cookie', `${READ_COOKIE_NAME}=${readId}`);
    assert.equal(res.status, 200);
    assert.match(res.text, new RegExp(`href="/posts/${unreadId}"`));
    assert.doesNotMatch(res.text, new RegExp(`href="/posts/${readId}"`));
  } finally {
    await close();
  }
});

test('GET /?view=read shows only read posts, with a Restore control', async () => {
  const { app, db, close } = await buildApp();
  try {
    const readId = await seedPost(db, 'https://www.linkedin.com/posts/already-read');
    const unreadId = await seedPost(db, 'https://www.linkedin.com/posts/still-unread');
    const res = await request(app).get('/?view=read').set('Cookie', `${READ_COOKIE_NAME}=${readId}`);
    assert.equal(res.status, 200);
    assert.match(res.text, new RegExp(`href="/posts/${readId}"`));
    assert.doesNotMatch(res.text, new RegExp(`href="/posts/${unreadId}"`));
    assert.match(res.text, /data-testid="restore-post"/);
  } finally {
    await close();
  }
});

test('GET /?view=all shows both read and unread posts', async () => {
  const { app, db, close } = await buildApp();
  try {
    const readId = await seedPost(db, 'https://www.linkedin.com/posts/already-read');
    const unreadId = await seedPost(db, 'https://www.linkedin.com/posts/still-unread');
    const res = await request(app).get('/?view=all').set('Cookie', `${READ_COOKIE_NAME}=${readId}`);
    assert.equal(res.status, 200);
    assert.match(res.text, new RegExp(`href="/posts/${readId}"`));
    assert.match(res.text, new RegExp(`href="/posts/${unreadId}"`));
  } finally {
    await close();
  }
});

test('GET / offers an Unread | Read | All toggle', async () => {
  const { app, close } = await buildApp();
  try {
    const res = await request(app).get('/');
    assert.match(res.text, /data-testid="view-toggle"/);
  } finally {
    await close();
  }
});

test('POST /unarchive/:postId removes the id from the cookie, restoring it to Unread', async () => {
  const { app, db, close } = await buildApp();
  try {
    const postId = await seedPost(db);
    const res = await request(app)
      .post(`/unarchive/${postId}`)
      .set('Cookie', `${READ_COOKIE_NAME}=5,${postId},6`);
    assert.equal(res.status, 302);
    assert.equal(readCookieValue(res), '5,6');
  } finally {
    await close();
  }
});

test('archiving a post leaves its share count and dashboard ordering unchanged for everyone else', async () => {
  const { app, db, close } = await buildApp();
  try {
    const postId = await seedPost(db, 'https://www.linkedin.com/posts/popular');
    await db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES (?, 'group-a', '+91 2', '2026-09-02T00:00:00.000Z')`
    ).run(postId);

    const before = await getDashboard(db, { view: 'all' });

    // One device opens the post (archives it for itself)...
    await request(app).get(`/out/${postId}`);

    // ...but the shared data underneath is untouched: same share count,
    // same ordering, regardless of any device's cookie.
    const after = await getDashboard(db, { view: 'all' });
    assert.deepEqual(after.posts, before.posts);

    // A fresh visitor with no cookie still sees it, unread.
    const res = await request(app).get('/');
    assert.match(res.text, new RegExp(`href="/posts/${postId}"`));
  } finally {
    await close();
  }
});
