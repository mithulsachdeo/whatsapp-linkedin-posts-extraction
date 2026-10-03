// One-time backfill (ticket #11): the UNRESOLVED_SHORT_LINK review queue is
// removed, but existing installs may already have items sitting in it from
// before this change. Each one captured everything ingest() would have
// needed to create a normal Post + sharing event at the time (rawUrl via its
// `url` field, rawSender, timestamp, groupId, note) -- this routine runs
// that data through the same upsert/attribution primitives ingest() itself
// uses, then removes the review item. Safe to call more than once: once an
// item's post+event exist, the item is gone, so a repeat run finds nothing
// left to do. Invoked once, guarded by migrate()'s own ledger (see
// src/db/migrate.js), rather than written as a plain .sql migration -- the
// per-row canonicalize/dedup/attribution logic isn't expressible in portable
// SQL, and reusing ingest.js's own exported helpers is less risky than
// re-deriving it.
import { canonicalizeShortLinkUrl } from '../ingest/linkedin.js';
import {
  upsertPost,
  resolveMember,
  ensureUnknownSenderReviewItem,
  insertSharingEvent,
  touchPostTimestamps,
} from '../ingest/ingest.js';

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {number} count of UNRESOLVED_SHORT_LINK items converted
 */
export function backfillUnresolvedShortLinks(db) {
  const items = db.prepare("SELECT id, payload FROM review_items WHERE kind = 'UNRESOLVED_SHORT_LINK'").all();

  for (const item of items) {
    const payload = JSON.parse(item.payload);
    const canonicalUrl = canonicalizeShortLinkUrl(payload.url) ?? payload.url;

    db.exec('BEGIN');
    try {
      const { id: postId } = upsertPost(db, canonicalUrl);

      const memberId = resolveMember(db, payload.rawSender);
      if (memberId === null) {
        ensureUnknownSenderReviewItem(db, payload.rawSender);
      }

      const inserted = insertSharingEvent(db, {
        postId,
        groupId: payload.groupId,
        rawSender: payload.rawSender,
        memberId,
        timestamp: payload.timestamp,
        note: payload.note ?? null,
      });
      if (inserted) touchPostTimestamps(db, postId, payload.timestamp);

      db.prepare('DELETE FROM review_items WHERE id = ?').run(item.id);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  return items.length;
}
