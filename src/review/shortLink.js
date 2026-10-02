// UNRESOLVED_SHORT_LINK review-queue actions (ticket #6): paste the resolved
// URL (re-runs the classify/canonicalize/dedup pipeline on it) or dismiss.
// Both reversible, per the spec's review-workflow decision -- mirrors the
// shape of src/review/otherLinkedIn.js's dismiss/promote/undo trio, reusing
// ingest()'s own primitives rather than duplicating them.
import { applyResolvedShortLink } from '../ingest/ingest.js';
import { classifyLinkedInUrl } from '../ingest/linkedin.js';

function getOpenItem(db, id) {
  return db
    .prepare("SELECT * FROM review_items WHERE id = ? AND kind = 'UNRESOLVED_SHORT_LINK' AND status = 'OPEN'")
    .get(id);
}

/**
 * Dismiss: gives up on recovering this short link. Reversible via
 * `undoShortLinkAction`.
 */
export function dismissShortLinkItem(db, id) {
  const item = getOpenItem(db, id);
  if (!item) return false;

  db.prepare(
    `UPDATE review_items SET status = 'DISMISSED', resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?`
  ).run(id);
  return true;
}

/**
 * Paste the real URL the short link pointed to: re-runs it through exactly
 * the classify/canonicalize/dedup path a directly-shared URL would take
 * (`applyResolvedShortLink`, the same helper ingest()'s own resolve pass
 * uses). A pasted value that is not a usable linkedin.com URL (not a
 * LinkedIn URL at all, or itself another short link) is rejected -- the item
 * stays OPEN so the admin can correct it.
 * @returns {boolean} whether the paste was accepted and applied
 */
export function resolveShortLinkItem(db, id, pastedUrl) {
  const item = getOpenItem(db, id);
  if (!item) return false;

  const trimmed = pastedUrl?.trim();
  const kind = trimmed ? classifyLinkedInUrl(trimmed) : null;
  if (kind !== 'POST' && kind !== 'OTHER_LINKEDIN') return false;

  const payload = JSON.parse(item.payload);
  const target = { rawUrl: payload.url, rawSender: payload.rawSender, timestamp: payload.timestamp, groupId: payload.groupId, note: payload.note };

  const outcome = applyResolvedShortLink(db, target, trimmed);

  db.prepare(
    `UPDATE review_items SET status = 'RESOLVED', resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), payload = ?
     WHERE id = ?`
  ).run(JSON.stringify({ ...payload, resolvedUrl: trimmed, outcome }), id);

  return true;
}

/**
 * Reverses whichever action (`dismiss` or a resolved paste) is currently
 * applied to this item, reopening it. For a paste that landed on POST,
 * removes the sharing event it created and -- if the Post was newly created
 * by that paste and now has no other sharing events -- the Post too,
 * mirroring `undoOtherLinkedInAction`'s cleanup. For a paste that landed on
 * OTHER_LINKEDIN, removes the OTHER_LINKEDIN item it created (if still OPEN
 * and untouched).
 * @returns {boolean} whether a dismissed/resolved item with this id existed
 */
export function undoShortLinkAction(db, id) {
  const item = db
    .prepare(
      "SELECT * FROM review_items WHERE id = ? AND kind = 'UNRESOLVED_SHORT_LINK' AND status IN ('DISMISSED', 'RESOLVED')"
    )
    .get(id);
  if (!item) return false;

  const payload = JSON.parse(item.payload);

  if (item.status === 'RESOLVED' && payload.outcome) {
    const { resolvedUrl, outcome, ...originalPayload } = payload;

    if (outcome.kind === 'POST') {
      if (outcome.sharingEventInserted) {
        db.prepare(
          `DELETE FROM sharing_events
           WHERE post_id = ? AND group_id = ? AND raw_sender = ? AND message_timestamp = ?`
        ).run(outcome.postId, originalPayload.groupId, originalPayload.rawSender, originalPayload.timestamp);
      }
      if (outcome.postWasNew) {
        db.prepare(
          'DELETE FROM posts WHERE id = ? AND NOT EXISTS (SELECT 1 FROM sharing_events WHERE post_id = ?)'
        ).run(outcome.postId, outcome.postId);
      }
    } else if (outcome.kind === 'OTHER_LINKEDIN') {
      db.prepare(
        `DELETE FROM review_items
         WHERE kind = 'OTHER_LINKEDIN' AND status = 'OPEN'
           AND json_extract(payload, '$.url') = ?
           AND json_extract(payload, '$.rawSender') = ?
           AND json_extract(payload, '$.timestamp') = ?
           AND json_extract(payload, '$.groupId') = ?`
      ).run(resolvedUrl, originalPayload.rawSender, originalPayload.timestamp, originalPayload.groupId);
    }

    db.prepare("UPDATE review_items SET status = 'OPEN', resolved_at = NULL, payload = ? WHERE id = ?").run(
      JSON.stringify(originalPayload),
      id
    );
  } else {
    db.prepare("UPDATE review_items SET status = 'OPEN', resolved_at = NULL WHERE id = ?").run(id);
  }

  return true;
}
