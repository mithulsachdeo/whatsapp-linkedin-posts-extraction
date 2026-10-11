// Public query API for the discovery dashboard. This is the seam the HTTP
// layer renders through *and* the seam tests assert through -- per the
// spec's testing decisions, tests exercise the ingestion service and read
// results back out here rather than poking at internal tables directly.

import { groupName } from '../ingest/groups.js';
import { istDayStartUtc, istDayEndUtc, utcToIstCalendarDate } from './istDateRange.js';

// Only one order is meaningful. Primary key: preview availability -- posts
// with a real preview to show (admin-edited or successfully fetched) rank
// above posts without one (fetch failed or not yet fetched), since a
// preview-less card is a much weaker discovery result regardless of age.
// Secondary key: most-recently-shared first, id as a stable tiebreak. A
// share-count sort was removed deliberately -- repeat shares are the author
// bumping their own link, not member endorsement, so counting them ranked
// self-promotion. A real "most valued" order returns only with v2 explicit
// upvotes/reactions.
const SORTS = {
  recent:
    '(CASE WHEN p.preview_author IS NOT NULL OR p.preview_excerpt IS NOT NULL THEN 0 ELSE 1 END) ASC, p.last_shared_at DESC, p.id DESC',
};

// Shared member/pending/search/view condition-building, used by both the
// main dashboard query and the date-range picker's bounds query. Deliberately
// never looks at options.from/options.to (that's buildDateRangeCondition,
// below) -- the bounds query calls only this one, which is precisely how the
// date filter excludes itself from its own bounds.
function buildFilterConditions(options) {
  const params = [];
  const conditions = [];

  if (options.memberId !== undefined) {
    conditions.push('EXISTS (SELECT 1 FROM sharing_events mse WHERE mse.post_id = p.id AND mse.member_id = ?)');
    params.push(options.memberId);
  }

  // Member-filter view option (spec: pending-attribution is itself a filter
  // choice, alongside filtering to a resolved member) -- posts with at least
  // one share from a sender not yet mapped to a member.
  if (options.pending) {
    conditions.push('EXISTS (SELECT 1 FROM sharing_events pse WHERE pse.post_id = p.id AND pse.member_id IS NULL)');
  }

  // Text search (spec): over the post URL/slug and any fetched preview text.
  if (options.search) {
    const like = `%${options.search}%`;
    conditions.push(
      '(p.canonical_url LIKE ? OR p.preview_author LIKE ? OR p.preview_role LIKE ? OR p.preview_excerpt LIKE ?)'
    );
    params.push(like, like, like, like);
  }

  // Per-device read/archive filter (spec): purely a per-browser view
  // preference layered on top of the shared query -- never changes global
  // counts/order/attribution, only which rows come back for this request.
  // readIds/view are derived from this device's cookie by the HTTP layer,
  // never from any shared table.
  const readIds = Array.isArray(options.readIds) ? options.readIds : [];
  const view = options.view === 'read' || options.view === 'all' ? options.view : 'unread';
  if (view === 'unread' && readIds.length > 0) {
    conditions.push(`p.id NOT IN (${readIds.map(() => '?').join(',')})`);
    params.push(...readIds);
  } else if (view === 'read') {
    // No read posts yet on this device -> always-false condition, cheaper
    // than special-casing an empty `IN (...)` list.
    conditions.push(readIds.length > 0 ? `p.id IN (${readIds.map(() => '?').join(',')})` : '0');
    params.push(...readIds);
  }

  return { conditions, params };
}

// Date-range filter (spec): a post matches if ANY of its sharing_events
// falls within [from, to], not just its first/last share -- hence a separate
// EXISTS rather than filtering the main p/se join. from/to are IST calendar
// days (see istDateRange.js); a malformed value is ignored rather than
// erroring, same as an unknown ?member value in buildFilterConditions above.
// Kept separate from buildFilterConditions so getDateRangeBounds can reuse
// the other filters while excluding this one from its own bounds.
function buildDateRangeCondition(options) {
  const fromUtc = options.from ? istDayStartUtc(options.from) : null;
  const toUtc = options.to ? istDayEndUtc(options.to) : null;
  if (!fromUtc && !toUtc) return null;

  const clauses = [];
  const params = [];
  if (fromUtc) {
    clauses.push('dse.message_timestamp >= ?');
    params.push(fromUtc);
  }
  if (toUtc) {
    clauses.push('dse.message_timestamp <= ?');
    params.push(toUtc);
  }
  return {
    condition: `EXISTS (SELECT 1 FROM sharing_events dse WHERE dse.post_id = p.id AND ${clauses.join(' AND ')})`,
    params,
  };
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{
 *   sort?: 'recent', memberId?: number, pending?: boolean, search?: string,
 *   view?: 'unread' | 'read' | 'all', readIds?: number[],
 *   from?: string, to?: string,
 * }} [options]
 * @returns {{ posts: Array<object>, lastUpdated: string | null }}
 */
export function getDashboard(db, options = {}) {
  const sort = SORTS[options.sort] ? options.sort : 'recent';
  const orderBy = SORTS[sort];

  const { conditions, params } = buildFilterConditions(options);

  const dateRange = buildDateRangeCondition(options);
  if (dateRange) {
    conditions.push(dateRange.condition);
    params.push(...dateRange.params);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

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
      ${whereClause}
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

/**
 * Enabled min/max bounds for the date-range picker (spec): MIN/MAX of
 * message_timestamp over the set filtered by member/search/view -- but NOT
 * by the date range itself (options.from/to are ignored here; otherwise the
 * bounds would shrink to whatever was just picked, which is circular).
 * Expressed as IST calendar dates for the <input type="date"> min/max
 * attributes. Null for both when the filtered set has zero posts.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ memberId?: number, pending?: boolean, search?: string, view?: 'unread'|'read'|'all', readIds?: number[] }} [options]
 * @returns {{ min: string | null, max: string | null }}
 */
export function getDateRangeBounds(db, options = {}) {
  const { conditions, params } = buildFilterConditions(options);
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const row = db
    .prepare(
      `
      SELECT MIN(se.message_timestamp) AS minTs, MAX(se.message_timestamp) AS maxTs
      FROM posts p
      JOIN sharing_events se ON se.post_id = p.id
      ${whereClause}
      `
    )
    .get(...params);

  return {
    min: utcToIstCalendarDate(row?.minTs ?? null),
    max: utcToIstCalendarDate(row?.maxTs ?? null),
  };
}

/**
 * Options for the discovery dashboard's filter-by-member control (sidebar on
 * wide viewports, a `<select>` on narrow ones, per the design). "Everyone"
 * is the implicit default (not included here); pending attribution is
 * surfaced as a filter choice alongside each resolved member, and omitted
 * entirely once no post has an unresolved sharer.
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {{ totalCount: number, pendingCount: number, members: Array<{ id: number, displayName: string, postCount: number }> }}
 */
export function getMemberFilterOptions(db) {
  const totalCount = db.prepare('SELECT COUNT(*) AS count FROM posts').get().count;
  const pendingCount = db
    .prepare('SELECT COUNT(DISTINCT se.post_id) AS count FROM sharing_events se WHERE se.member_id IS NULL')
    .get().count;
  const members = db
    .prepare(
      `SELECT m.id, m.display_name AS displayName, COUNT(DISTINCT se.post_id) AS postCount
       FROM members m
       JOIN sharing_events se ON se.member_id = m.id
       GROUP BY m.id
       ORDER BY postCount DESC, displayName COLLATE NOCASE ASC`
    )
    .all();

  return { totalCount, pendingCount, members };
}

/**
 * Full share history for the post-detail view (ticket #8): the cached
 * preview fields plus every sharing event, oldest first, each carrying its
 * sharer (resolved member display name, or null -> "Pending attribution"
 * in the view), timestamp, group (admin-only per the group-hidden rule --
 * the query always returns it, the view decides whether to render it), and
 * optional note. The earliest event is flagged `isFirstShare`.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {number} postId
 * @returns {{
 *   id: number, url: string,
 *   previewAuthor: string|null, previewRole: string|null, previewExcerpt: string|null, previewUnavailable: boolean,
 *   firstSharedAt: string|null, lastSharedAt: string|null,
 *   shareCount: number, distinctSharerCount: number, pendingAttribution: boolean,
 *   shares: Array<{ id: number, displayName: string|null, rawSender: string, groupId: string, groupName: string, timestamp: string, note: string|null, isFirstShare: boolean }>
 * } | null}
 */
export function getPostDetail(db, postId) {
  const post = db
    .prepare(
      `SELECT
        p.id,
        p.canonical_url AS url,
        p.preview_author AS previewAuthor,
        p.preview_role AS previewRole,
        p.preview_excerpt AS previewExcerpt,
        p.preview_unavailable AS previewUnavailable,
        p.first_shared_at AS firstSharedAt,
        p.last_shared_at AS lastSharedAt
      FROM posts p
      WHERE p.id = ?`
    )
    .get(postId);

  if (!post) return null;

  const shareRows = db
    .prepare(
      `SELECT
        se.id,
        se.raw_sender AS rawSender,
        se.member_id AS memberId,
        m.display_name AS displayName,
        se.group_id AS groupId,
        se.message_timestamp AS timestamp,
        se.note
      FROM sharing_events se
      LEFT JOIN members m ON m.id = se.member_id
      WHERE se.post_id = ?
      ORDER BY se.message_timestamp ASC, se.id ASC`
    )
    .all(postId);

  const shares = shareRows.map((row, index) => ({
    id: row.id,
    displayName: row.displayName ?? null,
    rawSender: row.rawSender,
    groupId: row.groupId,
    groupName: groupName(row.groupId),
    timestamp: row.timestamp,
    note: row.note ?? null,
    isFirstShare: index === 0,
  }));

  const distinctSharerCount = new Set(
    shareRows.map((row) => (row.memberId ? `m:${row.memberId}` : `r:${row.rawSender}`))
  ).size;

  return {
    id: post.id,
    url: post.url,
    previewAuthor: post.previewAuthor,
    previewRole: post.previewRole,
    previewExcerpt: post.previewExcerpt,
    previewUnavailable: Boolean(post.previewUnavailable),
    firstSharedAt: post.firstSharedAt,
    lastSharedAt: post.lastSharedAt,
    shareCount: shares.length,
    distinctSharerCount,
    pendingAttribution: shareRows.some((row) => row.memberId === null),
    shares,
  };
}

/**
 * The canonical URL for a single post, by id -- the only thing the `/out`
 * redirect route needs. Deliberately not reusing getPostDetail: that pulls
 * the full share history, which the redirect has no use for, and this needs
 * to stay cheap since it's on the hot path of every outbound click.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {number} postId
 * @returns {string | null}
 */
export function getPostUrl(db, postId) {
  const row = db.prepare('SELECT canonical_url AS url FROM posts WHERE id = ?').get(postId);
  return row?.url ?? null;
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
