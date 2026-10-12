// Primary seam: identity resolution helpers against a real temporary SQLite
// DB, asserted through the public query API plus direct reads for
// review-queue/member state not yet exposed through a query module.
//
// Seeds the pending-attribution fixture (a post + sharing event from an
// unresolved sender + its UNKNOWN_SENDER review item) with direct inserts
// rather than `ingest()` -- src/ingest/ingest.js is still mid-migration
// (sync orchestration calling the now-async upsertPost/resolveMember/etc
// helpers without awaiting them, ticket #8's job) so it cannot be used as a
// fixture seeder yet. The inserts below reproduce exactly what `ingest()`
// would have written for this scenario.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from '../helpers/testDb.js';
import { mapAliasToMember, createMemberAndMapAlias, undoAliasMapping } from '../../src/identity/aliases.js';
import { getDashboard } from '../../src/query/dashboard.js';

const GROUP = 'group-a';
const RAW_SENDER = '+91 90000 00000';
const POST_URL = 'https://www.linkedin.com/posts/someone_activity-1-abcd';
const TIMESTAMP = '2026-09-30T04:45:00.000Z';

async function seedPendingPost(db) {
  const post = await db
    .prepare('INSERT INTO posts (canonical_url, first_shared_at, last_shared_at) VALUES (?, ?, ?)')
    .run(POST_URL, TIMESTAMP, TIMESTAMP);
  const postId = Number(post.lastInsertRowid);
  await db
    .prepare(
      'INSERT INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp) VALUES (?, ?, ?, NULL, ?)'
    )
    .run(postId, GROUP, RAW_SENDER, TIMESTAMP);
  await db
    .prepare("INSERT INTO review_items (kind, payload) VALUES ('UNKNOWN_SENDER', ?)")
    .run(JSON.stringify({ rawSender: RAW_SENDER }));
  return postId;
}

test('createMemberAndMapAlias creates a member, retroactively re-attributes prior events, and resolves the review item', async () => {
  const { db, close } = await createTestDb();
  try {
    await seedPendingPost(db);

    const memberId = await createMemberAndMapAlias(db, RAW_SENDER, 'Priya Sharma');

    const dashboard = await getDashboard(db);
    assert.equal(dashboard.posts[0].pendingAttribution, false);
    assert.deepEqual(dashboard.posts[0].sharers, [{ displayName: 'Priya Sharma', rawSender: RAW_SENDER }]);

    const member = await db.prepare('SELECT display_name FROM members WHERE id = ?').get(memberId);
    assert.equal(member.display_name, 'Priya Sharma');

    const reviewItem = await db.prepare("SELECT status FROM review_items WHERE kind = 'UNKNOWN_SENDER'").get();
    assert.equal(reviewItem.status, 'RESOLVED');
  } finally {
    await close();
  }
});

test('undoAliasMapping reverses mapAliasToMember: events go back to pending and the review item reopens', async () => {
  const { db, close } = await createTestDb();
  try {
    await seedPendingPost(db);
    const member = await db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Priya Sharma');
    await mapAliasToMember(db, RAW_SENDER, Number(member.lastInsertRowid));
    assert.equal((await getDashboard(db)).posts[0].pendingAttribution, false);

    await undoAliasMapping(db, RAW_SENDER);

    const dashboard = await getDashboard(db);
    assert.equal(dashboard.posts[0].pendingAttribution, true);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM aliases').get()).n, 0);

    const reviewItem = await db.prepare("SELECT status FROM review_items WHERE kind = 'UNKNOWN_SENDER'").get();
    assert.equal(reviewItem.status, 'OPEN');

    // The member itself is untouched by undo when it pre-existed the match.
    const stillThere = await db.prepare('SELECT * FROM members WHERE id = ?').get(Number(member.lastInsertRowid));
    assert.ok(stillThere);
  } finally {
    await close();
  }
});

test('undoAliasMapping also removes the member when it was newly created by this match', async () => {
  const { db, close } = await createTestDb();
  try {
    await seedPendingPost(db);
    const memberId = await createMemberAndMapAlias(db, RAW_SENDER, 'Priya Sharma');

    await undoAliasMapping(db, RAW_SENDER, { createdMemberId: memberId });

    assert.equal((await getDashboard(db)).posts[0].pendingAttribution, true);
    const member = await db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
    assert.equal(member, undefined);
  } finally {
    await close();
  }
});

test('undoAliasMapping keeps a newly created member if it gained a second alias before undo', async () => {
  const { db, close } = await createTestDb();
  try {
    await seedPendingPost(db);
    const memberId = await createMemberAndMapAlias(db, RAW_SENDER, 'Priya Sharma');
    await mapAliasToMember(db, '~ Priya', memberId); // a second alias attached independently

    await undoAliasMapping(db, RAW_SENDER, { createdMemberId: memberId });

    const member = await db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
    assert.ok(member, 'member survives because it still has another alias');
  } finally {
    await close();
  }
});
