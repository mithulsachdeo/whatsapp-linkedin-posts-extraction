// The ingestion service -- the spec's primary test seam. Exercises the
// whole pipeline (parse -> extract -> canonicalize -> dedup/idempotency ->
// identity matching -> review-queue routing) against a real DB, and is
// itself the thing the HTTP upload route calls after an IngestionAdapter
// has turned an upload into decoded text.
import { createHash } from 'node:crypto';
import { parseMessages } from './parseChat.js';
import { extractPostUrls, canonicalizeUrl } from './linkedin.js';

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} rawExportText decoded chat export text
 * @param {string} groupId admin-selected group for this upload (stored, not shown)
 * @param {{ filename?: string, contentHash?: string }} [options]
 * @returns {{
 *   importBatchId: number,
 *   messagesRead: number,
 *   linksFound: number,
 *   newPosts: number,
 *   alreadyOnBoard: number,
 *   newSharingEvents: number,
 *   duplicateFileWarning: boolean,
 *   pendingAttributionSenders: string[],
 * }}
 */
export function ingest(db, rawExportText, groupId, options = {}) {
  const contentHash = options.contentHash ?? createHash('sha256').update(rawExportText, 'utf8').digest('hex');

  const duplicateFileWarning = Boolean(
    db
      .prepare("SELECT 1 FROM import_batches WHERE content_hash = ? AND status = 'COMPLETE'")
      .get(contentHash)
  );

  const messages = parseMessages(rawExportText);

  let linksFound = 0;
  let newPosts = 0;
  let alreadyOnBoard = 0;
  let newSharingEvents = 0;
  const pendingAttributionSenders = new Set();

  db.exec('BEGIN');
  try {
    for (const message of messages) {
      const urls = extractPostUrls(message.text);
      for (const rawUrl of urls) {
        linksFound++;
        const canonicalUrl = canonicalizeUrl(rawUrl);
        if (!canonicalUrl) continue; // defensive; extractPostUrls already filtered

        const { id: postId, isNew } = upsertPost(db, canonicalUrl);
        if (isNew) newPosts++;
        else alreadyOnBoard++;

        const memberId = resolveMember(db, message.rawSender);
        if (memberId === null) {
          pendingAttributionSenders.add(message.rawSender);
          ensureUnknownSenderReviewItem(db, message.rawSender);
        }

        const note = message.text.trim() || null;
        const inserted = insertSharingEvent(db, {
          postId,
          groupId,
          rawSender: message.rawSender,
          memberId,
          timestamp: message.timestamp,
          note,
        });
        if (inserted) {
          newSharingEvents++;
          touchPostTimestamps(db, postId, message.timestamp);
        }
      }
    }

    const importBatchId = recordImportBatch(db, {
      groupId,
      filename: options.filename ?? null,
      contentHash,
      messagesRead: messages.length,
      linksFound,
    });

    db.exec('COMMIT');

    return {
      importBatchId,
      messagesRead: messages.length,
      linksFound,
      newPosts,
      alreadyOnBoard,
      newSharingEvents,
      duplicateFileWarning,
      pendingAttributionSenders: [...pendingAttributionSenders],
    };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function upsertPost(db, canonicalUrl) {
  const existing = db.prepare('SELECT id FROM posts WHERE canonical_url = ?').get(canonicalUrl);
  if (existing) return { id: existing.id, isNew: false };

  const result = db.prepare('INSERT INTO posts (canonical_url) VALUES (?)').run(canonicalUrl);
  return { id: Number(result.lastInsertRowid), isNew: true };
}

function resolveMember(db, rawSender) {
  const row = db.prepare('SELECT member_id FROM aliases WHERE raw_value = ?').get(rawSender);
  return row ? row.member_id : null;
}

// No fuzzy auto-merge (spec: "an unrecognized sender links to no member").
// One OPEN review item per unresolved raw sender string, not one per event.
function ensureUnknownSenderReviewItem(db, rawSender) {
  const existing = db
    .prepare(
      `SELECT id FROM review_items
       WHERE kind = 'UNKNOWN_SENDER' AND status = 'OPEN' AND json_extract(payload, '$.rawSender') = ?`
    )
    .get(rawSender);
  if (existing) return;

  db.prepare("INSERT INTO review_items (kind, payload) VALUES ('UNKNOWN_SENDER', ?)").run(
    JSON.stringify({ rawSender })
  );
}

// Natural key (group_id, message_timestamp, raw_sender, post_id) is a DB
// UNIQUE constraint; INSERT OR IGNORE makes re-importing the same or an
// overlapping export a zero-new-rows no-op.
function insertSharingEvent(db, { postId, groupId, rawSender, memberId, timestamp, note }) {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp, note)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(postId, groupId, rawSender, memberId, timestamp, note);
  return result.changes > 0;
}

function touchPostTimestamps(db, postId, timestamp) {
  db.prepare(
    `UPDATE posts SET
       first_shared_at = CASE WHEN first_shared_at IS NULL OR ? < first_shared_at THEN ? ELSE first_shared_at END,
       last_shared_at = CASE WHEN last_shared_at IS NULL OR ? > last_shared_at THEN ? ELSE last_shared_at END
     WHERE id = ?`
  ).run(timestamp, timestamp, timestamp, timestamp, postId);
}

function recordImportBatch(db, { groupId, filename, contentHash, messagesRead, linksFound }) {
  const result = db
    .prepare(
      `INSERT INTO import_batches (group_id, filename, content_hash, status, messages_read, links_found, completed_at)
       VALUES (?, ?, ?, 'COMPLETE', ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
    )
    .run(groupId, filename, contentHash, messagesRead, linksFound);
  return Number(result.lastInsertRowid);
}
