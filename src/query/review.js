// Public query API for the review screen, mirroring the dashboard's query
// module: the HTTP layer renders through this and tests assert through it.

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {Promise<Array<{ id: number, rawSender: string, shareCount: number, firstSeen: string|null }>>}
 */
export async function getUnknownSenderReviewItems(db) {
  const rows = await db
    .prepare(
      `SELECT id, payload, created_at AS createdAt FROM review_items
       WHERE kind = 'UNKNOWN_SENDER' AND status = 'OPEN'
       ORDER BY created_at ASC`
    )
    .all();

  const items = [];
  for (const row of rows) {
    const rawSender = JSON.parse(row.payload).rawSender;
    const stats = await db
      .prepare(
        `SELECT COUNT(*) AS shareCount, MIN(message_timestamp) AS firstSeen
         FROM sharing_events WHERE raw_sender = ?`
      )
      .get(rawSender);
    items.push({
      id: row.id,
      rawSender,
      shareCount: stats.shareCount,
      firstSeen: stats.firstSeen ?? null,
    });
  }
  return items;
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {Promise<Array<{ id: number, url: string, rawSender: string, timestamp: string, note: string|null, createdAt: string }>>}
 */
export async function getOtherLinkedInReviewItems(db) {
  const rows = await db
    .prepare(
      `SELECT id, payload, created_at AS createdAt FROM review_items
       WHERE kind = 'OTHER_LINKEDIN' AND status = 'OPEN'
       ORDER BY created_at ASC`
    )
    .all();

  return rows.map((row) => {
    const payload = JSON.parse(row.payload);
    return {
      id: row.id,
      url: payload.url,
      rawSender: payload.rawSender,
      timestamp: payload.timestamp,
      note: payload.note ?? null,
      createdAt: row.createdAt,
    };
  });
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {Promise<Array<{ id: number, displayName: string }>>}
 */
export async function getMembers(db) {
  return await db
    .prepare('SELECT id, display_name AS displayName FROM members ORDER BY display_name COLLATE NOCASE')
    .all();
}
