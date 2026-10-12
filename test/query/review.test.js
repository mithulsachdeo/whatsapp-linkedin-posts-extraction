// Public query API for the review screen (unknown-sender items, other-LinkedIn
// items, members), run against a real temporary SQLite DB. Mirrors
// dashboard.test.js's structure/conventions for the sibling query module.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from '../helpers/testDb.js';
import { getUnknownSenderReviewItems, getOtherLinkedInReviewItems, getMembers } from '../../src/query/review.js';

test('getUnknownSenderReviewItems returns an empty array on an empty DB', async () => {
  const { db, close } = await createTestDb();
  try {
    assert.deepEqual(await getUnknownSenderReviewItems(db), []);
  } finally {
    await close();
  }
});

test('getUnknownSenderReviewItems reports share count and first-seen timestamp for an open item', async () => {
  const { db, close } = await createTestDb();
  try {
    await db
      .prepare(
        `INSERT INTO review_items (kind, status, payload, created_at)
         VALUES ('UNKNOWN_SENDER', 'OPEN', ?, '2026-09-01T00:00:00.000Z')`
      )
      .run(JSON.stringify({ rawSender: '+91 90000 00000' }));

    await db.prepare(`INSERT INTO posts (canonical_url) VALUES (?)`).run('https://www.linkedin.com/posts/a');
    await db
      .prepare(
        `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp)
         VALUES (1, 'group-a', '+91 90000 00000', '2026-09-02T00:00:00.000Z')`
      )
      .run();
    await db
      .prepare(
        `INSERT INTO sharing_events (post_id, group_id, raw_sender, message_timestamp)
         VALUES (1, 'group-a', '+91 90000 00000', '2026-09-05T00:00:00.000Z')`
      )
      .run();

    const items = await getUnknownSenderReviewItems(db);
    assert.equal(items.length, 1);
    assert.equal(items[0].rawSender, '+91 90000 00000');
    assert.equal(items[0].shareCount, 2);
    assert.equal(items[0].firstSeen, '2026-09-02T00:00:00.000Z');
  } finally {
    await close();
  }
});

test('getUnknownSenderReviewItems excludes closed review items', async () => {
  const { db, close } = await createTestDb();
  try {
    await db
      .prepare(
        `INSERT INTO review_items (kind, status, payload, created_at)
         VALUES ('UNKNOWN_SENDER', 'RESOLVED', ?, '2026-09-01T00:00:00.000Z')`
      )
      .run(JSON.stringify({ rawSender: '+91 1' }));

    assert.deepEqual(await getUnknownSenderReviewItems(db), []);
  } finally {
    await close();
  }
});

test('getOtherLinkedInReviewItems returns an empty array on an empty DB', async () => {
  const { db, close } = await createTestDb();
  try {
    assert.deepEqual(await getOtherLinkedInReviewItems(db), []);
  } finally {
    await close();
  }
});

test('getOtherLinkedInReviewItems returns open items with the payload fields flattened', async () => {
  const { db, close } = await createTestDb();
  try {
    await db
      .prepare(
        `INSERT INTO review_items (kind, status, payload, created_at)
         VALUES ('OTHER_LINKEDIN', 'OPEN', ?, '2026-09-01T00:00:00.000Z')`
      )
      .run(
        JSON.stringify({
          url: 'https://www.linkedin.com/feed/update/urn:li:activity:123',
          rawSender: '+91 1',
          timestamp: '2026-09-01T00:00:00.000Z',
          note: 'looks like a comment link',
        })
      );

    const items = await getOtherLinkedInReviewItems(db);
    assert.equal(items.length, 1);
    assert.equal(items[0].url, 'https://www.linkedin.com/feed/update/urn:li:activity:123');
    assert.equal(items[0].rawSender, '+91 1');
    assert.equal(items[0].timestamp, '2026-09-01T00:00:00.000Z');
    assert.equal(items[0].note, 'looks like a comment link');
    assert.equal(items[0].createdAt, '2026-09-01T00:00:00.000Z');
  } finally {
    await close();
  }
});

test('getOtherLinkedInReviewItems excludes closed review items', async () => {
  const { db, close } = await createTestDb();
  try {
    await db
      .prepare(
        `INSERT INTO review_items (kind, status, payload, created_at)
         VALUES ('OTHER_LINKEDIN', 'DISMISSED', ?, '2026-09-01T00:00:00.000Z')`
      )
      .run(JSON.stringify({ url: 'https://www.linkedin.com/x', rawSender: '+91 1', timestamp: '2026-09-01T00:00:00.000Z' }));

    assert.deepEqual(await getOtherLinkedInReviewItems(db), []);
  } finally {
    await close();
  }
});

test('getMembers returns an empty array on an empty DB', async () => {
  const { db, close } = await createTestDb();
  try {
    assert.deepEqual(await getMembers(db), []);
  } finally {
    await close();
  }
});

test('getMembers returns members ordered by display name, case-insensitive', async () => {
  const { db, close } = await createTestDb();
  try {
    await db.prepare('INSERT INTO members (display_name) VALUES (?)').run('zara khan');
    await db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Ananya Rao');
    await db.prepare('INSERT INTO members (display_name) VALUES (?)').run('priya Sharma');

    const members = await getMembers(db);
    assert.deepEqual(members.map((m) => m.displayName), ['Ananya Rao', 'priya Sharma', 'zara khan']);
    assert.ok(members.every((m) => typeof m.id === 'number'));
  } finally {
    await close();
  }
});
