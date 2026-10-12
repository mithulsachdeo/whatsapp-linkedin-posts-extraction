// Primary seam for this ticket: the public query API (getDashboard), run
// against a real temporary SQLite DB. Later tickets' ingestion tests feed
// this same DB through ingest(...) and assert here; since ingestion doesn't
// exist yet, fixtures are inserted directly to establish the query contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from '../helpers/testDb.js';
import { getDashboard, getMemberFilterOptions, getPostDetail, getPostUrl } from '../../src/query/dashboard.js';

test('getDashboard returns no posts and a null lastUpdated on an empty DB', async () => {
  const { db, close } = await createTestDb();
  try {
    const result = await getDashboard(db);
    assert.deepEqual(result.posts, []);
    assert.equal(result.lastUpdated, null);
  } finally {
    await close();
  }
});

test('getDashboard reflects completed import batches in lastUpdated', async () => {
  const { db, close } = await createTestDb();
  try {
    await db.prepare(
      `INSERT INTO import_batches (group_id, filename, content_hash, status, completed_at)
       VALUES ('group-a', 'chat.txt', 'hash1', 'COMPLETE', '2026-09-30T12:00:00.000Z')`
    ).run();

    const result = await getDashboard(db);
    assert.equal(result.lastUpdated, '2026-09-30T12:00:00.000Z');
  } finally {
    await close();
  }
});

test('getDashboard aggregates share count and orders most-recent-first by default', async () => {
  const { db, close } = await createTestDb();
  try {
    const olderPost = await db
      .prepare(`INSERT INTO posts (canonical_url, first_shared_at, last_shared_at) VALUES (?, ?, ?)`)
      .run('https://www.linkedin.com/posts/older', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z');
    const newerPost = await db
      .prepare(`INSERT INTO posts (canonical_url, first_shared_at, last_shared_at) VALUES (?, ?, ?)`)
      .run('https://www.linkedin.com/posts/newer', '2026-09-05T00:00:00.000Z', '2026-09-10T00:00:00.000Z');

    await db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES (?, 'group-a', '+91 90000 00000', '2026-09-01T00:00:00.000Z')`
    ).run(olderPost.lastInsertRowid);

    for (const ts of ['2026-09-05T00:00:00.000Z', '2026-09-10T00:00:00.000Z']) {
      await db.prepare(
        `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES (?, 'group-a', '+91 90000 00001', ?)`
      ).run(newerPost.lastInsertRowid, ts);
    }

    const result = await getDashboard(db);
    assert.equal(result.posts.length, 2);
    assert.equal(result.posts[0].url, 'https://www.linkedin.com/posts/newer');
    assert.equal(result.posts[0].shareCount, 2);
    assert.equal(result.posts[1].url, 'https://www.linkedin.com/posts/older');
    assert.equal(result.posts[1].shareCount, 1);
  } finally {
    await close();
  }
});

test('getDashboard groups posts with a preview before posts without one, newest-first within each group', async () => {
  const { db, close } = await createTestDb();
  try {
    // Older post, HAS a preview (via preview_author) -> should outrank a
    // newer post with no preview at all.
    const olderWithPreview = await db
      .prepare(`INSERT INTO posts (canonical_url, preview_author, last_shared_at) VALUES (?, ?, ?)`)
      .run('https://www.linkedin.com/posts/older-with-preview', 'Ananya Rao', '2026-09-01T00:00:00.000Z');
    // Newer post, no preview fields at all.
    const newerNoPreview = await db
      .prepare(`INSERT INTO posts (canonical_url, last_shared_at) VALUES (?, ?)`)
      .run('https://www.linkedin.com/posts/newer-no-preview', '2026-09-20T00:00:00.000Z');
    // Newest post, HAS a preview (via preview_excerpt) -> should rank above
    // the older-with-preview post, within the has-preview group.
    const newestWithPreview = await db
      .prepare(`INSERT INTO posts (canonical_url, preview_excerpt, last_shared_at) VALUES (?, ?, ?)`)
      .run('https://www.linkedin.com/posts/newest-with-preview', 'Some excerpt text', '2026-09-25T00:00:00.000Z');
    // Oldest post, no preview -> should rank below newer-no-preview, within
    // the no-preview group.
    const oldestNoPreview = await db
      .prepare(`INSERT INTO posts (canonical_url, last_shared_at) VALUES (?, ?)`)
      .run('https://www.linkedin.com/posts/oldest-no-preview', '2026-08-01T00:00:00.000Z');

    for (const post of [olderWithPreview, newerNoPreview, newestWithPreview, oldestNoPreview]) {
      await db.prepare(
        `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES (?, 'group-a', '+91 1', '2026-09-01T00:00:00.000Z')`
      ).run(post.lastInsertRowid);
    }

    const result = await getDashboard(db);
    assert.deepEqual(result.posts.map((p) => p.url), [
      'https://www.linkedin.com/posts/newest-with-preview',
      'https://www.linkedin.com/posts/older-with-preview',
      'https://www.linkedin.com/posts/newer-no-preview',
      'https://www.linkedin.com/posts/oldest-no-preview',
    ]);
  } finally {
    await close();
  }
});

test('getDashboard counts distinct sharers, treating unresolved raw senders as distinct from each other', async () => {
  const { db, close } = await createTestDb();
  try {
    const post = await db.prepare(`INSERT INTO posts (canonical_url) VALUES (?)`).run('https://www.linkedin.com/posts/multi');

    // Same resolved member shares twice -> 1 distinct sharer.
    const member = await db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Priya Sharma');
    await db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp) VALUES (?, 'group-a', 'Priya Sharma', ?, '2026-09-01T00:00:00.000Z')`
    ).run(post.lastInsertRowid, Number(member.lastInsertRowid));
    await db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp) VALUES (?, 'group-a', 'Priya Sharma', ?, '2026-09-02T00:00:00.000Z')`
    ).run(post.lastInsertRowid, Number(member.lastInsertRowid));
    // Two different unresolved raw senders -> 2 more distinct sharers.
    await db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp) VALUES (?, 'group-a', '+91 1', NULL, '2026-09-03T00:00:00.000Z')`
    ).run(post.lastInsertRowid);
    await db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp) VALUES (?, 'group-a', '+91 2', NULL, '2026-09-04T00:00:00.000Z')`
    ).run(post.lastInsertRowid);

    const result = await getDashboard(db);
    assert.equal(result.posts[0].shareCount, 4);
    assert.equal(result.posts[0].distinctSharerCount, 3);
  } finally {
    await close();
  }
});

test('getDashboard marks a post pending attribution when any share has no resolved member', async () => {
  const { db, close } = await createTestDb();
  try {
    const post = await db
      .prepare(`INSERT INTO posts (canonical_url) VALUES (?)`)
      .run('https://www.linkedin.com/posts/pending');

    await db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp)
       VALUES (?, 'group-a', '+91 90000 00002', NULL, '2026-09-01T00:00:00.000Z')`
    ).run(post.lastInsertRowid);

    const result = await getDashboard(db);
    assert.equal(result.posts[0].pendingAttribution, true);
  } finally {
    await close();
  }
});

test('getDashboard filters to a single member, excluding posts that member never shared', async () => {
  const { db, close } = await createTestDb();
  try {
    const member = await db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Priya Sharma');
    const sharedByMember = await db
      .prepare(`INSERT INTO posts (canonical_url) VALUES (?)`)
      .run('https://www.linkedin.com/posts/by-priya');
    const sharedByOther = await db
      .prepare(`INSERT INTO posts (canonical_url) VALUES (?)`)
      .run('https://www.linkedin.com/posts/by-someone-else');

    await db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp) VALUES (?, 'group-a', 'Priya Sharma', ?, '2026-09-01T00:00:00.000Z')`
    ).run(sharedByMember.lastInsertRowid, Number(member.lastInsertRowid));
    await db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES (?, 'group-a', '+91 90000 00009', '2026-09-02T00:00:00.000Z')`
    ).run(sharedByOther.lastInsertRowid);

    const result = await getDashboard(db, { memberId: Number(member.lastInsertRowid) });
    assert.deepEqual(result.posts.map((p) => p.url), ['https://www.linkedin.com/posts/by-priya']);
  } finally {
    await close();
  }
});

test('getDashboard pending option returns only posts with at least one unresolved sharer', async () => {
  const { db, close } = await createTestDb();
  try {
    const pendingPost = await db
      .prepare(`INSERT INTO posts (canonical_url) VALUES (?)`)
      .run('https://www.linkedin.com/posts/pending-only');
    const resolvedPost = await db
      .prepare(`INSERT INTO posts (canonical_url) VALUES (?)`)
      .run('https://www.linkedin.com/posts/resolved-only');
    const member = await db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Karan Mehta');

    await db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES (?, 'group-a', '+91 1', '2026-09-01T00:00:00.000Z')`
    ).run(pendingPost.lastInsertRowid);
    await db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp) VALUES (?, 'group-a', 'Karan Mehta', ?, '2026-09-02T00:00:00.000Z')`
    ).run(resolvedPost.lastInsertRowid, Number(member.lastInsertRowid));

    const result = await getDashboard(db, { pending: true });
    assert.deepEqual(result.posts.map((p) => p.url), ['https://www.linkedin.com/posts/pending-only']);
  } finally {
    await close();
  }
});

test('getDashboard search matches the post URL/slug', async () => {
  const { db, close } = await createTestDb();
  try {
    const match = await db
      .prepare(`INSERT INTO posts (canonical_url) VALUES (?)`)
      .run('https://www.linkedin.com/posts/okr-season-7391');
    const other = await db
      .prepare(`INSERT INTO posts (canonical_url) VALUES (?)`)
      .run('https://www.linkedin.com/posts/unrelated-slug');
    for (const post of [match, other]) {
      await db.prepare(
        `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES (?, 'group-a', '+91 1', '2026-09-01T00:00:00.000Z')`
      ).run(post.lastInsertRowid);
    }

    const result = await getDashboard(db, { search: 'okr' });
    assert.deepEqual(result.posts.map((p) => p.url), ['https://www.linkedin.com/posts/okr-season-7391']);
  } finally {
    await close();
  }
});

test('getDashboard search matches fetched preview author, role, and excerpt text', async () => {
  const { db, close } = await createTestDb();
  try {
    const byAuthor = await db
      .prepare(`INSERT INTO posts (canonical_url, preview_author) VALUES (?, ?)`)
      .run('https://www.linkedin.com/posts/a', 'Ananya Rao');
    const byExcerpt = await db
      .prepare(`INSERT INTO posts (canonical_url, preview_excerpt) VALUES (?, ?)`)
      .run('https://www.linkedin.com/posts/b', 'Notes on our Q4 OKRs and what we learned');
    const unrelated = await db
      .prepare(`INSERT INTO posts (canonical_url, preview_author) VALUES (?, ?)`)
      .run('https://www.linkedin.com/posts/c', 'Rohan Iyer');
    for (const post of [byAuthor, byExcerpt, unrelated]) {
      await db.prepare(
        `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES (?, 'group-a', '+91 1', '2026-09-01T00:00:00.000Z')`
      ).run(post.lastInsertRowid);
    }

    const result = await getDashboard(db, { search: 'ananya' });
    assert.deepEqual(result.posts.map((p) => p.url), ['https://www.linkedin.com/posts/a']);

    const excerptResult = await getDashboard(db, { search: 'OKR' });
    assert.deepEqual(excerptResult.posts.map((p) => p.url), ['https://www.linkedin.com/posts/b']);
  } finally {
    await close();
  }
});

test('getDashboard defaults to the unread view: a post whose id is in readIds is excluded', async () => {
  const { db, close } = await createTestDb();
  try {
    const read = await db.prepare(`INSERT INTO posts (canonical_url) VALUES (?)`).run('https://www.linkedin.com/posts/read');
    const unread = await db
      .prepare(`INSERT INTO posts (canonical_url) VALUES (?)`)
      .run('https://www.linkedin.com/posts/unread');
    for (const post of [read, unread]) {
      await db.prepare(
        `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES (?, 'group-a', '+91 1', '2026-09-01T00:00:00.000Z')`
      ).run(post.lastInsertRowid);
    }

    const result = await getDashboard(db, { readIds: [Number(read.lastInsertRowid)] });
    assert.deepEqual(result.posts.map((p) => p.url), ['https://www.linkedin.com/posts/unread']);
  } finally {
    await close();
  }
});

test('getDashboard view="read" returns only posts whose id is in readIds', async () => {
  const { db, close } = await createTestDb();
  try {
    const read = await db.prepare(`INSERT INTO posts (canonical_url) VALUES (?)`).run('https://www.linkedin.com/posts/read');
    const unread = await db
      .prepare(`INSERT INTO posts (canonical_url) VALUES (?)`)
      .run('https://www.linkedin.com/posts/unread');
    for (const post of [read, unread]) {
      await db.prepare(
        `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES (?, 'group-a', '+91 1', '2026-09-01T00:00:00.000Z')`
      ).run(post.lastInsertRowid);
    }

    const result = await getDashboard(db, { view: 'read', readIds: [Number(read.lastInsertRowid)] });
    assert.deepEqual(result.posts.map((p) => p.url), ['https://www.linkedin.com/posts/read']);
  } finally {
    await close();
  }
});

test('getDashboard view="read" with an empty readIds returns no posts', async () => {
  const { db, close } = await createTestDb();
  try {
    const post = await db.prepare(`INSERT INTO posts (canonical_url) VALUES (?)`).run('https://www.linkedin.com/posts/a');
    await db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES (?, 'group-a', '+91 1', '2026-09-01T00:00:00.000Z')`
    ).run(post.lastInsertRowid);

    const result = await getDashboard(db, { view: 'read', readIds: [] });
    assert.deepEqual(result.posts, []);
  } finally {
    await close();
  }
});

test('getDashboard view="all" ignores readIds and returns every post', async () => {
  const { db, close } = await createTestDb();
  try {
    const read = await db.prepare(`INSERT INTO posts (canonical_url) VALUES (?)`).run('https://www.linkedin.com/posts/read');
    const unread = await db
      .prepare(`INSERT INTO posts (canonical_url) VALUES (?)`)
      .run('https://www.linkedin.com/posts/unread');
    for (const post of [read, unread]) {
      await db.prepare(
        `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES (?, 'group-a', '+91 1', '2026-09-01T00:00:00.000Z')`
      ).run(post.lastInsertRowid);
    }

    const result = await getDashboard(db, { view: 'all', readIds: [Number(read.lastInsertRowid)] });
    assert.deepEqual(
      result.posts.map((p) => p.url).sort(),
      ['https://www.linkedin.com/posts/read', 'https://www.linkedin.com/posts/unread']
    );
  } finally {
    await close();
  }
});

test('getDashboard share count and ordering are unaffected by the readIds filter', async () => {
  const { db, close } = await createTestDb();
  try {
    const post = await db.prepare(`INSERT INTO posts (canonical_url) VALUES (?)`).run('https://www.linkedin.com/posts/a');
    for (const ts of ['2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z']) {
      await db.prepare(
        `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES (?, 'group-a', '+91 1', ?)`
      ).run(post.lastInsertRowid, ts);
    }

    const postId = Number(post.lastInsertRowid);
    const unfiltered = await getDashboard(db);
    const allView = await getDashboard(db, { view: 'all', readIds: [postId] });
    assert.equal(unfiltered.posts[0].shareCount, 2);
    assert.equal(allView.posts[0].shareCount, 2);
  } finally {
    await close();
  }
});

test('getPostUrl returns the canonical URL for a known post id', async () => {
  const { db, close } = await createTestDb();
  try {
    const post = await db
      .prepare(`INSERT INTO posts (canonical_url) VALUES (?)`)
      .run('https://www.linkedin.com/posts/okr-season-7391');
    assert.equal(await getPostUrl(db, Number(post.lastInsertRowid)), 'https://www.linkedin.com/posts/okr-season-7391');
  } finally {
    await close();
  }
});

test('getPostUrl returns null for an id that does not exist', async () => {
  const { db, close } = await createTestDb();
  try {
    assert.equal(await getPostUrl(db, 999), null);
  } finally {
    await close();
  }
});

test('getPostDetail returns null for an id that does not exist', async () => {
  const { db, close } = await createTestDb();
  try {
    assert.equal(await getPostDetail(db, 999), null);
  } finally {
    await close();
  }
});

test('getPostDetail returns the full share history, oldest first, flagging the earliest as first share', async () => {
  const { db, close } = await createTestDb();
  try {
    const post = await db
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
    const member = await db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Karan Mehta');

    // Later share inserted first, to prove ordering comes from the
    // timestamp, not insertion order.
    await db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp, note)
       VALUES (?, 'pm-collective', 'Karan Mehta', ?, '2026-09-05T00:00:00.000Z', 'Relevant for Q4')`
    ).run(postId, Number(member.lastInsertRowid));
    await db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp)
       VALUES (?, 'product-chai', '+91 90000 00000', '2026-09-01T00:00:00.000Z')`
    ).run(postId);

    const detail = await getPostDetail(db, postId);

    assert.equal(detail.id, postId);
    assert.equal(detail.url, 'https://www.linkedin.com/posts/okr-season-7391');
    assert.equal(detail.previewAuthor, 'Ananya Rao');
    assert.equal(detail.shareCount, 2);
    assert.equal(detail.distinctSharerCount, 2);
    assert.equal(detail.pendingAttribution, true);

    assert.equal(detail.shares.length, 2);
    const [first, second] = detail.shares;
    assert.equal(first.rawSender, '+91 90000 00000');
    assert.equal(first.displayName, null);
    assert.equal(first.isFirstShare, true);
    assert.equal(first.note, null);
    assert.equal(first.groupName, 'Product Chai');

    assert.equal(second.displayName, 'Karan Mehta');
    assert.equal(second.rawSender, 'Karan Mehta');
    assert.equal(second.isFirstShare, false);
    assert.equal(second.note, 'Relevant for Q4');
    assert.equal(second.groupName, 'PM Collective');
  } finally {
    await close();
  }
});

test('getPostDetail reports preview_unavailable and still returns the share history', async () => {
  const { db, close } = await createTestDb();
  try {
    const post = await db
      .prepare(`INSERT INTO posts (canonical_url, preview_unavailable) VALUES (?, 1)`)
      .run('https://www.linkedin.com/posts/no-preview-7392');
    const postId = Number(post.lastInsertRowid);
    await db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp)
       VALUES (?, 'product-chai', '+91 1', '2026-09-01T00:00:00.000Z')`
    ).run(postId);

    const detail = await getPostDetail(db, postId);
    assert.equal(detail.previewUnavailable, true);
    assert.equal(detail.previewAuthor, null);
    assert.equal(detail.shares.length, 1);
  } finally {
    await close();
  }
});

test('getMemberFilterOptions returns zero counts and no members on an empty DB', async () => {
  const { db, close } = await createTestDb();
  try {
    const result = await getMemberFilterOptions(db);
    assert.deepEqual(result, { totalCount: 0, pendingCount: 0, members: [] });
  } finally {
    await close();
  }
});

test('getMemberFilterOptions counts posts overall, per member, and pending, ordered by post count desc', async () => {
  const { db, close } = await createTestDb();
  try {
    const prolific = await db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Ananya Rao');
    const occasional = await db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Karan Mehta');

    const postA = await db.prepare(`INSERT INTO posts (canonical_url) VALUES (?)`).run('https://www.linkedin.com/posts/a');
    const postB = await db.prepare(`INSERT INTO posts (canonical_url) VALUES (?)`).run('https://www.linkedin.com/posts/b');
    const postC = await db.prepare(`INSERT INTO posts (canonical_url) VALUES (?)`).run('https://www.linkedin.com/posts/c');

    // Ananya shared posts A and B; Karan shared only B; C has a pending sharer.
    await db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp) VALUES (?, 'group-a', 'Ananya Rao', ?, '2026-09-01T00:00:00.000Z')`
    ).run(postA.lastInsertRowid, Number(prolific.lastInsertRowid));
    await db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp) VALUES (?, 'group-a', 'Ananya Rao', ?, '2026-09-02T00:00:00.000Z')`
    ).run(postB.lastInsertRowid, Number(prolific.lastInsertRowid));
    await db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp) VALUES (?, 'group-a', 'Karan Mehta', ?, '2026-09-03T00:00:00.000Z')`
    ).run(postB.lastInsertRowid, Number(occasional.lastInsertRowid));
    await db.prepare(
      `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp) VALUES (?, 'group-a', '+91 1', '2026-09-04T00:00:00.000Z')`
    ).run(postC.lastInsertRowid);

    const result = await getMemberFilterOptions(db);
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
    await close();
  }
});
