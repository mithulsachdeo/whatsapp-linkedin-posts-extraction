// Primary seam for ticket #6: UNRESOLVED_SHORT_LINK review actions (paste
// resolved URL, dismiss) exercised directly against a real temporary
// SQLite DB, asserted through the public query API, mirroring
// otherLinkedIn.test.js's pattern for the OTHER_LINKEDIN review actions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from '../helpers/testDb.js';
import { ingest } from '../../src/ingest/ingest.js';
import { getDashboard } from '../../src/query/dashboard.js';
import { getOtherLinkedInReviewItems, getUnresolvedShortLinkReviewItems } from '../../src/query/review.js';
import {
  dismissShortLinkItem,
  resolveShortLinkItem,
  undoShortLinkAction,
} from '../../src/review/shortLink.js';

const GROUP = 'group-a';
const SHORT_URL = 'https://lnkd.in/abc123';

async function ingestUnresolvedShortLink(db) {
  const text = `30/09/26, 10:15 - Priya Sharma: ${SHORT_URL}`;
  const result = ingest(db, text, GROUP); // default resolver always fails
  await result.shortLinkResolutionsSettled;
  return db.prepare("SELECT * FROM review_items WHERE kind = 'UNRESOLVED_SHORT_LINK'").get();
}

test('dismiss gives up on the link and removes it from the open review queue', async () => {
  const { db, close } = createTestDb();
  try {
    const item = await ingestUnresolvedShortLink(db);

    const ok = dismissShortLinkItem(db, item.id);
    assert.equal(ok, true);

    assert.equal(getUnresolvedShortLinkReviewItems(db).length, 0);
    const row = db.prepare('SELECT status FROM review_items WHERE id = ?').get(item.id);
    assert.equal(row.status, 'DISMISSED');
  } finally {
    close();
  }
});

test('dismiss is reversible: undo reopens the item', async () => {
  const { db, close } = createTestDb();
  try {
    const item = await ingestUnresolvedShortLink(db);
    dismissShortLinkItem(db, item.id);

    const ok = undoShortLinkAction(db, item.id);
    assert.equal(ok, true);

    assert.equal(getUnresolvedShortLinkReviewItems(db).length, 1);
    const row = db.prepare('SELECT status FROM review_items WHERE id = ?').get(item.id);
    assert.equal(row.status, 'OPEN');
  } finally {
    close();
  }
});

test('pasting a resolved post URL reclassifies the link, flowing into dedup/attribution', async () => {
  const { db, close } = createTestDb();
  try {
    const member = db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Priya Sharma');
    db.prepare('INSERT INTO aliases (member_id, raw_value) VALUES (?, ?)').run(
      Number(member.lastInsertRowid),
      'Priya Sharma'
    );
    const item = await ingestUnresolvedShortLink(db);

    const ok = resolveShortLinkItem(db, item.id, 'https://www.linkedin.com/posts/priya-sharma_activity-1-abcd');
    assert.equal(ok, true);

    const dashboard = getDashboard(db);
    assert.equal(dashboard.posts.length, 1);
    assert.equal(dashboard.posts[0].url, 'https://www.linkedin.com/posts/priya-sharma_activity-1-abcd');
    assert.equal(dashboard.posts[0].pendingAttribution, false);

    assert.equal(getUnresolvedShortLinkReviewItems(db).length, 0);
    const row = db.prepare('SELECT status FROM review_items WHERE id = ?').get(item.id);
    assert.equal(row.status, 'RESOLVED');
  } finally {
    close();
  }
});

test('pasting a resolved non-post URL creates an OTHER_LINKEDIN review item instead', async () => {
  const { db, close } = createTestDb();
  try {
    const item = await ingestUnresolvedShortLink(db);

    const ok = resolveShortLinkItem(db, item.id, 'https://www.linkedin.com/in/priya-sharma');
    assert.equal(ok, true);

    assert.equal(getUnresolvedShortLinkReviewItems(db).length, 0);
    const otherItems = getOtherLinkedInReviewItems(db);
    assert.equal(otherItems.length, 1);
    assert.equal(otherItems[0].url, 'https://www.linkedin.com/in/priya-sharma');
  } finally {
    close();
  }
});

test('pasting a value that is not a usable LinkedIn URL is rejected and leaves the item open', async () => {
  const { db, close } = createTestDb();
  try {
    const item = await ingestUnresolvedShortLink(db);

    assert.equal(resolveShortLinkItem(db, item.id, 'not a url'), false);
    assert.equal(resolveShortLinkItem(db, item.id, 'https://lnkd.in/stillshort'), false);
    assert.equal(resolveShortLinkItem(db, item.id, 'https://example.com/foo'), false);

    assert.equal(getUnresolvedShortLinkReviewItems(db).length, 1);
    const row = db.prepare('SELECT status FROM review_items WHERE id = ?').get(item.id);
    assert.equal(row.status, 'OPEN');
  } finally {
    close();
  }
});

test('a resolved-to-post paste is reversible: undo removes the created sharing event and post, reopening the item', async () => {
  const { db, close } = createTestDb();
  try {
    const item = await ingestUnresolvedShortLink(db);
    resolveShortLinkItem(db, item.id, 'https://www.linkedin.com/posts/priya-sharma_activity-1-abcd');

    const ok = undoShortLinkAction(db, item.id);
    assert.equal(ok, true);

    const dashboard = getDashboard(db);
    assert.equal(dashboard.posts.length, 0);
    assert.equal(getUnresolvedShortLinkReviewItems(db).length, 1);
    const row = db.prepare('SELECT status FROM review_items WHERE id = ?').get(item.id);
    assert.equal(row.status, 'OPEN');
  } finally {
    close();
  }
});

test('a resolved-to-OTHER_LINKEDIN paste is reversible: undo removes the created OTHER_LINKEDIN item, reopening this one', async () => {
  const { db, close } = createTestDb();
  try {
    const item = await ingestUnresolvedShortLink(db);
    resolveShortLinkItem(db, item.id, 'https://www.linkedin.com/in/priya-sharma');

    const ok = undoShortLinkAction(db, item.id);
    assert.equal(ok, true);

    assert.equal(getOtherLinkedInReviewItems(db).length, 0);
    assert.equal(getUnresolvedShortLinkReviewItems(db).length, 1);
  } finally {
    close();
  }
});

test('acting on a non-open or wrong-kind id is a no-op, not an error', () => {
  const { db, close } = createTestDb();
  try {
    assert.equal(dismissShortLinkItem(db, 999), false);
    assert.equal(resolveShortLinkItem(db, 999, 'https://www.linkedin.com/posts/x_activity-1-abcd'), false);
    assert.equal(undoShortLinkAction(db, 999), false);
  } finally {
    close();
  }
});
