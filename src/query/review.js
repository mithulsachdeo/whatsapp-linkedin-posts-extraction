// Public query API for the review screen, mirroring the dashboard's query
// module: the HTTP layer renders through this and tests assert through it.

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {Array<{ id: number, rawSender: string, shareCount: number, firstSeen: string|null }>}
 */
export function getUnknownSenderReviewItems(db) {
  const rows = db
    .prepare(
      `SELECT id, payload, created_at AS createdAt FROM review_items
       WHERE kind = 'UNKNOWN_SENDER' AND status = 'OPEN'
       ORDER BY created_at ASC`
    )
    .all();

  return rows.map((row) => {
    const rawSender = JSON.parse(row.payload).rawSender;
    const stats = db
      .prepare(
        `SELECT COUNT(*) AS shareCount, MIN(message_timestamp) AS firstSeen
         FROM sharing_events WHERE raw_sender = ?`
      )
      .get(rawSender);
    return {
      id: row.id,
      rawSender,
      shareCount: stats.shareCount,
      firstSeen: stats.firstSeen ?? null,
    };
  });
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {Array<{ id: number, displayName: string }>}
 */
export function getMembers(db) {
  return db
    .prepare('SELECT id, display_name AS displayName FROM members ORDER BY display_name COLLATE NOCASE')
    .all();
}
