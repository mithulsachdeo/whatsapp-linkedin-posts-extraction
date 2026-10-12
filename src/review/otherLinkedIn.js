// OTHER_LINKEDIN review-queue actions (ticket #5): dismiss (confirm not-a-post)
// or promote-to-post (admin overrides the classifier). Both reversible, per
// the spec's review-workflow decision that every review action is reversible
// and re-runs dedup/attribution on affected records -- mirrors the shape of
// src/identity/aliases.js's match/undo pair.
import {
  upsertPost,
  resolveMember,
  ensureUnknownSenderReviewItem,
  insertSharingEvent,
  touchPostTimestamps,
} from '../ingest/ingest.js';
import { canonicalizeAnyLinkedInUrl } from '../ingest/linkedin.js';

function getOpenItem(db, id) {
  return db
    .prepare("SELECT * FROM review_items WHERE id = ? AND kind = 'OTHER_LINKEDIN' AND status = 'OPEN'")
    .get(id);
}

/**
 * Dismiss: confirms the classifier was right, this link is not a post.
 * Reversible via `undoOtherLinkedInAction`.
 */
export async function dismissOtherLinkedInItem(db, id) {
  const item = await getOpenItem(db, id);
  if (!item) return false;

  await db.prepare(
    `UPDATE review_items SET status = 'DISMISSED', resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?`
  ).run(id);
  return true;
}

/**
 * Promote: the admin disagrees with the classifier and treats this link as a
 * post after all. Reclassifies it into the normal dedup/attribution path --
 * upserts a Post on its canonical URL and inserts a sharing event using the
 * raw sender/timestamp/group captured at ingest time, exactly as if the
 * import had classified it as a POST originally. An unresolved sender still
 * produces an UNKNOWN_SENDER review item (pending attribution), same as
 * ingestion.
 * @returns {Promise<boolean>} whether an open OTHER_LINKEDIN item with this id existed
 */
export async function promoteOtherLinkedInItem(db, id) {
  const item = await getOpenItem(db, id);
  if (!item) return false;

  const payload = JSON.parse(item.payload);
  const canonicalUrl = canonicalizeAnyLinkedInUrl(payload.url) ?? payload.url;

  return db.transaction(async (tx) => {
    const { id: postId, isNew: postWasNew } = await upsertPost(tx, canonicalUrl);

    const memberId = await resolveMember(tx, payload.rawSender);
    if (memberId === null) {
      await ensureUnknownSenderReviewItem(tx, payload.rawSender);
    }

    const sharingEventInserted = await insertSharingEvent(tx, {
      postId,
      groupId: payload.groupId,
      rawSender: payload.rawSender,
      memberId,
      timestamp: payload.timestamp,
      note: payload.note,
    });
    if (sharingEventInserted) {
      await touchPostTimestamps(tx, postId, payload.timestamp);
    }

    await tx.prepare(
      `UPDATE review_items SET status = 'RESOLVED', resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), payload = ?
       WHERE id = ?`
    ).run(
      JSON.stringify({ ...payload, promotedPostId: postId, promotedPostWasNew: postWasNew, sharingEventInserted }),
      id
    );

    return true;
  });
}

/**
 * Reverses whichever action (`dismiss` or `promote`) is currently applied to
 * this OTHER_LINKEDIN item, reopening it. For a reversed promotion, removes
 * the sharing event it created and -- if the Post was newly created by that
 * promotion and now has no other sharing events -- the Post too, mirroring
 * `undoAliasMapping`'s member cleanup.
 * @returns {Promise<boolean>} whether a dismissed/resolved OTHER_LINKEDIN item with
 *   this id existed to undo
 */
export async function undoOtherLinkedInAction(db, id) {
  const item = await db
    .prepare(
      "SELECT * FROM review_items WHERE id = ? AND kind = 'OTHER_LINKEDIN' AND status IN ('DISMISSED', 'RESOLVED')"
    )
    .get(id);
  if (!item) return false;

  const payload = JSON.parse(item.payload);

  return db.transaction(async (tx) => {
    if (item.status === 'RESOLVED' && payload.promotedPostId) {
      const { promotedPostId, promotedPostWasNew, sharingEventInserted, ...originalPayload } = payload;

      if (sharingEventInserted) {
        await tx.prepare(
          `DELETE FROM sharing_events
           WHERE post_id = ? AND group_id = ? AND raw_sender = ? AND message_timestamp = ?`
        ).run(promotedPostId, originalPayload.groupId, originalPayload.rawSender, originalPayload.timestamp);
      }

      if (promotedPostWasNew) {
        await tx.prepare(
          'DELETE FROM posts WHERE id = ? AND NOT EXISTS (SELECT 1 FROM sharing_events WHERE post_id = ?)'
        ).run(promotedPostId, promotedPostId);
      }

      await tx.prepare(
        "UPDATE review_items SET status = 'OPEN', resolved_at = NULL, payload = ? WHERE id = ?"
      ).run(JSON.stringify(originalPayload), id);
    } else {
      await tx.prepare("UPDATE review_items SET status = 'OPEN', resolved_at = NULL WHERE id = ?").run(id);
    }

    return true;
  });
}
