// Primary seam for ticket #5: OTHER_LINKEDIN review actions (dismiss,
// promote-to-post) exercised directly against a real temporary SQLite DB,
// asserted through the public query API, mirroring identity/aliases.test.js's
// pattern for the UNKNOWN_SENDER review actions.
//
// Seeds the OTHER_LINKEDIN review item with a direct insert rather than
// `ingest()` -- src/ingest/ingest.js is still mid-migration (sync
// orchestration calling the now-async ingest helpers without awaiting them,
// ticket #8's job) so it cannot be used as a fixture seeder yet. The insert
// below reproduces exactly what `ensureOtherLinkedInReviewItem` (called from
// `ingest()`) would have written for this scenario.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from '../helpers/testDb.js';
import { getDashboard } from '../../src/query/dashboard.js';
import { getOtherLinkedInReviewItems } from '../../src/query/review.js';
import {
  dismissOtherLinkedInItem,
  promoteOtherLinkedInItem,
  undoOtherLinkedInAction,
} from '../../src/review/otherLinkedIn.js';

const GROUP = 'group-a';
const RAW_SENDER = 'Priya Sharma';
const PROFILE_URL = 'https://www.linkedin.com/in/priya-sharma';
const TIMESTAMP = '2026-09-30T04:45:00.000Z';

async function seedOtherLinkedInItem(db) {
  const payload = { url: PROFILE_URL, rawSender: RAW_SENDER, timestamp: TIMESTAMP, groupId: GROUP, note: null };
  const result = await db
    .prepare("INSERT INTO review_items (kind, payload) VALUES ('OTHER_LINKEDIN', ?)")
    .run(JSON.stringify(payload));
  return db.prepare('SELECT * FROM review_items WHERE id = ?').get(Number(result.lastInsertRowid));
}

test('dismiss confirms a non-post link and removes it from the open review queue', async () => {
  const { db, close } = await createTestDb();
  try {
    const item = await seedOtherLinkedInItem(db);

    const ok = await dismissOtherLinkedInItem(db, item.id);
    assert.equal(ok, true);

    assert.equal((await getOtherLinkedInReviewItems(db)).length, 0);
    const row = await db.prepare('SELECT status FROM review_items WHERE id = ?').get(item.id);
    assert.equal(row.status, 'DISMISSED');
  } finally {
    await close();
  }
});

test('dismiss is reversible: undo reopens the item', async () => {
  const { db, close } = await createTestDb();
  try {
    const item = await seedOtherLinkedInItem(db);
    await dismissOtherLinkedInItem(db, item.id);

    const ok = await undoOtherLinkedInAction(db, item.id);
    assert.equal(ok, true);

    assert.equal((await getOtherLinkedInReviewItems(db)).length, 1);
    const row = await db.prepare('SELECT status FROM review_items WHERE id = ?').get(item.id);
    assert.equal(row.status, 'OPEN');
  } finally {
    await close();
  }
});

test('promote reclassifies the link as a post, flowing into dedup/attribution', async () => {
  const { db, close } = await createTestDb();
  try {
    const member = await db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Priya Sharma');
    await db
      .prepare('INSERT INTO aliases (member_id, raw_value) VALUES (?, ?)')
      .run(Number(member.lastInsertRowid), 'Priya Sharma');
    const item = await seedOtherLinkedInItem(db);

    const ok = await promoteOtherLinkedInItem(db, item.id);
    assert.equal(ok, true);

    const dashboard = await getDashboard(db);
    assert.equal(dashboard.posts.length, 1);
    assert.equal(dashboard.posts[0].url, 'https://www.linkedin.com/in/priya-sharma');
    assert.equal(dashboard.posts[0].shareCount, 1);
    assert.equal(dashboard.posts[0].pendingAttribution, false);

    assert.equal((await getOtherLinkedInReviewItems(db)).length, 0);
    const row = await db.prepare('SELECT status FROM review_items WHERE id = ?').get(item.id);
    assert.equal(row.status, 'RESOLVED');
  } finally {
    await close();
  }
});

test('promoting a link from an unresolved sender creates a Pending-attribution post and an UNKNOWN_SENDER item', async () => {
  const { db, close } = await createTestDb();
  try {
    const item = await seedOtherLinkedInItem(db);

    await promoteOtherLinkedInItem(db, item.id);

    const dashboard = await getDashboard(db);
    assert.equal(dashboard.posts[0].pendingAttribution, true);
    const unknownItem = await db.prepare("SELECT * FROM review_items WHERE kind = 'UNKNOWN_SENDER'").get();
    assert.ok(unknownItem);
    assert.equal(unknownItem.status, 'OPEN');
  } finally {
    await close();
  }
});

test('promote is reversible: undo removes the created sharing event and the post it created, reopening the item', async () => {
  const { db, close } = await createTestDb();
  try {
    const item = await seedOtherLinkedInItem(db);
    await promoteOtherLinkedInItem(db, item.id);

    const ok = await undoOtherLinkedInAction(db, item.id);
    assert.equal(ok, true);

    const dashboard = await getDashboard(db);
    assert.equal(dashboard.posts.length, 0);
    assert.equal((await getOtherLinkedInReviewItems(db)).length, 1);
    const row = await db.prepare('SELECT status FROM review_items WHERE id = ?').get(item.id);
    assert.equal(row.status, 'OPEN');
  } finally {
    await close();
  }
});

test('undoing a promotion onto an already-existing post removes only the sharing event, not the post', async () => {
  const { db, close } = await createTestDb();
  try {
    // A real post already exists at the same canonical URL (e.g. the admin
    // had already promoted a different sharing of it, or it was a true post
    // shared separately) -- promoting another OTHER_LINKEDIN item that
    // resolves to the same URL should not delete that pre-existing post on undo.
    await db.prepare('INSERT INTO posts (canonical_url) VALUES (?)').run('https://www.linkedin.com/in/priya-sharma');

    const item = await seedOtherLinkedInItem(db);
    await promoteOtherLinkedInItem(db, item.id);
    await undoOtherLinkedInAction(db, item.id);

    const post = await db
      .prepare('SELECT * FROM posts WHERE canonical_url = ?')
      .get('https://www.linkedin.com/in/priya-sharma');
    assert.ok(post);
    const events = await db.prepare('SELECT * FROM sharing_events WHERE post_id = ?').all(post.id);
    assert.equal(events.length, 0);
  } finally {
    await close();
  }
});

test('dismissing/promoting a non-open or wrong-kind id is a no-op, not an error', async () => {
  const { db, close } = await createTestDb();
  try {
    assert.equal(await dismissOtherLinkedInItem(db, 999), false);
    assert.equal(await promoteOtherLinkedInItem(db, 999), false);
    assert.equal(await undoOtherLinkedInAction(db, 999), false);
  } finally {
    await close();
  }
});
