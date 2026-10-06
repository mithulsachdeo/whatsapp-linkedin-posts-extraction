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

function seedPosts(db) {
  const member = db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Vikram Sen');
  const post1 = db
    .prepare(
      `INSERT INTO posts (canonical_url, preview_author, preview_excerpt, first_shared_at, last_shared_at) VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      'https://www.linkedin.com/posts/leadership-transition-1234',
      'Vikram Sen',
      'Reflections on product engineering architecture and leadership.',
      '2026-10-01T10:00:00Z',
      '2026-10-01T10:00:00Z'
    );
  db.prepare(
    `INSERT INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp) VALUES (?, 'group-a', 'Vikram Sen', ?, '2026-10-01T10:00:00Z')`
  ).run(post1.lastInsertRowid, Number(member.lastInsertRowid));

  const post2 = db
    .prepare(
      `INSERT INTO posts (canonical_url, preview_author, preview_excerpt, first_shared_at, last_shared_at) VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      'https://www.linkedin.com/posts/second-post-5678',
      'Vikram Sen',
      'Second post excerpt discussing technology strategy.',
      '2026-10-02T10:00:00Z',
      '2026-10-02T10:00:00Z'
    );
  db.prepare(
    `INSERT INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp) VALUES (?, 'group-a', 'Vikram Sen', ?, '2026-10-02T10:00:00Z')`
  ).run(post2.lastInsertRowid, Number(member.lastInsertRowid));
}

test('Columns layout applies anim-card-block and staggered index to cards with zero extra elements', async () => {
  const { app, db, close } = buildApp();
  try {
    seedPosts(db);
    const res = await request(app).get('/?density=cards');
    assert.equal(res.status, 200);

    // Cards have anim-card-block and --i index
    assert.match(res.text, /class="story story-link anim-card-block"[^>]*style="--i:0/);
    assert.match(res.text, /class="story story-link anim-card-block"[^>]*style="--i:1/);

    // No extra helper elements or canvases
    assert.doesNotMatch(res.text, /letterpress-3d-canvas/);
    assert.doesNotMatch(res.text, /<canvas/);
  } finally {
    close();
  }
});

test('Index layout applies anim-card-block and staggered index to rows with zero extra elements', async () => {
  const { app, db, close } = buildApp();
  try {
    seedPosts(db);
    const res = await request(app).get('/?density=rows');
    assert.equal(res.status, 200);

    // Rows have anim-card-block and --i index
    assert.match(res.text, /class="index-row anim-card-block"[^>]*style="--i:0/);
    assert.match(res.text, /class="index-row anim-card-block"[^>]*style="--i:1/);

    // No extra helper elements or canvases
    assert.doesNotMatch(res.text, /letterpress-3d-canvas/);
    assert.doesNotMatch(res.text, /<canvas/);
  } finally {
    close();
  }
});

test('motion.css defines 3D card-block vortex keyframes, 1400ms timing tokens, and reduced-motion override', async () => {
  const { app, close } = buildApp();
  try {
    const res = await request(app).get('/assets/tokens/motion.css');
    assert.equal(res.status, 200);

    assert.match(res.text, /--dur-card-block:\s*1400ms/);
    assert.match(res.text, /@keyframes card-vortex-in-n/);
    assert.match(res.text, /@keyframes card-vortex-in-ne/);
    assert.match(res.text, /@keyframes card-vortex-in-e/);
    assert.match(res.text, /@keyframes card-vortex-in-se/);
    assert.match(res.text, /@keyframes card-vortex-in-s/);
    assert.match(res.text, /@keyframes card-vortex-in-sw/);
    assert.match(res.text, /@keyframes card-vortex-in-w/);
    assert.match(res.text, /@keyframes card-vortex-in-nw/);
    assert.match(res.text, /\.anim-card-block/);
    assert.match(res.text, /translate3d/);
    // Verified: no card tilt (no rotateX or rotateY in the vortex animation)
    assert.doesNotMatch(res.text, /card-vortex[^{]*\{[^}]*rotateX/);
    assert.doesNotMatch(res.text, /card-vortex[^{]*\{[^}]*rotateY/);
    assert.match(res.text, /prefers-reduced-motion:reduce/);
  } finally {
    close();
  }
});
