// Primary seam: identity resolution helpers against a real temporary SQLite
// DB, asserted through the public query API plus direct reads for
// review-queue/member state not yet exposed through a query module.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from '../helpers/testDb.js';
import { ingest } from '../../src/ingest/ingest.js';
import { mapAliasToMember, createMemberAndMapAlias, undoAliasMapping } from '../../src/identity/aliases.js';
import { getDashboard } from '../../src/query/dashboard.js';

const GROUP = 'group-a';
const RAW_SENDER = '+91 90000 00000';
const TEXT = `30/09/26, 10:15 - ${RAW_SENDER}: https://www.linkedin.com/posts/someone_activity-1-abcd`;

test('createMemberAndMapAlias creates a member, retroactively re-attributes prior events, and resolves the review item', () => {
  const { db, close } = createTestDb();
  try {
    ingest(db, TEXT, GROUP);

    const memberId = createMemberAndMapAlias(db, RAW_SENDER, 'Priya Sharma');

    const dashboard = getDashboard(db);
    assert.equal(dashboard.posts[0].pendingAttribution, false);
    assert.deepEqual(dashboard.posts[0].sharers, [{ displayName: 'Priya Sharma', rawSender: RAW_SENDER }]);

    const member = db.prepare('SELECT display_name FROM members WHERE id = ?').get(memberId);
    assert.equal(member.display_name, 'Priya Sharma');

    const reviewItem = db.prepare("SELECT status FROM review_items WHERE kind = 'UNKNOWN_SENDER'").get();
    assert.equal(reviewItem.status, 'RESOLVED');
  } finally {
    close();
  }
});

test('undoAliasMapping reverses mapAliasToMember: events go back to pending and the review item reopens', () => {
  const { db, close } = createTestDb();
  try {
    ingest(db, TEXT, GROUP);
    const member = db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Priya Sharma');
    mapAliasToMember(db, RAW_SENDER, Number(member.lastInsertRowid));
    assert.equal(getDashboard(db).posts[0].pendingAttribution, false);

    undoAliasMapping(db, RAW_SENDER);

    const dashboard = getDashboard(db);
    assert.equal(dashboard.posts[0].pendingAttribution, true);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM aliases').get().n, 0);

    const reviewItem = db.prepare("SELECT status FROM review_items WHERE kind = 'UNKNOWN_SENDER'").get();
    assert.equal(reviewItem.status, 'OPEN');

    // The member itself is untouched by undo when it pre-existed the match.
    const stillThere = db.prepare('SELECT * FROM members WHERE id = ?').get(Number(member.lastInsertRowid));
    assert.ok(stillThere);
  } finally {
    close();
  }
});

test('undoAliasMapping also removes the member when it was newly created by this match', () => {
  const { db, close } = createTestDb();
  try {
    ingest(db, TEXT, GROUP);
    const memberId = createMemberAndMapAlias(db, RAW_SENDER, 'Priya Sharma');

    undoAliasMapping(db, RAW_SENDER, { createdMemberId: memberId });

    assert.equal(getDashboard(db).posts[0].pendingAttribution, true);
    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
    assert.equal(member, undefined);
  } finally {
    close();
  }
});

test('undoAliasMapping keeps a newly created member if it gained a second alias before undo', () => {
  const { db, close } = createTestDb();
  try {
    ingest(db, TEXT, GROUP);
    const memberId = createMemberAndMapAlias(db, RAW_SENDER, 'Priya Sharma');
    mapAliasToMember(db, '~ Priya', memberId); // a second alias attached independently

    undoAliasMapping(db, RAW_SENDER, { createdMemberId: memberId });

    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
    assert.ok(member, 'member survives because it still has another alias');
  } finally {
    close();
  }
});
