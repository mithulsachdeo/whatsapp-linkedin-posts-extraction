// Primary seam for ticket #5: OTHER_LINKEDIN review actions (dismiss,
// promote-to-post) exercised directly against a real temporary SQLite DB,
// asserted through the public query API, mirroring identity/aliases.test.js's
// pattern for the UNKNOWN_SENDER review actions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from '../helpers/testDb.js';
import { ingest } from '../../src/ingest/ingest.js';
import { getDashboard } from '../../src/query/dashboard.js';
import { getOtherLinkedInReviewItems } from '../../src/query/review.js';
import {
  dismissOtherLinkedInItem,
  promoteOtherLinkedInItem,
  undoOtherLinkedInAction,
} from '../../src/review/otherLinkedIn.js';

const GROUP = 'group-a';

function ingestProfileLink(db) {
  const text = '30/09/26, 10:15 - Priya Sharma: https://www.linkedin.com/in/priya-sharma';
  ingest(db, text, GROUP);
  return db.prepare("SELECT * FROM review_items WHERE kind = 'OTHER_LINKEDIN'").get();
}

test('dismiss confirms a non-post link and removes it from the open review queue', () => {
  const { db, close } = createTestDb();
  try {
    const item = ingestProfileLink(db);

    const ok = dismissOtherLinkedInItem(db, item.id);
    assert.equal(ok, true);

    assert.equal(getOtherLinkedInReviewItems(db).length, 0);
    const row = db.prepare('SELECT status FROM review_items WHERE id = ?').get(item.id);
    assert.equal(row.status, 'DISMISSED');
  } finally {
    close();
  }
});

test('dismiss is reversible: undo reopens the item', () => {
  const { db, close } = createTestDb();
  try {
    const item = ingestProfileLink(db);
    dismissOtherLinkedInItem(db, item.id);

    const ok = undoOtherLinkedInAction(db, item.id);
    assert.equal(ok, true);

    assert.equal(getOtherLinkedInReviewItems(db).length, 1);
    const row = db.prepare('SELECT status FROM review_items WHERE id = ?').get(item.id);
    assert.equal(row.status, 'OPEN');
  } finally {
    close();
  }
});

test('promote reclassifies the link as a post, flowing into dedup/attribution', () => {
  const { db, close } = createTestDb();
  try {
    const member = db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Priya Sharma');
    db.prepare('INSERT INTO aliases (member_id, raw_value) VALUES (?, ?)').run(
      Number(member.lastInsertRowid),
      'Priya Sharma'
    );
    const item = ingestProfileLink(db);

    const ok = promoteOtherLinkedInItem(db, item.id);
    assert.equal(ok, true);

    const dashboard = getDashboard(db);
    assert.equal(dashboard.posts.length, 1);
    assert.equal(dashboard.posts[0].url, 'https://www.linkedin.com/in/priya-sharma');
    assert.equal(dashboard.posts[0].shareCount, 1);
    assert.equal(dashboard.posts[0].pendingAttribution, false);

    assert.equal(getOtherLinkedInReviewItems(db).length, 0);
    const row = db.prepare('SELECT status FROM review_items WHERE id = ?').get(item.id);
    assert.equal(row.status, 'RESOLVED');
  } finally {
    close();
  }
});

test('promoting a link from an unresolved sender creates a Pending-attribution post and an UNKNOWN_SENDER item', () => {
  const { db, close } = createTestDb();
  try {
    const item = ingestProfileLink(db);

    promoteOtherLinkedInItem(db, item.id);

    const dashboard = getDashboard(db);
    assert.equal(dashboard.posts[0].pendingAttribution, true);
    const unknownItem = db.prepare("SELECT * FROM review_items WHERE kind = 'UNKNOWN_SENDER'").get();
    assert.ok(unknownItem);
    assert.equal(unknownItem.status, 'OPEN');
  } finally {
    close();
  }
});

test('promote is reversible: undo removes the created sharing event and the post it created, reopening the item', () => {
  const { db, close } = createTestDb();
  try {
    const item = ingestProfileLink(db);
    promoteOtherLinkedInItem(db, item.id);

    const ok = undoOtherLinkedInAction(db, item.id);
    assert.equal(ok, true);

    const dashboard = getDashboard(db);
    assert.equal(dashboard.posts.length, 0);
    assert.equal(getOtherLinkedInReviewItems(db).length, 1);
    const row = db.prepare('SELECT status FROM review_items WHERE id = ?').get(item.id);
    assert.equal(row.status, 'OPEN');
  } finally {
    close();
  }
});

test('undoing a promotion onto an already-existing post removes only the sharing event, not the post', () => {
  const { db, close } = createTestDb();
  try {
    // A real post already exists at the same canonical URL (e.g. the admin
    // had already promoted a different sharing of it, or it was a true post
    // shared separately) -- promoting another OTHER_LINKEDIN item that
    // resolves to the same URL should not delete that pre-existing post on undo.
    db.prepare('INSERT INTO posts (canonical_url) VALUES (?)').run('https://www.linkedin.com/in/priya-sharma');

    const item = ingestProfileLink(db);
    promoteOtherLinkedInItem(db, item.id);
    undoOtherLinkedInAction(db, item.id);

    const post = db.prepare('SELECT * FROM posts WHERE canonical_url = ?').get(
      'https://www.linkedin.com/in/priya-sharma'
    );
    assert.ok(post);
    const events = db.prepare('SELECT * FROM sharing_events WHERE post_id = ?').all(post.id);
    assert.equal(events.length, 0);
  } finally {
    close();
  }
});

test('dismissing/promoting a non-open or wrong-kind id is a no-op, not an error', () => {
  const { db, close } = createTestDb();
  try {
    assert.equal(dismissOtherLinkedInItem(db, 999), false);
    assert.equal(promoteOtherLinkedInItem(db, 999), false);
    assert.equal(undoOtherLinkedInAction(db, 999), false);
  } finally {
    close();
  }
});
