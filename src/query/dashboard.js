// Public query API for the discovery dashboard. This is the seam the HTTP
// layer renders through *and* the seam tests assert through -- per the
// spec's testing decisions, tests exercise the ingestion service and read
// results back out here rather than poking at internal tables directly.

const SORTS = {
  recent: 'last_shared_at DESC',
  most_shared: 'share_count DESC, last_shared_at DESC',
};

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ sort?: 'recent' | 'most_shared', memberId?: number }} [options]
 * @returns {{ posts: Array<object>, lastUpdated: string | null }}
 */
export function getDashboard(db, options = {}) {
  const sort = SORTS[options.sort] ? options.sort : 'recent';
  const orderBy = SORTS[sort];

  const params = [];
  let memberFilter = '';
  if (options.memberId !== undefined) {
    memberFilter = 'WHERE EXISTS (SELECT 1 FROM sharing_events mse WHERE mse.post_id = p.id AND mse.member_id = ?)';
    params.push(options.memberId);
  }

  const rows = db
    .prepare(
      `
      SELECT
        p.id,
        p.canonical_url AS url,
        p.preview_author AS previewAuthor,
        p.preview_role AS previewRole,
        p.preview_excerpt AS previewExcerpt,
        p.preview_unavailable AS previewUnavailable,
        p.first_shared_at AS firstSharedAt,
        p.last_shared_at AS lastSharedAt,
        COUNT(se.id) AS shareCount,
        SUM(CASE WHEN se.member_id IS NULL THEN 1 ELSE 0 END) AS pendingShareCount
      FROM posts p
      JOIN sharing_events se ON se.post_id = p.id
      ${memberFilter}
      GROUP BY p.id
      ORDER BY ${orderBy}
      `
    )
    .all(...params);

  const lastUpdatedRow = db
    .prepare("SELECT MAX(completed_at) AS lastUpdated FROM import_batches WHERE status = 'COMPLETE'")
    .get();

  return {
    posts: rows.map((row) => ({
      id: row.id,
      url: row.url,
      previewAuthor: row.previewAuthor,
      previewRole: row.previewRole,
      previewExcerpt: row.previewExcerpt,
      previewUnavailable: Boolean(row.previewUnavailable),
      firstSharedAt: row.firstSharedAt,
      lastSharedAt: row.lastSharedAt,
      shareCount: row.shareCount,
      pendingAttribution: row.pendingShareCount > 0,
    })),
    lastUpdated: lastUpdatedRow?.lastUpdated ?? null,
  };
}
