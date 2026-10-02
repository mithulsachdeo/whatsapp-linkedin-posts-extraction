// Primary seam for this ticket: the public query API (getDashboard), run
// against a real temporary SQLite DB. Later tickets' ingestion tests feed
// this same DB through ingest(...) and assert here; since ingestion doesn't
// exist yet, fixtures are inserted directly to establish the query contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from '../helpers/testDb.js';
import { getDashboard, getMemberFilterOptions } from '../../src/query/dashboard.js';

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

test('getDashboard counts distinct sharers, treating unresolved raw senders as distinct from each other', () => {
  const { db, close } = createTestDb();
  try {
    const post = db.prepare(`INSERT INTO posts (canonical_url) VALUES (?)`).run('https://www.linkedin.com/posts/multi');

    // Same resolved member shares twice -> 1 distinct sharer.
    const member = db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Priya Sharma');
    db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp) VALUES (?, 'group-a', 'Priya Sharma', ?, '2026-09-01T00:00:00.000Z')`
    ).run(post.lastInsertRowid, Number(member.lastInsertRowid));
    db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp) VALUES (?, 'group-a', 'Priya Sharma', ?, '2026-09-02T00:00:00.000Z')`
    ).run(post.lastInsertRowid, Number(member.lastInsertRowid));
    // Two different unresolved raw senders -> 2 more distinct sharers.
    db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp) VALUES (?, 'group-a', '+91 1', NULL, '2026-09-03T00:00:00.000Z')`
    ).run(post.lastInsertRowid);
    db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp) VALUES (?, 'group-a', '+91 2', NULL, '2026-09-04T00:00:00.000Z')`
    ).run(post.lastInsertRowid);

    const result = getDashboard(db);
    assert.equal(result.posts[0].shareCount, 4);
    assert.equal(result.posts[0].distinctSharerCount, 3);
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

test('getDashboard filters to a single member, excluding posts that member never shared', () => {
  const { db, close } = createTestDb();
  try {
    const member = db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Priya Sharma');
    const sharedByMember = db
      .prepare(`INSERT INTO posts (canonical_url) VALUES (?)`)
      .run('https://www.linkedin.com/posts/by-priya');
    const sharedByOther = db
      .prepare(`INSERT INTO posts (canonical_url) VALUES (?)`)
      .run('https://www.linkedin.com/posts/by-someone-else');

    db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp) VALUES (?, 'group-a', 'Priya Sharma', ?, '2026-09-01T00:00:00.000Z')`
    ).run(sharedByMember.lastInsertRowid, Number(member.lastInsertRowid));
    db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES (?, 'group-a', '+91 90000 00009', '2026-09-02T00:00:00.000Z')`
    ).run(sharedByOther.lastInsertRowid);

    const result = getDashboard(db, { memberId: Number(member.lastInsertRowid) });
    assert.deepEqual(result.posts.map((p) => p.url), ['https://www.linkedin.com/posts/by-priya']);
  } finally {
    close();
  }
});

test('getDashboard pending option returns only posts with at least one unresolved sharer', () => {
  const { db, close } = createTestDb();
  try {
    const pendingPost = db
      .prepare(`INSERT INTO posts (canonical_url) VALUES (?)`)
      .run('https://www.linkedin.com/posts/pending-only');
    const resolvedPost = db
      .prepare(`INSERT INTO posts (canonical_url) VALUES (?)`)
      .run('https://www.linkedin.com/posts/resolved-only');
    const member = db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Karan Mehta');

    db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES (?, 'group-a', '+91 1', '2026-09-01T00:00:00.000Z')`
    ).run(pendingPost.lastInsertRowid);
    db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp) VALUES (?, 'group-a', 'Karan Mehta', ?, '2026-09-02T00:00:00.000Z')`
    ).run(resolvedPost.lastInsertRowid, Number(member.lastInsertRowid));

    const result = getDashboard(db, { pending: true });
    assert.deepEqual(result.posts.map((p) => p.url), ['https://www.linkedin.com/posts/pending-only']);
  } finally {
    close();
  }
});

test('getDashboard search matches the post URL/slug', () => {
  const { db, close } = createTestDb();
  try {
    const match = db
      .prepare(`INSERT INTO posts (canonical_url) VALUES (?)`)
      .run('https://www.linkedin.com/posts/okr-season-7391');
    const other = db
      .prepare(`INSERT INTO posts (canonical_url) VALUES (?)`)
      .run('https://www.linkedin.com/posts/unrelated-slug');
    for (const post of [match, other]) {
      db.prepare(
        `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES (?, 'group-a', '+91 1', '2026-09-01T00:00:00.000Z')`
      ).run(post.lastInsertRowid);
    }

    const result = getDashboard(db, { search: 'okr' });
    assert.deepEqual(result.posts.map((p) => p.url), ['https://www.linkedin.com/posts/okr-season-7391']);
  } finally {
    close();
  }
});

test('getDashboard search matches fetched preview author, role, and excerpt text', () => {
  const { db, close } = createTestDb();
  try {
    const byAuthor = db
      .prepare(`INSERT INTO posts (canonical_url, preview_author) VALUES (?, ?)`)
      .run('https://www.linkedin.com/posts/a', 'Ananya Rao');
    const byExcerpt = db
      .prepare(`INSERT INTO posts (canonical_url, preview_excerpt) VALUES (?, ?)`)
      .run('https://www.linkedin.com/posts/b', 'Notes on our Q4 OKRs and what we learned');
    const unrelated = db
      .prepare(`INSERT INTO posts (canonical_url, preview_author) VALUES (?, ?)`)
      .run('https://www.linkedin.com/posts/c', 'Rohan Iyer');
    for (const post of [byAuthor, byExcerpt, unrelated]) {
      db.prepare(
        `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES (?, 'group-a', '+91 1', '2026-09-01T00:00:00.000Z')`
      ).run(post.lastInsertRowid);
    }

    const result = getDashboard(db, { search: 'ananya' });
    assert.deepEqual(result.posts.map((p) => p.url), ['https://www.linkedin.com/posts/a']);

    const excerptResult = getDashboard(db, { search: 'OKR' });
    assert.deepEqual(excerptResult.posts.map((p) => p.url), ['https://www.linkedin.com/posts/b']);
  } finally {
    close();
  }
});

test('getMemberFilterOptions returns zero counts and no members on an empty DB', () => {
  const { db, close } = createTestDb();
  try {
    const result = getMemberFilterOptions(db);
    assert.deepEqual(result, { totalCount: 0, pendingCount: 0, members: [] });
  } finally {
    close();
  }
});

test('getMemberFilterOptions counts posts overall, per member, and pending, ordered by post count desc', () => {
  const { db, close } = createTestDb();
  try {
    const prolific = db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Ananya Rao');
    const occasional = db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Karan Mehta');

    const postA = db.prepare(`INSERT INTO posts (canonical_url) VALUES (?)`).run('https://www.linkedin.com/posts/a');
    const postB = db.prepare(`INSERT INTO posts (canonical_url) VALUES (?)`).run('https://www.linkedin.com/posts/b');
    const postC = db.prepare(`INSERT INTO posts (canonical_url) VALUES (?)`).run('https://www.linkedin.com/posts/c');

    // Ananya shared posts A and B; Karan shared only B; C has a pending sharer.
    db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp) VALUES (?, 'group-a', 'Ananya Rao', ?, '2026-09-01T00:00:00.000Z')`
    ).run(postA.lastInsertRowid, Number(prolific.lastInsertRowid));
    db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp) VALUES (?, 'group-a', 'Ananya Rao', ?, '2026-09-02T00:00:00.000Z')`
    ).run(postB.lastInsertRowid, Number(prolific.lastInsertRowid));
    db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp) VALUES (?, 'group-a', 'Karan Mehta', ?, '2026-09-03T00:00:00.000Z')`
    ).run(postB.lastInsertRowid, Number(occasional.lastInsertRowid));
    db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES (?, 'group-a', '+91 1', '2026-09-04T00:00:00.000Z')`
    ).run(postC.lastInsertRowid);

    const result = getMemberFilterOptions(db);
    assert.equal(result.totalCount, 3);
    assert.equal(result.pendingCount, 1);
    assert.deepEqual(
      result.members.map((m) => ({ displayName: m.displayName, postCount: m.postCount })),
      [
        { displayName: 'Ananya Rao', postCount: 2 },
        { displayName: 'Karan Mehta', postCount: 1 },
      ]
    );
  } finally {
    close();
  }
});
