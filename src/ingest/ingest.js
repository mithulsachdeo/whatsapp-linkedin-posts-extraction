// The ingestion service -- the spec's primary test seam. Exercises the
// whole pipeline (parse -> extract -> canonicalize -> dedup/idempotency ->
// identity matching -> review-queue routing) against a real DB, and is
// itself the thing the HTTP upload route calls after an IngestionAdapter
// has turned an upload into decoded text.
import { createHash } from 'node:crypto';
import { parseMessages } from './parseChat.js';
import {
  extractLinkedInUrls,
  classifyLinkedInUrl,
  canonicalizeUrl,
  canonicalizeAnyLinkedInUrl,
  canonicalizeShortLinkUrl,
} from './linkedin.js';
import { NullPreviewFetcher } from '../preview/previewFetcher.js';
import { cacheFetchedPreview, markPreviewUnavailable } from '../preview/previewCache.js';
import { NullShortLinkResolver } from './shortLinkResolver.js';

/**
 * @param {object} db  Async libSQL DB adapter (see openDb in db/connection.js)
 * @param {string} rawExportText decoded chat export text
 * @param {string} groupId admin-selected group for this upload (stored, not shown)
 * @param {{
 *   filename?: string,
 *   contentHash?: string,
 *   previewFetcher?: { fetch(url: string): Promise<object> },
 *   shortLinkResolver?: { resolve(url: string): Promise<string|null> },
 * }} [options]
 * @returns {{
 *   importBatchId: number,
 *   messagesRead: number,
 *   linksFound: number,
 *   newPosts: number,
 *   alreadyOnBoard: number,
 *   newSharingEvents: number,
 *   duplicateFileWarning: boolean,
 *   pendingAttributionSenders: string[],
 *   previewFetchesSettled: Promise<void>,
 *   shortLinkResolutionsSettled: Promise<void>,
 * }}
 */
export async function ingest(db, rawExportText, groupId, options = {}) {
  const contentHash = options.contentHash ?? createHash('sha256').update(rawExportText, 'utf8').digest('hex');
  const previewFetcher = options.previewFetcher ?? NullPreviewFetcher;
  const shortLinkResolver = options.shortLinkResolver ?? NullShortLinkResolver;

  const duplicateFileWarning = Boolean(
    await db
      .prepare("SELECT 1 FROM import_batches WHERE content_hash = ? AND status = 'COMPLETE'")
      .get(contentHash)
  );

  const messages = parseMessages(rawExportText);

  let linksFound = 0;
  let newPosts = 0;
  let alreadyOnBoard = 0;
  let newSharingEvents = 0;
  const pendingAttributionSenders = new Set();
  // One best-effort preview fetch per NEW post (spec), fired after commit.
  const newPostFetchTargets = [];
  // One best-effort redirect-resolve per newly-created lnkd.in interim post
  // (spec), fired after commit -- resolution is a best-effort enhancer, not
  // a gate: the lnkd.in URL is already a real Post by the time this queue is
  // built, so a caller that never awaits shortLinkResolutionsSettled still
  // sees it on the board, URL-only.
  const shortLinkResolveTargets = [];

  let importBatchId;
  await db.transaction(async (tx) => {
    for (const message of messages) {
      const urls = extractLinkedInUrls(message.text);
      for (const rawUrl of urls) {
        const kind = classifyLinkedInUrl(rawUrl);

        if (kind === 'OTHER_LINKEDIN') {
          linksFound++;
          // Non-post LinkedIn link (profile/company/jobs/etc, spec): captured
          // for review, never silently discarded, never shown as a post. No
          // sharing event yet -- promoting the review item creates one.
          await ensureOtherLinkedInReviewItem(tx, {
            url: canonicalizeAnyLinkedInUrl(rawUrl) ?? rawUrl,
            rawSender: message.rawSender,
            timestamp: message.timestamp,
            groupId,
            note: message.text.trim() || null,
          });
          continue;
        }

        if (kind !== 'POST' && kind !== 'SHORT_LINK') continue; // not a recognizable LinkedIn/short-link URL

        // A lnkd.in short link is now a POST in its own right (spec): created
        // synchronously, same as a direct linkedin.com post URL, just keyed
        // on the lnkd.in canonical until/unless resolution re-keys or merges
        // it. It renders URL-only until that resolution succeeds.
        const canonicalUrl = kind === 'SHORT_LINK' ? canonicalizeShortLinkUrl(rawUrl) : canonicalizeUrl(rawUrl);
        if (!canonicalUrl) continue; // defensive; classifyLinkedInUrl already filtered to POST/SHORT_LINK
        linksFound++;

        const { id: postId, isNew } = await upsertPost(tx, canonicalUrl);
        if (isNew) {
          newPosts++;
          if (kind === 'POST') {
            newPostFetchTargets.push({ postId, canonicalUrl });
          } else {
            shortLinkResolveTargets.push({ postId, shortUrl: canonicalUrl });
          }
        } else {
          alreadyOnBoard++;
        }

        const memberId = await resolveMember(tx, message.rawSender);
        if (memberId === null) {
          pendingAttributionSenders.add(message.rawSender);
          await ensureUnknownSenderReviewItem(tx, message.rawSender);
        }

        const note = message.text.trim() || null;
        const inserted = await insertSharingEvent(tx, {
          postId,
          groupId,
          rawSender: message.rawSender,
          memberId,
          timestamp: message.timestamp,
          note,
        });
        if (inserted) {
          newSharingEvents++;
          await touchPostTimestamps(tx, postId, message.timestamp);
        }
      }
    }

    importBatchId = await recordImportBatch(tx, {
      groupId,
      filename: options.filename ?? null,
      contentHash,
      messagesRead: messages.length,
      linksFound,
    });
  });

  // Fired after commit so ingestion's own transaction never blocks on, or
  // fails because of, outbound HTTP (spec). Each post's fetch settles
  // independently; previewFetchesSettled lets tests await deterministic
  // completion without ingest() itself waiting on the network.
  const previewFetchesSettled = Promise.all(
    newPostFetchTargets.map(({ postId, canonicalUrl }) =>
      Promise.resolve()
        .then(() => previewFetcher.fetch(canonicalUrl))
        .then(
          (preview) => cacheFetchedPreview(db, postId, preview ?? {}),
          () => markPreviewUnavailable(db, postId)
        )
        // The write-back itself can still fail (e.g. the DB handle closed
        // in the meantime, as a short-lived test or request lifecycle
        // might do) -- swallow that too so a caller that never awaits
        // previewFetchesSettled can never see an unhandled rejection.
        .catch(() => {})
    )
  ).then(() => undefined);

  // Same after-commit, never-blocks-ingestion shape as the preview-fetch
  // pass above, but a best-effort *enhancer* rather than a gate (spec): the
  // lnkd.in URL is already a real Post by the time this queue is built, so
  // a thrown rejection or a resolver returning no URL simply leaves that
  // Post exactly as it is -- URL-only, still on the board. Success merges
  // the resolved URL into an existing Post (if one already has that
  // canonical) or re-keys this interim Post in place, then runs the normal
  // best-effort preview fetch; resolving to a non-post reclassifies this
  // Post into an OTHER_LINKEDIN review item instead.
  const shortLinkResolutionsSettled = Promise.all(
    shortLinkResolveTargets.map((target) =>
      Promise.resolve()
        .then(() => shortLinkResolver.resolve(target.shortUrl))
        .then(
          (resolvedUrl) => applyShortLinkResolution(db, target, resolvedUrl, previewFetcher),
          () => {} // resolver threw -- never-resolved Post stays as-is, never falls to review
        )
        .catch(() => {})
    )
  ).then(() => undefined);

  return {
    importBatchId,
    messagesRead: messages.length,
    linksFound,
    newPosts,
    alreadyOnBoard,
    newSharingEvents,
    duplicateFileWarning,
    pendingAttributionSenders: [...pendingAttributionSenders],
    previewFetchesSettled,
    shortLinkResolutionsSettled,
  };
}

// Exported (alongside resolveMember/ensureUnknownSenderReviewItem/
// insertSharingEvent/touchPostTimestamps below) so the OTHER_LINKEDIN
// review workflow's "promote to post" action (src/review/otherLinkedIn.js)
// can reuse the exact same upsert/attribution path ingestion uses, rather
// than duplicating it.
export async function upsertPost(db, canonicalUrl) {
  const existing = await db.prepare('SELECT id FROM posts WHERE canonical_url = ?').get(canonicalUrl);
  if (existing) return { id: existing.id, isNew: false };

  const result = await db.prepare('INSERT INTO posts (canonical_url) VALUES (?)').run(canonicalUrl);
  return { id: Number(result.lastInsertRowid), isNew: true };
}

export async function resolveMember(db, rawSender) {
  const row = await db.prepare('SELECT member_id FROM aliases WHERE raw_value = ?').get(rawSender);
  return row ? row.member_id : null;
}

// No fuzzy auto-merge (spec: "an unrecognized sender links to no member").
// One OPEN review item per unresolved raw sender string, not one per event.
export async function ensureUnknownSenderReviewItem(db, rawSender) {
  const existing = await db
    .prepare(
      `SELECT id FROM review_items
       WHERE kind = 'UNKNOWN_SENDER' AND status = 'OPEN' AND json_extract(payload, '$.rawSender') = ?`
    )
    .get(rawSender);
  if (existing) return;

  await db.prepare("INSERT INTO review_items (kind, payload) VALUES ('UNKNOWN_SENDER', ?)").run(
    JSON.stringify({ rawSender })
  );
}

// One OTHER_LINKEDIN review item per (group, timestamp, sender, url) --
// mirrors sharing_events' natural key so re-importing the same or an
// overlapping export never creates a duplicate review item, regardless of
// whether a prior one was since dismissed or promoted.
export async function ensureOtherLinkedInReviewItem(db, { url, rawSender, timestamp, groupId, note }) {
  const existing = await db
    .prepare(
      `SELECT id FROM review_items
       WHERE kind = 'OTHER_LINKEDIN'
         AND json_extract(payload, '$.url') = ?
         AND json_extract(payload, '$.rawSender') = ?
         AND json_extract(payload, '$.timestamp') = ?
         AND json_extract(payload, '$.groupId') = ?`
    )
    .get(url, rawSender, timestamp, groupId);
  if (existing) return;

  await db.prepare("INSERT INTO review_items (kind, payload) VALUES ('OTHER_LINKEDIN', ?)").run(
    JSON.stringify({ url, rawSender, timestamp, groupId, note })
  );
}

// Applies a lnkd.in interim Post's resolution outcome (spec, ticket #11):
// a resolver failure or an unusable resolved value (anything that isn't a
// recognizable POST or OTHER_LINKEDIN URL) is a no-op -- the interim Post
// stays exactly as it is, URL-only, never falling to a review item. A POST
// resolution merges into an existing Post of that canonical (moving sharing
// events, dropping any that would collide on the natural key) or re-keys
// this interim Post in place if no such Post exists yet, then runs the
// normal best-effort preview fetch on the resolved URL. An OTHER_LINKEDIN
// resolution reclassifies every sharing event this interim Post is carrying
// into that review queue and removes the interim Post.
async function applyShortLinkResolution(db, target, resolvedUrl, previewFetcher) {
  if (!resolvedUrl) return; // failed to resolve -- leave the Post as-is

  const kind = classifyLinkedInUrl(resolvedUrl);

  if (kind === 'POST') {
    const canonicalUrl = canonicalizeUrl(resolvedUrl);
    if (!canonicalUrl) return; // defensive; classifyLinkedInUrl already filtered to POST

    const finalPostId = await mergeOrRekeyShortLinkPost(db, target.postId, canonicalUrl);

    const preview = await Promise.resolve()
      .then(() => previewFetcher.fetch(canonicalUrl))
      .then(
        (result) => ({ ok: true, result }),
        () => ({ ok: false })
      )
      .catch(() => ({ ok: false }));
    if (preview.ok) {
      await cacheFetchedPreview(db, finalPostId, preview.result ?? {});
    } else {
      await markPreviewUnavailable(db, finalPostId);
    }
    return;
  }

  if (kind === 'OTHER_LINKEDIN') {
    await reclassifyShortLinkPostAsOtherLinkedIn(db, target.postId, resolvedUrl);
    return;
  }

  // Resolved to something else unusable (another short link, a non-LinkedIn
  // URL, ...) -- treated the same as a failed resolve: do nothing.
}

// Merges an interim lnkd.in Post into an existing Post sharing the resolved
// canonical URL (moving its sharing events over, skipping any that would
// collide with the target's own on the natural key, then deleting the
// now-empty interim Post), or -- if no such Post exists -- re-keys the
// interim Post's own canonical_url in place. Returns the id of whichever
// Post row now holds the resolved identity.
export async function mergeOrRekeyShortLinkPost(db, interimPostId, canonicalUrl) {
  const existing = await db
    .prepare('SELECT id FROM posts WHERE canonical_url = ? AND id != ?')
    .get(canonicalUrl, interimPostId);

  if (!existing) {
    await db.prepare('UPDATE posts SET canonical_url = ? WHERE id = ?').run(canonicalUrl, interimPostId);
    return interimPostId;
  }

  const targetPostId = existing.id;
  await db.transaction(async (tx) => {
    const events = await tx.prepare('SELECT * FROM sharing_events WHERE post_id = ?').all(interimPostId);
    for (const event of events) {
      const collision = await tx
        .prepare(
          `SELECT 1 FROM sharing_events
           WHERE post_id = ? AND group_id = ? AND raw_sender = ? AND message_timestamp = ?`
        )
        .get(targetPostId, event.group_id, event.raw_sender, event.message_timestamp);
      if (collision) {
        await tx.prepare('DELETE FROM sharing_events WHERE id = ?').run(event.id);
      } else {
        await tx.prepare('UPDATE sharing_events SET post_id = ? WHERE id = ?').run(targetPostId, event.id);
        await touchPostTimestamps(tx, targetPostId, event.message_timestamp);
      }
    }
    await tx.prepare('DELETE FROM posts WHERE id = ?').run(interimPostId);
  });
  return targetPostId;
}

// Reclassifies an interim lnkd.in Post as an OTHER_LINKEDIN review item:
// every sharing event it was carrying becomes its own OTHER_LINKEDIN item
// (mirroring how a directly-shared OTHER_LINKEDIN URL is handled, one item
// per (group, timestamp, sender, url)), then the interim Post is removed --
// its sharing events cascade-delete with it.
export async function reclassifyShortLinkPostAsOtherLinkedIn(db, interimPostId, resolvedUrl) {
  const canonicalUrl = canonicalizeAnyLinkedInUrl(resolvedUrl) ?? resolvedUrl;
  await db.transaction(async (tx) => {
    const events = await tx.prepare('SELECT * FROM sharing_events WHERE post_id = ?').all(interimPostId);
    for (const event of events) {
      await ensureOtherLinkedInReviewItem(tx, {
        url: canonicalUrl,
        rawSender: event.raw_sender,
        timestamp: event.message_timestamp,
        groupId: event.group_id,
        note: event.note,
      });
    }
    await tx.prepare('DELETE FROM posts WHERE id = ?').run(interimPostId);
  });
}

// Natural key (group_id, message_timestamp, raw_sender, post_id) is a DB
// UNIQUE constraint; INSERT OR IGNORE makes re-importing the same or an
// overlapping export a zero-new-rows no-op.
export async function insertSharingEvent(db, { postId, groupId, rawSender, memberId, timestamp, note }) {
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp, note)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(postId, groupId, rawSender, memberId, timestamp, note);
  return result.changes > 0;
}

export async function touchPostTimestamps(db, postId, timestamp) {
  await db.prepare(
    `UPDATE posts SET
       first_shared_at = CASE WHEN first_shared_at IS NULL OR ? < first_shared_at THEN ? ELSE first_shared_at END,
       last_shared_at = CASE WHEN last_shared_at IS NULL OR ? > last_shared_at THEN ? ELSE last_shared_at END
     WHERE id = ?`
  ).run(timestamp, timestamp, timestamp, timestamp, postId);
}

async function recordImportBatch(db, { groupId, filename, contentHash, messagesRead, linksFound }) {
  const result = await db
    .prepare(
      `INSERT INTO import_batches (group_id, filename, content_hash, status, messages_read, links_found, completed_at)
       VALUES (?, ?, ?, 'COMPLETE', ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
    )
    .run(groupId, filename, contentHash, messagesRead, linksFound);
  return Number(result.lastInsertRowid);
}
