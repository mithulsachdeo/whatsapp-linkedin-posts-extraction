// Date-range filter: HTTP-layer coverage for the ?from/?to query params on
// both the `/` route and the `/dispatches` pagination fragment, plus the
// Clear-dates affordance and the empty-in-range message. Sibling to
// dashboard.route.test.js and edition-dispatches.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createTestDb } from '../helpers/testDb.js';
import { createApp } from '../../src/http/app.js';

function buildApp() {
  const { db, close } = createTestDb();
  const app = createApp(db, { adminToken: 'test-admin-token' });
  return { app, close, db };
}

function seedDatedPosts(db) {
  const early = db
    .prepare(`INSERT INTO posts (canonical_url, preview_author) VALUES (?, ?)`)
    .run('https://www.linkedin.com/posts/early-post', 'Early Author');
  const mid = db
    .prepare(`INSERT INTO posts (canonical_url, preview_author) VALUES (?, ?)`)
    .run('https://www.linkedin.com/posts/mid-post', 'Mid Author');
  const late = db
    .prepare(`INSERT INTO posts (canonical_url, preview_author) VALUES (?, ?)`)
    .run('https://www.linkedin.com/posts/late-post', 'Late Author');

  db.prepare(
    `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES (?, 'group-a', '+91 1', '2026-09-01T00:00:00.000Z')`
  ).run(early.lastInsertRowid);
  db.prepare(
    `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES (?, 'group-a', '+91 1', '2026-09-15T00:00:00.000Z')`
  ).run(mid.lastInsertRowid);
  db.prepare(
    `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES (?, 'group-a', '+91 1', '2026-09-30T00:00:00.000Z')`
  ).run(late.lastInsertRowid);

  return { early, mid, late };
}

test('GET /?from=&to= filters the dashboard to posts shared inside the window', async () => {
  const { app, close, db } = buildApp();
  try {
    seedDatedPosts(db);
    const res = await request(app).get('/?from=2026-09-10&to=2026-09-20');
    assert.equal(res.status, 200);
    assert.match(res.text, /Mid Author/);
    assert.doesNotMatch(res.text, /Early Author/);
    assert.doesNotMatch(res.text, /Late Author/);
  } finally {
    close();
  }
});

test('GET / renders the date inputs with the active from/to values and an Apply button', async () => {
  const { app, close, db } = buildApp();
  try {
    seedDatedPosts(db);
    const res = await request(app).get('/?from=2026-09-10&to=2026-09-20');
    assert.equal(res.status, 200);
    assert.match(res.text, /data-testid="date-range-filter"/);
    assert.match(res.text, /name="from"[^>]*value="2026-09-10"/);
    assert.match(res.text, /name="to"[^>]*value="2026-09-20"/);
    assert.match(res.text, /data-testid="date-range-apply"/);
  } finally {
    close();
  }
});

test('GET /?from=bogus&to=also-bogus ignores the malformed values and returns everything', async () => {
  const { app, close, db } = buildApp();
  try {
    seedDatedPosts(db);
    const res = await request(app).get('/?from=bogus&to=also-bogus');
    assert.equal(res.status, 200);
    assert.match(res.text, /Early Author/);
    assert.match(res.text, /Mid Author/);
    assert.match(res.text, /Late Author/);
  } finally {
    close();
  }
});

test('GET /dispatches honours ?from/?to the same way as /', async () => {
  const { app, close, db } = buildApp();
  try {
    seedDatedPosts(db);
    const res = await request(app).get('/dispatches?from=2026-09-10&to=2026-09-20');
    assert.equal(res.status, 200);
    assert.match(res.text, /Mid Author/);
    assert.doesNotMatch(res.text, /Early Author/);
    assert.doesNotMatch(res.text, /Late Author/);
  } finally {
    close();
  }
});

test('GET /?from=...&to=...&member=... composes the date range with the member filter', async () => {
  const { app, close, db } = buildApp();
  try {
    const member = db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Priya Sharma');
    const inWindow = db
      .prepare(`INSERT INTO posts (canonical_url, preview_author) VALUES (?, ?)`)
      .run('https://www.linkedin.com/posts/by-priya-in-window', 'Priya In Window');
    const outsideWindow = db
      .prepare(`INSERT INTO posts (canonical_url, preview_author) VALUES (?, ?)`)
      .run('https://www.linkedin.com/posts/by-priya-outside-window', 'Priya Outside Window');
    db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp) VALUES (?, 'group-a', 'Priya Sharma', ?, '2026-09-15T00:00:00.000Z')`
    ).run(inWindow.lastInsertRowid, Number(member.lastInsertRowid));
    db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp) VALUES (?, 'group-a', 'Priya Sharma', ?, '2026-08-01T00:00:00.000Z')`
    ).run(outsideWindow.lastInsertRowid, Number(member.lastInsertRowid));

    const res = await request(app).get(
      `/?member=${member.lastInsertRowid}&from=2026-09-10&to=2026-09-20`
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /Priya In Window/);
    assert.doesNotMatch(res.text, /Priya Outside Window/);
  } finally {
    close();
  }
});

test('Clear dates link removes from/to while preserving other active query params', async () => {
  const { app, close, db } = buildApp();
  try {
    seedDatedPosts(db);
    const res = await request(app).get('/?q=mid&from=2026-09-10&to=2026-09-20&view=all');
    assert.equal(res.status, 200);
    const clearMatch = res.text.match(/<a[^>]*href="([^"]+)"[^>]*data-testid="clear-dates"/);
    assert.ok(clearMatch, 'expected a Clear dates link');
    const href = clearMatch[1].replace(/&amp;/g, '&');
    const params = new URLSearchParams(href.split('?')[1]);
    assert.equal(params.get('from'), null);
    assert.equal(params.get('to'), null);
    assert.equal(params.get('q'), 'mid');
    assert.equal(params.get('view'), 'all');
  } finally {
    close();
  }
});

test('GET /?from=...&to=... with zero posts in range shows the empty-in-range message with Clear dates', async () => {
  const { app, close, db } = buildApp();
  try {
    seedDatedPosts(db);
    const res = await request(app).get('/?from=2026-01-01&to=2026-01-02');
    assert.equal(res.status, 200);
    assert.match(res.text, /No posts shared in this date range/);
    assert.match(res.text, /data-testid="clear-dates"/);
  } finally {
    close();
  }
});

test('GET / with an active date range sets the date input min/max bounds from the member/search/view-filtered set', async () => {
  const { app, close, db } = buildApp();
  try {
    seedDatedPosts(db);
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    // Bounds should be the IST calendar dates of the earliest/latest shares
    // (2026-09-01 and 2026-09-30, both at UTC midnight, well clear of any IST
    // boundary ambiguity).
    assert.match(res.text, /name="from"[^>]*min="2026-09-01"/);
    assert.match(res.text, /name="to"[^>]*max="2026-09-30"/);
  } finally {
    close();
  }
});

test('GET /?from=2026-01-01 (outside the recomputed bounds) keeps the selection verbatim rather than clamping it', async () => {
  const { app, close, db } = buildApp();
  try {
    seedDatedPosts(db);
    const res = await request(app).get('/?from=2026-01-01');
    assert.equal(res.status, 200);
    assert.match(res.text, /name="from"[^>]*value="2026-01-01"/);
  } finally {
    close();
  }
});
