// lnkd.in short links (ticket #11): a short link is now a POST created
// synchronously at ingest -- URL-only until resolution succeeds -- exercised
// through ingest() and asserted via the public query API plus direct
// review_items/posts/sharing_events reads, mirroring previewFetch.test.js's
// pattern. Resolution is a best-effort async enhancer, after commit, one
// attempt per newly-created lnkd.in post; it never blocks ingest() and never
// falls back to a review item on failure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from '../helpers/testDb.js';
import { ingest } from '../../src/ingest/ingest.js';
import { getDashboard } from '../../src/query/dashboard.js';
import { getOtherLinkedInReviewItems } from '../../src/query/review.js';

const GROUP = 'group-a';
const SHORT_URL = 'https://lnkd.in/abc123';

test('a lnkd.in link creates a Post synchronously, URL-only, with no resolver configured', () => {
  const { db, close } = createTestDb();
  try {
    const text = `30/09/26, 10:15 - Priya Sharma: Worth a read ${SHORT_URL}`;
    const result = ingest(db, text, GROUP); // no shortLinkResolver supplied

    assert.equal(result.linksFound, 1);
    assert.equal(result.newPosts, 1);
    assert.equal(result.newSharingEvents, 1);

    const dashboard = getDashboard(db);
    assert.equal(dashboard.posts.length, 1);
    assert.equal(dashboard.posts[0].url, SHORT_URL);
    assert.equal(dashboard.posts[0].shareCount, 1);
    assert.equal(dashboard.posts[0].previewAuthor, null);
  } finally {
    close();
  }
});

test('re-importing the same export dedupes on the lnkd.in canonical URL', () => {
  const { db, close } = createTestDb();
  try {
    const text = `30/09/26, 10:15 - Priya Sharma: ${SHORT_URL}`;

    const first = ingest(db, text, GROUP);
    const second = ingest(db, text, GROUP);

    assert.equal(first.newPosts, 1);
    assert.equal(second.newPosts, 0);
    assert.equal(second.alreadyOnBoard, 1);

    const dashboard = getDashboard(db);
    assert.equal(dashboard.posts.length, 1);
    assert.equal(dashboard.posts[0].shareCount, 1); // byte-identical re-import: no new sharing event
  } finally {
    close();
  }
});

test('a short link that resolves to a post, where no post for that canonical exists yet, re-keys the interim post in place', async () => {
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

    const text = `30/09/26, 10:15 - Priya Sharma: ${SHORT_URL}`;
    const result = ingest(db, text, GROUP, { shortLinkResolver });

    const interimPostId = db.prepare('SELECT id FROM posts').get().id;
    await result.shortLinkResolutionsSettled;

    const dashboard = getDashboard(db);
    assert.equal(dashboard.posts.length, 1);
    assert.equal(dashboard.posts[0].id, interimPostId); // same row, re-keyed
    assert.equal(dashboard.posts[0].url, resolvedUrl);
    assert.equal(dashboard.posts[0].shareCount, 1);
    assert.equal(dashboard.posts[0].pendingAttribution, false);
  } finally {
    close();
  }
});

test('a short link that resolves to a post, where a post for that canonical already exists, merges the sharing events and deletes the interim post', async () => {
  const { db, close } = createTestDb();
  try {
    const resolvedUrl = 'https://www.linkedin.com/posts/priya-sharma_activity-1-abcd';
    const existingText = `29/09/26, 09:00 - Arjun Das: ${resolvedUrl}`;
    ingest(db, existingText, GROUP);
    const existingPostId = db.prepare('SELECT id FROM posts').get().id;

    const shortLinkResolver = { async resolve() { return resolvedUrl; } };
    const shortText = `30/09/26, 10:15 - Priya Sharma: ${SHORT_URL}`;
    const result = ingest(db, shortText, GROUP, { shortLinkResolver });
    const interimPostId = db.prepare("SELECT id FROM posts WHERE canonical_url = ?").get(SHORT_URL).id;

    await result.shortLinkResolutionsSettled;

    const dashboard = getDashboard(db);
    assert.equal(dashboard.posts.length, 1);
    assert.equal(dashboard.posts[0].id, existingPostId);
    assert.equal(dashboard.posts[0].url, resolvedUrl);
    assert.equal(dashboard.posts[0].shareCount, 2); // both events now on the one post

    const interim = db.prepare('SELECT * FROM posts WHERE id = ?').get(interimPostId);
    assert.equal(interim, undefined); // interim post removed
  } finally {
    close();
  }
});

test('merging moves sharing events but skips one that would collide with an existing event on the target post', async () => {
  const { db, close } = createTestDb();
  try {
    const resolvedUrl = 'https://www.linkedin.com/posts/priya-sharma_activity-1-abcd';
    // Same (group, timestamp, raw_sender) already shared the resolved URL directly.
    const existingText = `30/09/26, 10:15 - Priya Sharma: ${resolvedUrl}`;
    ingest(db, existingText, GROUP);

    const shortLinkResolver = { async resolve() { return resolvedUrl; } };
    const shortText = `30/09/26, 10:15 - Priya Sharma: ${SHORT_URL}`;
    const result = ingest(db, shortText, GROUP, { shortLinkResolver });
    await result.shortLinkResolutionsSettled;

    const dashboard = getDashboard(db);
    assert.equal(dashboard.posts.length, 1);
    assert.equal(dashboard.posts[0].shareCount, 1); // the colliding duplicate event was dropped, not doubled
  } finally {
    close();
  }
});

test('resolution runs the best-effort preview fetch on the resolved URL', async () => {
  const { db, close } = createTestDb();
  try {
    const resolvedUrl = 'https://www.linkedin.com/posts/priya-sharma_activity-1-abcd';
    const shortLinkResolver = { async resolve() { return resolvedUrl; } };
    let fetchedUrl = null;
    const previewFetcher = {
      async fetch(url) {
        fetchedUrl = url;
        return { author: 'Priya Sharma', role: null, excerpt: 'Worth a read.' };
      },
    };

    const text = `30/09/26, 10:15 - Priya Sharma: ${SHORT_URL}`;
    const result = ingest(db, text, GROUP, { shortLinkResolver, previewFetcher });
    await result.shortLinkResolutionsSettled;

    assert.equal(fetchedUrl, resolvedUrl);
    const dashboard = getDashboard(db);
    assert.equal(dashboard.posts[0].previewAuthor, 'Priya Sharma');
  } finally {
    close();
  }
});

test('a short link that resolves to a non-post LinkedIn URL is reclassified as OTHER_LINKEDIN and leaves the Posts tab', async () => {
  const { db, close } = createTestDb();
  try {
    const resolvedUrl = 'https://www.linkedin.com/in/priya-sharma';
    const shortLinkResolver = { async resolve() { return resolvedUrl; } };

    const text = `30/09/26, 10:15 - Priya Sharma: ${SHORT_URL}`;
    const result = ingest(db, text, GROUP, { shortLinkResolver });
    const interimPostId = db.prepare('SELECT id FROM posts').get().id;

    await result.shortLinkResolutionsSettled;

    const dashboard = getDashboard(db);
    assert.equal(dashboard.posts.length, 0);

    const otherItems = getOtherLinkedInReviewItems(db);
    assert.equal(otherItems.length, 1);
    assert.equal(otherItems[0].url, resolvedUrl);
    assert.equal(otherItems[0].rawSender, 'Priya Sharma');

    const interim = db.prepare('SELECT * FROM posts WHERE id = ?').get(interimPostId);
    assert.equal(interim, undefined);
  } finally {
    close();
  }
});

test('a resolver that fails to resolve (returns null) leaves the lnkd.in post shown, URL-only, on the board', async () => {
  const { db, close } = createTestDb();
  try {
    const shortLinkResolver = { async resolve() { return null; } };

    const text = `30/09/26, 10:15 - Priya Sharma: ${SHORT_URL}`;
    const result = ingest(db, text, GROUP, { shortLinkResolver });
    await result.shortLinkResolutionsSettled;

    const dashboard = getDashboard(db);
    assert.equal(dashboard.posts.length, 1);
    assert.equal(dashboard.posts[0].url, SHORT_URL);
    assert.equal(dashboard.posts[0].previewAuthor, null);

    // Priya Sharma has no alias in this test, so the sharing event itself
    // still produces an UNKNOWN_SENDER item exactly as ingest() always does --
    // that is unrelated to short-link resolution. What must never appear is
    // an OTHER_LINKEDIN (or any other) item caused by the failed resolve.
    const nonAttributionItems = db.prepare("SELECT * FROM review_items WHERE kind != 'UNKNOWN_SENDER'").all();
    assert.equal(nonAttributionItems.length, 0); // never falls to review
  } finally {
    close();
  }
});

test('a resolver that throws also leaves the lnkd.in post shown, URL-only, without failing ingestion', async () => {
  const { db, close } = createTestDb();
  try {
    const shortLinkResolver = { async resolve() { throw new Error('timed out'); } };

    const text = `30/09/26, 10:15 - Priya Sharma: ${SHORT_URL}`;
    const result = ingest(db, text, GROUP, { shortLinkResolver });
    assert.equal(result.newSharingEvents, 1); // ingest itself succeeds synchronously

    await result.shortLinkResolutionsSettled;

    const dashboard = getDashboard(db);
    assert.equal(dashboard.posts.length, 1);
    assert.equal(dashboard.posts[0].url, SHORT_URL);

    // Priya Sharma has no alias in this test, so the sharing event itself
    // still produces an UNKNOWN_SENDER item exactly as ingest() always does --
    // that is unrelated to short-link resolution.
    const nonAttributionItems = db.prepare("SELECT * FROM review_items WHERE kind != 'UNKNOWN_SENDER'").all();
    assert.equal(nonAttributionItems.length, 0);
  } finally {
    close();
  }
});

test('resolution is attempted only once per newly-created lnkd.in post, not again when the post already exists', async () => {
  const { db, close } = createTestDb();
  try {
    let calls = 0;
    const shortLinkResolver = {
      async resolve() {
        calls++;
        return null;
      },
    };

    const text = `30/09/26, 10:15 - Priya Sharma: ${SHORT_URL}`;
    const first = ingest(db, text, GROUP, { shortLinkResolver });
    await first.shortLinkResolutionsSettled;

    const second = ingest(db, text, GROUP, { shortLinkResolver }); // byte-identical re-import, no new post
    await second.shortLinkResolutionsSettled;

    assert.equal(calls, 1);
  } finally {
    close();
  }
});
