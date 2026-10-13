// Newspaper gutter photo ads: HTTP-layer coverage for the Posts-page-only
// gutters -- rendered (or not) depending on the gutters_hidden cookie, and
// absent on every other route. Sibling to dashboard.route.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createTestDb } from '../helpers/testDb.js';
import { createApp } from '../../src/http/app.js';
import { renderGutterAdsForTest } from '../../src/views/dashboard.js';
import { loginAsAdmin } from '../helpers/adminSession.js';

const ADMIN_TOKEN = 'test-admin-token';

async function buildApp() {
  const { db, close } = await createTestDb();
  const app = createApp(db, { adminToken: ADMIN_TOKEN });
  return { app, close, db };
}

async function seedOnePost(db) {
  const post = await db
    .prepare(`INSERT INTO posts (canonical_url, preview_author) VALUES (?, ?)`)
    .run('https://www.linkedin.com/posts/gutter-ads-test', 'Gutter Author');
  await db.prepare(
    `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES (?, 'group-a', '+91 1', '2026-09-01T00:00:00.000Z')`
  ).run(Number(post.lastInsertRowid));
}

test('GET / renders two gutters, each with 3 photo slots, when gutters_hidden is not set', async () => {
  const { app, close, db } = await buildApp();
  try {
    await seedOnePost(db);
    const res = await request(app).get('/');
    assert.equal(res.status, 200);

    assert.match(res.text, /data-testid="gutter-ads-root"/);
    assert.match(res.text, /data-testid="gutter-left"/);
    assert.match(res.text, /data-testid="gutter-right"/);

    const slotMatches = res.text.match(/data-gutter-slot/g) || [];
    assert.equal(slotMatches.length, 6, 'expected 3 slots per gutter, 6 total');

    const imgMatches = res.text.match(/\/assets\/gutter-photos\/[^"]+\.webp/g) || [];
    assert.equal(imgMatches.length, 6);
  } finally {
    await close();
  }
});

test('GET / renders no gutter markup when the gutters_hidden cookie is set', async () => {
  const { app, close, db } = await buildApp();
  try {
    await seedOnePost(db);
    const res = await request(app).get('/').set('Cookie', 'gutters_hidden=1');
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /gutter-ads-root/);
    assert.doesNotMatch(res.text, /gutter-left/);
    assert.doesNotMatch(res.text, /gutter-right/);
  } finally {
    await close();
  }
});

test('gutter markup is absent on /import, /review and /login', async () => {
  const { app, close, db } = await buildApp();
  try {
    await seedOnePost(db);
    const agent = await loginAsAdmin(app, ADMIN_TOKEN);

    const importRes = await agent.get('/import');
    assert.doesNotMatch(importRes.text, /gutter-ads-root/);

    const reviewRes = await agent.get('/review');
    assert.doesNotMatch(reviewRes.text, /gutter-ads-root/);

    const loginRes = await request(app).get('/login');
    assert.doesNotMatch(loginRes.text, /gutter-ads-root/);
  } finally {
    await close();
  }
});

test('gutter markup is absent on /posts/:id', async () => {
  const { app, close, db } = await buildApp();
  try {
    const post = await db
      .prepare(`INSERT INTO posts (canonical_url, preview_author) VALUES (?, ?)`)
      .run('https://www.linkedin.com/posts/gutter-ads-detail', 'Detail Author');
    await db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES (?, 'group-a', '+91 1', '2026-09-01T00:00:00.000Z')`
    ).run(Number(post.lastInsertRowid));

    const res = await request(app).get(`/posts/${Number(post.lastInsertRowid)}`);
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /gutter-ads-root/);
  } finally {
    await close();
  }
});

test('GET / gutter close button has an accessible label and photos are decorative (alt="")', async () => {
  const { app, close, db } = await buildApp();
  try {
    await seedOnePost(db);
    const res = await request(app).get('/');
    assert.equal(res.status, 200);

    const closeButtons = res.text.match(/data-gutter-close[^>]*aria-label="Close galleries"/g) || [];
    assert.equal(closeButtons.length, 2, 'both gutters should have a labelled close button');

    assert.match(res.text, /<img src="\/assets\/gutter-photos\/[^"]+\.webp" alt="" /);
  } finally {
    await close();
  }
});

test('renderGutterAds (via the dashboard view) renders nothing for an empty or missing photo list', () => {
  // The HTTP-level directory read (src/http/app.js's readGutterPhotoFilenames,
  // wrapped in try/catch around fs.readdirSync) always sees the real,
  // populated Industry_new2/gutter-photos/ directory in this repo, so an
  // empty-directory HTTP round-trip can't be exercised without faking the
  // filesystem. The guard itself is exercised directly here, at the view
  // layer renderDashboard delegates to: passing an empty gutterPhotos list
  // (exactly what readGutterPhotoFilenames returns for a missing/empty dir)
  // must render no gutter markup.
  const html = renderGutterAdsForTest([]);
  assert.equal(html, '');
});
