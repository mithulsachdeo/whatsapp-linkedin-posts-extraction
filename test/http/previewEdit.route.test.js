// Secondary seam: the admin preview-override action, tested through the
// HTTP layer.
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

test('POST /posts/:id/preview is unauthorized without a logged-in admin session', async () => {
  const { app, close } = buildApp();
  try {
    const res = await request(app).post('/posts/1/preview').type('form').send({ author: 'x' });
    assert.equal(res.status, 401);
  } finally {
    close();
  }
});

test("POST /posts/:id/preview lets the admin override a post's preview, which then shows on the dashboard", async () => {
  const { app, db, close } = buildApp();
  try {
    const inserted = db
      .prepare('INSERT INTO posts (canonical_url) VALUES (?)')
      .run('https://www.linkedin.com/posts/someone_activity-1-abcd');
    const postId = Number(inserted.lastInsertRowid);
    db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp)
       VALUES (?, 'group-a', 'Priya Sharma', '2026-09-30T10:15:00.000Z')`
    ).run(postId);

    const agent = await loginAsAdmin(app, ADMIN_TOKEN);
    const res = await agent
      .post(`/posts/${postId}/preview`)
      .type('form')
      .send({ author: 'Priya Sharma', role: 'PM @ Acme', excerpt: 'Worth a read.' });

    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/');

    const row = db.prepare('SELECT preview_edited FROM posts WHERE id = ?').get(postId);
    assert.equal(row.preview_edited, 1);

    const dashboard = await request(app).get('/');
    assert.match(dashboard.text, /Priya Sharma/);
    assert.match(dashboard.text, /Worth a read\./);

    // The role is persisted even though the card itself no longer shows a
    // role byline (dashboard.js: cards show author-as-kicker + excerpt-as-
    // headline) -- the detail page's role kicker is where it surfaces.
    const detail = await request(app).get(`/posts/${postId}`);
    assert.match(detail.text, /PM @ Acme/);
  } finally {
    close();
  }
});
