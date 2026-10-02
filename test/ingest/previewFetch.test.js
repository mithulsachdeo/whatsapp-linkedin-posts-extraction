// Preview fetching (ticket #3). Primary seam per the spec's testing
// decision: PreviewFetcher is stubbed at its boundary so the suite stays
// deterministic and offline, exercised through ingest() and asserted via
// the public query API (plus a direct table read for the preview_edited
// admin-override guard, same pattern as the review-queue table reads in
// ingest.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from '../helpers/testDb.js';
import { ingest } from '../../src/ingest/ingest.js';
import { getDashboard } from '../../src/query/dashboard.js';
import { cacheFetchedPreview, setPreviewOverride } from '../../src/preview/previewCache.js';

const GROUP = 'group-a';
const URL = 'https://www.linkedin.com/posts/priya-sharma_activity-1-abcd';
const TEXT = `30/09/26, 10:15 - Priya Sharma: ${URL}`;

test('a successful preview fetch is cached on the new post', async () => {
  const { db, close } = createTestDb();
  try {
    let calls = 0;
    const previewFetcher = {
      async fetch(url) {
        calls++;
        assert.equal(url, URL);
        return { author: 'Priya Sharma', role: 'Product @ Acme', excerpt: 'Worth a read.' };
      },
    };

    const result = ingest(db, TEXT, GROUP, { previewFetcher });
    await result.previewFetchesSettled;

    assert.equal(calls, 1);
    const dashboard = getDashboard(db);
    assert.equal(dashboard.posts[0].previewAuthor, 'Priya Sharma');
    assert.equal(dashboard.posts[0].previewRole, 'Product @ Acme');
    assert.equal(dashboard.posts[0].previewExcerpt, 'Worth a read.');
    assert.equal(dashboard.posts[0].previewUnavailable, false);
  } finally {
    close();
  }
});

test('a failed preview fetch marks the post preview_unavailable without failing ingestion', async () => {
  const { db, close } = createTestDb();
  try {
    const previewFetcher = {
      async fetch() {
        throw new Error('blocked by LinkedIn');
      },
    };

    const result = ingest(db, TEXT, GROUP, { previewFetcher });
    // Ingestion itself must succeed regardless of the fetch outcome.
    assert.equal(result.newSharingEvents, 1);
    assert.equal(result.newPosts, 1);

    await result.previewFetchesSettled;

    const dashboard = getDashboard(db);
    assert.equal(dashboard.posts[0].previewUnavailable, true);
    assert.equal(dashboard.posts[0].previewAuthor, null);
  } finally {
    close();
  }
});

test('the preview fetcher is called once per new post, not again when the post already exists', async () => {
  const { db, close } = createTestDb();
  try {
    let calls = 0;
    const previewFetcher = {
      async fetch() {
        calls++;
        return { author: 'Priya Sharma' };
      },
    };

    const first = ingest(db, TEXT, GROUP, { previewFetcher });
    await first.previewFetchesSettled;

    const second = ingest(db, TEXT, GROUP, { previewFetcher }); // byte-identical re-import, no new post
    await second.previewFetchesSettled;

    assert.equal(calls, 1);
  } finally {
    close();
  }
});

test('ingest defaults to a safe, no-network preview fetcher that marks preview_unavailable', async () => {
  const { db, close } = createTestDb();
  try {
    const result = ingest(db, TEXT, GROUP); // no previewFetcher supplied
    await result.previewFetchesSettled;

    const dashboard = getDashboard(db);
    assert.equal(dashboard.posts[0].previewUnavailable, true);
  } finally {
    close();
  }
});

test('an admin-edited preview overrides the fetched value and survives a later re-import', async () => {
  const { db, close } = createTestDb();
  try {
    const autoFetcher = {
      async fetch() {
        return { author: 'Auto Author', role: null, excerpt: 'Auto excerpt' };
      },
    };
    const first = ingest(db, TEXT, GROUP, { previewFetcher: autoFetcher });
    await first.previewFetchesSettled;

    const post = db.prepare('SELECT id FROM posts').get();
    setPreviewOverride(db, post.id, { author: 'Admin Author', role: 'Admin Role', excerpt: 'Admin excerpt' });

    // Re-importing the same export is a no-op for an existing post (no new
    // fetch is triggered), which is itself how the override survives.
    const again = ingest(db, TEXT, GROUP, { previewFetcher: autoFetcher });
    await again.previewFetchesSettled;

    const dashboard = getDashboard(db);
    assert.equal(dashboard.posts[0].previewAuthor, 'Admin Author');
    assert.equal(dashboard.posts[0].previewRole, 'Admin Role');
    assert.equal(dashboard.posts[0].previewExcerpt, 'Admin excerpt');
    assert.equal(dashboard.posts[0].previewUnavailable, false);
  } finally {
    close();
  }
});

test('cacheFetchedPreview never overwrites an admin-edited preview, even if invoked directly', () => {
  const { db, close } = createTestDb();
  try {
    const inserted = db.prepare('INSERT INTO posts (canonical_url) VALUES (?)').run(URL);
    const postId = Number(inserted.lastInsertRowid);
    setPreviewOverride(db, postId, { author: 'Admin Author', role: null, excerpt: null });

    cacheFetchedPreview(db, postId, { author: 'Fetched Author', role: 'Fetched role', excerpt: 'Fetched excerpt' });

    const row = db.prepare('SELECT preview_author, preview_role FROM posts WHERE id = ?').get(postId);
    assert.equal(row.preview_author, 'Admin Author');
    assert.equal(row.preview_role, null);
  } finally {
    close();
  }
});
