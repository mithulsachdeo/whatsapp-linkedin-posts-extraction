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
        COUNT(DISTINCT COALESCE('m:' || se.member_id, 'r:' || se.raw_sender)) AS distinctSharerCount,
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

  const sharersByPost = getSharersByPost(db, rows.map((row) => row.id));

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
      distinctSharerCount: row.distinctSharerCount,
      pendingAttribution: row.pendingShareCount > 0,
      // Member display name AND the raw sender/phone, per spec -- acceptable
      // while the deployment is internal-for-now. Deduplicated by the pair so
      // a member who shared the same post from the same raw sender string
      // more than once is listed once.
      sharers: sharersByPost.get(row.id) ?? [],
    })),
    lastUpdated: lastUpdatedRow?.lastUpdated ?? null,
  };
}

function getSharersByPost(db, postIds) {
  const byPost = new Map();
  if (postIds.length === 0) return byPost;

  const placeholders = postIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT DISTINCT se.post_id AS postId, se.raw_sender AS rawSender, m.display_name AS displayName
       FROM sharing_events se
       LEFT JOIN members m ON m.id = se.member_id
       WHERE se.post_id IN (${placeholders})`
    )
    .all(...postIds);

  for (const row of rows) {
    if (!byPost.has(row.postId)) byPost.set(row.postId, []);
    byPost.get(row.postId).push({ displayName: row.displayName ?? null, rawSender: row.rawSender });
  }
  return byPost;
}
