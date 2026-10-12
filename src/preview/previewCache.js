// Writes a PreviewFetcher's result onto a Post, or records that none could
// be fetched -- and the admin override that takes precedence forever after.
// An admin-edited preview (preview_edited = 1) is sticky: a later fetch,
// whether from this import or a future one, never overwrites it (spec: "an
// admin-edited preview ... survives re-imports").

/**
 * @param {import('../db/connection.js').Adapter} db
 * @param {number} postId
 * @param {{ author?: string|null, role?: string|null, excerpt?: string|null }} preview
 */
export async function cacheFetchedPreview(db, postId, preview) {
  await db.prepare(
    `UPDATE posts SET preview_author = ?, preview_role = ?, preview_excerpt = ?, preview_unavailable = 0
     WHERE id = ? AND preview_edited = 0`
  ).run(preview.author ?? null, preview.role ?? null, preview.excerpt ?? null, postId);
}

/**
 * @param {import('../db/connection.js').Adapter} db
 * @param {number} postId
 */
export async function markPreviewUnavailable(db, postId) {
  await db.prepare('UPDATE posts SET preview_unavailable = 1 WHERE id = ? AND preview_edited = 0').run(postId);
}

/**
 * Admin action (spec: "manually set/edit a post's preview ... overrides the
 * fetched value and is not overwritten by a later fetch").
 * @param {import('../db/connection.js').Adapter} db
 * @param {number} postId
 * @param {{ author?: string|null, role?: string|null, excerpt?: string|null }} preview
 */
export async function setPreviewOverride(db, postId, { author, role, excerpt }) {
  await db.prepare(
    `UPDATE posts SET preview_author = ?, preview_role = ?, preview_excerpt = ?, preview_unavailable = 0, preview_edited = 1
     WHERE id = ?`
  ).run(author ?? null, role ?? null, excerpt ?? null, postId);
}
