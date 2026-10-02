// Secondary seam: the post detail page (ticket #8), tested through the
// route handler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createTestDb } from '../helpers/testDb.js';
import { createApp } from '../../src/http/app.js';
import { loginAsAdmin } from '../helpers/adminSession.js';

const ADMIN_TOKEN = 'test-admin-token';

function buildApp() {
  const { db, close } = createTestDb();
  const app = createApp(db, { adminToken: ADMIN_TOKEN });
  return { app, db, close };
}

function seedPost(db) {
  const post = db
    .prepare(
      `INSERT INTO posts (canonical_url, preview_author, preview_role, preview_excerpt, first_shared_at, last_shared_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      'https://www.linkedin.com/posts/okr-season-7391',
      'Ananya Rao',
      'PM @ Acme',
      'Notes on our Q4 OKRs.',
      '2026-09-01T00:00:00.000Z',
      '2026-09-05T00:00:00.000Z'
    );
  const postId = Number(post.lastInsertRowid);
  const member = db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Karan Mehta');

  db.prepare(
    `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp)
     VALUES (?, 'product-chai', '+91 90000 00000', '2026-09-01T00:00:00.000Z')`
  ).run(postId);
  db.prepare(
    `INSERT INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp, note)
     VALUES (?, 'pm-collective', 'Karan Mehta', ?, '2026-09-05T00:00:00.000Z', 'Relevant for Q4')`
  ).run(postId, Number(member.lastInsertRowid));

  return postId;
}

test('GET /posts/:id 404s for a post that does not exist, without requiring the admin token', async () => {
  const { app, close } = buildApp();
  try {
    const res = await request(app).get('/posts/999');
    assert.equal(res.status, 404);
    assert.match(res.text, /Post not found/);
  } finally {
    close();
  }
});

test('GET /posts/:id 404s for a non-numeric id', async () => {
  const { app, close } = buildApp();
  try {
    const res = await request(app).get('/posts/not-a-number');
    assert.equal(res.status, 404);
  } finally {
    close();
  }
});

test('GET /posts/:id is reachable without the admin token (public dashboard stays open)', async () => {
  const { app, db, close } = buildApp();
  try {
    const postId = seedPost(db);
    const res = await request(app).get(`/posts/${postId}`);
    assert.equal(res.status, 200);
    assert.match(res.text, /Ananya Rao/);
    assert.match(res.text, /PM @ Acme/);
    assert.match(res.text, /Notes on our Q4 OKRs\./);
  } finally {
    close();
  }
});

test('GET /posts/:id shows the Open-on-LinkedIn link and a copy-link control', async () => {
  const { app, db, close } = buildApp();
  try {
    const postId = seedPost(db);
    const res = await request(app).get(`/posts/${postId}`);
    // Open-on-LinkedIn routes through /out/:id (per readArchive.route.test.js)
    // so the click can be recorded as read before redirecting out, rather
    // than linking straight to LinkedIn.
    assert.match(res.text, new RegExp(`href="/out/${postId}"[^>]*data-testid="open-on-linkedin"`));
    assert.match(res.text, /data-testid="copy-link"/);
  } finally {
    close();
  }
});

test('GET /posts/:id lists every sharing event with sharer, timestamp and note, marking the earliest "First shared"', async () => {
  const { app, db, close } = buildApp();
  try {
    const postId = seedPost(db);
    const res = await request(app).get(`/posts/${postId}`);

    assert.match(res.text, /Pending attribution/);
    assert.match(res.text, /Karan Mehta/);
    assert.match(res.text, /Relevant for Q4/);
    assert.match(res.text, /First shared/);

    const firstTagIndex = res.text.indexOf('First shared');
    const pendingSenderIndex = res.text.indexOf('+91 90000 00000');
    const karanIndex = res.text.indexOf('Karan Mehta');
    assert.ok(pendingSenderIndex < karanIndex, 'the unresolved earlier share should render before the later one');
    assert.ok(
      firstTagIndex > pendingSenderIndex && firstTagIndex < karanIndex,
      '"First shared" should mark the earliest event, not the latest'
    );
  } finally {
    close();
  }
});

test('GET /posts/:id hides the group label from an anonymous visitor but shows it to the admin', async () => {
  const { app, db, close } = buildApp();
  try {
    const postId = seedPost(db);

    const anon = await request(app).get(`/posts/${postId}`);
    assert.doesNotMatch(anon.text, /Product Chai/);
    assert.doesNotMatch(anon.text, /PM Collective/);

    const agent = await loginAsAdmin(app, ADMIN_TOKEN);
    const admin = await agent.get(`/posts/${postId}`);
    assert.match(admin.text, /Product Chai/);
    assert.match(admin.text, /PM Collective/);
  } finally {
    close();
  }
});

test('GET /posts/:id shows the URL-only "no preview" block when no preview was fetched', async () => {
  const { app, db, close } = buildApp();
  try {
    const post = db
      .prepare(`INSERT INTO posts (canonical_url, preview_unavailable) VALUES (?, 1)`)
      .run('https://www.linkedin.com/posts/no-preview-7392');
    const postId = Number(post.lastInsertRowid);
    db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp)
       VALUES (?, 'product-chai', '+91 1', '2026-09-01T00:00:00.000Z')`
    ).run(postId);

    const res = await request(app).get(`/posts/${postId}`);
    assert.equal(res.status, 200);
    assert.match(res.text, /didn't return a preview/);
    assert.match(res.text, /no-preview-7392/);
  } finally {
    close();
  }
});

test('GET / links each post headline to its detail page', async () => {
  const { app, db, close } = buildApp();
  try {
    const postId = seedPost(db);
    const res = await request(app).get('/');
    assert.match(res.text, new RegExp(`href="/posts/${postId}"`));
  } finally {
    close();
  }
});
