// Preview-cache writes against a real temporary SQLite DB: the normal
// fetched-preview write path (cacheFetchedPreview/markPreviewUnavailable,
// both of which back off once an admin override is sticky) and the admin
// override itself (setPreviewOverride), which always wins and always sets
// preview_edited = 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from '../helpers/testDb.js';
import { cacheFetchedPreview, markPreviewUnavailable, setPreviewOverride } from '../../src/preview/previewCache.js';

async function seedPost(db, url = 'https://www.linkedin.com/posts/someone_activity-1-abcd') {
  const result = await db.prepare('INSERT INTO posts (canonical_url) VALUES (?)').run(url);
  return Number(result.lastInsertRowid);
}

test('cacheFetchedPreview writes the fetched fields and clears preview_unavailable', async () => {
  const { db, close } = await createTestDb();
  try {
    const postId = await seedPost(db);

    await cacheFetchedPreview(db, postId, { author: 'Priya Sharma', role: 'PM', excerpt: 'Shipped a thing.' });

    const post = await db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
    assert.equal(post.preview_author, 'Priya Sharma');
    assert.equal(post.preview_role, 'PM');
    assert.equal(post.preview_excerpt, 'Shipped a thing.');
    assert.equal(post.preview_unavailable, 0);
  } finally {
    await close();
  }
});

test('cacheFetchedPreview never overwrites an admin-edited preview', async () => {
  const { db, close } = await createTestDb();
  try {
    const postId = await seedPost(db);
    await setPreviewOverride(db, postId, { author: 'Admin Author', role: 'Admin Role', excerpt: 'Admin excerpt.' });

    await cacheFetchedPreview(db, postId, { author: 'Fetched Author', role: 'Fetched Role', excerpt: 'Fetched.' });

    const post = await db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
    assert.equal(post.preview_author, 'Admin Author');
    assert.equal(post.preview_role, 'Admin Role');
    assert.equal(post.preview_excerpt, 'Admin excerpt.');
  } finally {
    await close();
  }
});

test('markPreviewUnavailable sets the flag, but not over an admin-edited preview', async () => {
  const { db, close } = await createTestDb();
  try {
    const fetchable = await seedPost(db, 'https://www.linkedin.com/posts/a_activity-1-aaaa');
    await markPreviewUnavailable(db, fetchable);
    assert.equal((await db.prepare('SELECT preview_unavailable FROM posts WHERE id = ?').get(fetchable)).preview_unavailable, 1);

    const edited = await seedPost(db, 'https://www.linkedin.com/posts/b_activity-2-bbbb');
    await setPreviewOverride(db, edited, { author: 'Admin Author', role: null, excerpt: null });
    await markPreviewUnavailable(db, edited);
    assert.equal((await db.prepare('SELECT preview_unavailable FROM posts WHERE id = ?').get(edited)).preview_unavailable, 0);
  } finally {
    await close();
  }
});

test('setPreviewOverride always wins and marks the preview as admin-edited', async () => {
  const { db, close } = await createTestDb();
  try {
    const postId = await seedPost(db);
    await cacheFetchedPreview(db, postId, { author: 'Fetched Author', role: 'Fetched Role', excerpt: 'Fetched.' });

    await setPreviewOverride(db, postId, { author: 'Admin Author', role: 'Admin Role', excerpt: 'Admin excerpt.' });

    const post = await db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
    assert.equal(post.preview_author, 'Admin Author');
    assert.equal(post.preview_role, 'Admin Role');
    assert.equal(post.preview_excerpt, 'Admin excerpt.');
    assert.equal(post.preview_edited, 1);
    assert.equal(post.preview_unavailable, 0);
  } finally {
    await close();
  }
});
