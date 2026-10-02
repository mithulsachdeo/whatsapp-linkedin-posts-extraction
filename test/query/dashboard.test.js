// Primary seam for this ticket: the public query API (getDashboard), run
// against a real temporary SQLite DB. Later tickets' ingestion tests feed
// this same DB through ingest(...) and assert here; since ingestion doesn't
// exist yet, fixtures are inserted directly to establish the query contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from '../helpers/testDb.js';
import { getDashboard } from '../../src/query/dashboard.js';

test('getDashboard returns no posts and a null lastUpdated on an empty DB', () => {
  const { db, close } = createTestDb();
  try {
    const result = getDashboard(db);
    assert.deepEqual(result.posts, []);
    assert.equal(result.lastUpdated, null);
  } finally {
    close();
  }
});

test('getDashboard reflects completed import batches in lastUpdated', () => {
  const { db, close } = createTestDb();
  try {
    db.prepare(
      `INSERT INTO import_batches (group_id, filename, content_hash, status, completed_at)
       VALUES ('group-a', 'chat.txt', 'hash1', 'COMPLETE', '2026-09-30T12:00:00.000Z')`
    ).run();

    const result = getDashboard(db);
    assert.equal(result.lastUpdated, '2026-09-30T12:00:00.000Z');
  } finally {
    close();
  }
});

test('getDashboard aggregates share count and orders most-recent-first by default', () => {
  const { db, close } = createTestDb();
  try {
    const olderPost = db
      .prepare(`INSERT INTO posts (canonical_url, first_shared_at, last_shared_at) VALUES (?, ?, ?)`)
      .run('https://www.linkedin.com/posts/older', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z');
    const newerPost = db
      .prepare(`INSERT INTO posts (canonical_url, first_shared_at, last_shared_at) VALUES (?, ?, ?)`)
      .run('https://www.linkedin.com/posts/newer', '2026-09-05T00:00:00.000Z', '2026-09-10T00:00:00.000Z');

    db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES (?, 'group-a', '+91 90000 00000', '2026-09-01T00:00:00.000Z')`
    ).run(olderPost.lastInsertRowid);

    for (const ts of ['2026-09-05T00:00:00.000Z', '2026-09-10T00:00:00.000Z']) {
      db.prepare(
        `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES (?, 'group-a', '+91 90000 00001', ?)`
      ).run(newerPost.lastInsertRowid, ts);
    }

    const result = getDashboard(db);
    assert.equal(result.posts.length, 2);
    assert.equal(result.posts[0].url, 'https://www.linkedin.com/posts/newer');
    assert.equal(result.posts[0].shareCount, 2);
    assert.equal(result.posts[1].url, 'https://www.linkedin.com/posts/older');
    assert.equal(result.posts[1].shareCount, 1);
  } finally {
    close();
  }
});

test('getDashboard marks a post pending attribution when any share has no resolved member', () => {
  const { db, close } = createTestDb();
  try {
    const post = db
      .prepare(`INSERT INTO posts (canonical_url) VALUES (?)`)
      .run('https://www.linkedin.com/posts/pending');

    db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp)
       VALUES (?, 'group-a', '+91 90000 00002', NULL, '2026-09-01T00:00:00.000Z')`
    ).run(post.lastInsertRowid);

    const result = getDashboard(db);
    assert.equal(result.posts[0].pendingAttribution, true);
  } finally {
    close();
  }
});
