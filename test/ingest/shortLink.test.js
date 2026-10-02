// lnkd.in short-link resolution (ticket #6). Primary seam per the spec's
// testing decision: ShortLinkResolver is stubbed at its boundary, exercised
// through ingest() and asserted via the public query API plus direct
// review_items reads, mirroring previewFetch.test.js's pattern. Resolution is
// best-effort and non-blocking (spec): ingest() itself returns synchronously;
// `shortLinkResolutionsSettled` lets tests await deterministic completion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from '../helpers/testDb.js';
import { ingest } from '../../src/ingest/ingest.js';
import { getDashboard } from '../../src/query/dashboard.js';
import { getOtherLinkedInReviewItems, getUnresolvedShortLinkReviewItems } from '../../src/query/review.js';

const GROUP = 'group-a';
const SHORT_URL = 'https://lnkd.in/abc123';

test('a short link that resolves to a post is reclassified into the normal dedup/attribution path', async () => {
  const { db, close } = createTestDb();
  try {
    const member = db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Priya Sharma');
    db.prepare('INSERT INTO aliases (member_id, raw_value) VALUES (?, ?)').run(
      Number(member.lastInsertRowid),
      'Priya Sharma'
    );

    const resolvedUrl = 'https://www.linkedin.com/posts/priya-sharma_activity-1-abcd';
    const shortLinkResolver = {
      async resolve(url) {
        assert.equal(url, SHORT_URL);
        return resolvedUrl;
      },
    };

    const text = `30/09/26, 10:15 - Priya Sharma: Worth a read ${SHORT_URL}`;
    const result = ingest(db, text, GROUP, { shortLinkResolver });

    assert.equal(result.linksFound, 1);
    // Not yet known synchronously -- resolution is non-blocking.
    assert.equal(result.newPosts, 0);

    await result.shortLinkResolutionsSettled;

    const dashboard = getDashboard(db);
    assert.equal(dashboard.posts.length, 1);
    assert.equal(dashboard.posts[0].url, resolvedUrl);
    assert.equal(dashboard.posts[0].shareCount, 1);
    assert.equal(dashboard.posts[0].pendingAttribution, false);
    assert.equal(getUnresolvedShortLinkReviewItems(db).length, 0);
  } finally {
    close();
  }
});

test('a short link that resolves to a non-post LinkedIn URL is reclassified as OTHER_LINKEDIN', async () => {
  const { db, close } = createTestDb();
  try {
    const resolvedUrl = 'https://www.linkedin.com/in/priya-sharma';
    const shortLinkResolver = { async resolve() { return resolvedUrl; } };

    const text = `30/09/26, 10:15 - Priya Sharma: ${SHORT_URL}`;
    const result = ingest(db, text, GROUP, { shortLinkResolver });
    await result.shortLinkResolutionsSettled;

    const dashboard = getDashboard(db);
    assert.equal(dashboard.posts.length, 0);

    const otherItems = getOtherLinkedInReviewItems(db);
    assert.equal(otherItems.length, 1);
    assert.equal(otherItems[0].url, resolvedUrl);
    assert.equal(otherItems[0].rawSender, 'Priya Sharma');
    assert.equal(getUnresolvedShortLinkReviewItems(db).length, 0);
  } finally {
    close();
  }
});

test('a short link that fails to resolve creates an UNRESOLVED_SHORT_LINK review item', async () => {
  const { db, close } = createTestDb();
  try {
    const shortLinkResolver = { async resolve() { return null; } };

    const text = `30/09/26, 10:15 - Priya Sharma: ${SHORT_URL}`;
    const result = ingest(db, text, GROUP, { shortLinkResolver });
    await result.shortLinkResolutionsSettled;

    const dashboard = getDashboard(db);
    assert.equal(dashboard.posts.length, 0);

    const items = getUnresolvedShortLinkReviewItems(db);
    assert.equal(items.length, 1);
    assert.equal(items[0].url, SHORT_URL);
    assert.equal(items[0].rawSender, 'Priya Sharma');
  } finally {
    close();
  }
});

test('a resolver that throws also creates an UNRESOLVED_SHORT_LINK review item, without failing ingestion', async () => {
  const { db, close } = createTestDb();
  try {
    const shortLinkResolver = { async resolve() { throw new Error('timed out'); } };

    const text = `30/09/26, 10:15 - Priya Sharma: ${SHORT_URL}`;
    const result = ingest(db, text, GROUP, { shortLinkResolver });
    assert.equal(result.newSharingEvents, 0); // resolution is non-blocking; ingest itself still succeeds

    await result.shortLinkResolutionsSettled;

    assert.equal(getUnresolvedShortLinkReviewItems(db).length, 1);
  } finally {
    close();
  }
});

test('ingest defaults to a safe, no-network resolver that falls every short link to review', async () => {
  const { db, close } = createTestDb();
  try {
    const text = `30/09/26, 10:15 - Priya Sharma: ${SHORT_URL}`;
    const result = ingest(db, text, GROUP); // no shortLinkResolver supplied

    await result.shortLinkResolutionsSettled;

    assert.equal(getUnresolvedShortLinkReviewItems(db).length, 1);
  } finally {
    close();
  }
});

test('re-importing the same export produces no duplicate UNRESOLVED_SHORT_LINK review items', async () => {
  const { db, close } = createTestDb();
  try {
    const shortLinkResolver = { async resolve() { return null; } };
    const text = `30/09/26, 10:15 - Priya Sharma: ${SHORT_URL}`;

    const first = ingest(db, text, GROUP, { shortLinkResolver });
    await first.shortLinkResolutionsSettled;
    const second = ingest(db, text, GROUP, { shortLinkResolver });
    await second.shortLinkResolutionsSettled;

    assert.equal(getUnresolvedShortLinkReviewItems(db).length, 1);
  } finally {
    close();
  }
});
