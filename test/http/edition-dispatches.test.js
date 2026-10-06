import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../../src/http/app.js';
import { openDb } from '../../src/db/connection.js';
import { migrate } from '../../src/db/migrate.js';

function buildApp() {
  const db = openDb(':memory:');
  migrate(db);
  const app = createApp(db, { adminToken: 'test-admin' });
  return { app, db, close: () => db.close() };
}

function seedManyPosts(db, count = 25) {
  const member = db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Siddharth Rao');
  const insertPost = db.prepare(
    `INSERT INTO posts (canonical_url, preview_author, preview_excerpt, first_shared_at, last_shared_at) VALUES (?, ?, ?, ?, ?)`
  );
  const insertShare = db.prepare(
    `INSERT INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp) VALUES (?, 'group-a', 'Siddharth Rao', ?, ?)`
  );

  for (let i = 1; i <= count; i++) {
    const timestamp = `2026-10-${String(i).padStart(2, '0')}T10:00:00Z`;
    const post = insertPost.run(
      `https://www.linkedin.com/posts/dispatch-${i}`,
      `Author ${i}`,
      `Excerpt describing dispatch number ${i} on technology and design.`,
      timestamp,
      timestamp
    );
    insertShare.run(post.lastInsertRowid, Number(member.lastInsertRowid), timestamp);
  }
}

test('Dashboard with <= 18 posts renders all posts and end colophon without trigger button', async () => {
  const { app, db, close } = buildApp();
  try {
    seedManyPosts(db, 5);
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    assert.match(res.text, /data-testid="post-list-cards"/);
    assert.match(res.text, /data-testid="edition-colophon"/);
    assert.match(res.text, /All dispatches in this edition have been printed/);
    assert.doesNotMatch(res.text, /data-testid="edition-trigger-wrap"/);
  } finally {
    close();
  }
});

test('Dashboard with > 18 posts renders first 18 posts and Print Next Edition trigger with remaining count', async () => {
  const { app, db, close } = buildApp();
  try {
    seedManyPosts(db, 25);
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    assert.match(res.text, /data-testid="post-list-cards"/);
    assert.match(res.text, /data-testid="edition-trigger-wrap"/);
    assert.match(res.text, /Print Next Edition \(7 Dispatches Remaining\)/);
    assert.doesNotMatch(res.text, /data-testid="edition-colophon"/);
  } finally {
    close();
  }
});

test('GET /dispatches returns pre-rendered partial HTML for Edition 2 with columns layout and end colophon', async () => {
  const { app, db, close } = buildApp();
  try {
    seedManyPosts(db, 25);
    const res = await request(app).get('/dispatches?offset=18&density=cards');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /html/);

    // Isolated Edition 2 band and divider
    assert.match(res.text, /class="edition-divider"/);
    assert.match(res.text, /Edition 2/);
    assert.match(res.text, /7 Dispatches · Printed from archive/);
    assert.match(res.text, /class="columns edition-band" data-edition="2"/);

    // Remaining count is 0, so end colophon is displayed
    assert.match(res.text, /data-testid="edition-colophon"/);
    assert.doesNotMatch(res.text, /data-testid="edition-trigger-wrap"/);
  } finally {
    close();
  }
});

test('GET /dispatches returns index layout when density=rows', async () => {
  const { app, db, close } = buildApp();
  try {
    seedManyPosts(db, 25);
    const res = await request(app).get('/dispatches?offset=18&density=rows');
    assert.equal(res.status, 200);
    assert.match(res.text, /class="index edition-band" data-edition="2"/);
    assert.match(res.text, /class="index-row/);
  } finally {
    close();
  }
});

test('GET /dispatches with multiple remaining editions renders next trigger pointing to offset 36', async () => {
  const { app, db, close } = buildApp();
  try {
    seedManyPosts(db, 40); // 18 in initial + 18 in edition 2 + 4 in edition 3
    const res = await request(app).get('/dispatches?offset=18&density=cards');
    assert.equal(res.status, 200);
    assert.match(res.text, /Edition 2/);
    assert.match(res.text, /18 Dispatches · Printed from archive/);
    assert.match(res.text, /data-next-offset="36"/);
    assert.match(res.text, /Print Next Edition \(4 Dispatches Remaining\)/);
  } finally {
    close();
  }
});
