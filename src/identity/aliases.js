// Alias resolution is always an explicit admin action -- no fuzzy
// auto-merging (spec). Mapping a raw sender string to a member retroactively
// re-attributes every past sharing event from that sender and resolves its
// UNKNOWN_SENDER review item, per the spec's review-workflow decision that
// every review action re-runs attribution on affected records.

// Shared by mapAliasToMember and createMemberAndMapAlias -- runs inside the
// caller's transaction so a brand-new member and its alias commit atomically.
function mapAliasToMemberTx(db, rawSender, memberId) {
  const existing = db.prepare('SELECT id FROM aliases WHERE raw_value = ?').get(rawSender);
  if (existing) {
    db.prepare('UPDATE aliases SET member_id = ? WHERE raw_value = ?').run(memberId, rawSender);
  } else {
    db.prepare('INSERT INTO aliases (member_id, raw_value) VALUES (?, ?)').run(memberId, rawSender);
  }

  db.prepare('UPDATE sharing_events SET member_id = ? WHERE raw_sender = ?').run(memberId, rawSender);

  db.prepare(
    `UPDATE review_items SET status = 'RESOLVED', resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE kind = 'UNKNOWN_SENDER' AND status = 'OPEN' AND json_extract(payload, '$.rawSender') = ?`
  ).run(rawSender);
}

export function mapAliasToMember(db, rawSender, memberId) {
  db.exec('BEGIN');
  try {
    mapAliasToMemberTx(db, rawSender, memberId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Review-screen "create new member" action: creates the member and maps the
 * alias to it atomically, re-attributing/resolving exactly like
 * mapAliasToMember.
 * @returns {number} the new member's id
 */
export function createMemberAndMapAlias(db, rawSender, displayName) {
  db.exec('BEGIN');
  try {
    const result = db.prepare('INSERT INTO members (display_name) VALUES (?)').run(displayName);
    const memberId = Number(result.lastInsertRowid);
    mapAliasToMemberTx(db, rawSender, memberId);
    db.exec('COMMIT');
    return memberId;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Reverses a review-screen match: removes the alias, resets every sharing
 * event from that raw sender back to "Pending attribution", and reopens the
 * UNKNOWN_SENDER review item. Per the spec, every review action is
 * reversible -- this is the review-screen's Undo. Only safe to call for an
 * alias that had no prior mapping before the match it is undoing (true for
 * every UNKNOWN_SENDER match, since a sender with an existing alias would
 * never have produced one).
 * @param {{ createdMemberId?: number }} [options] if the match being undone
 *   created a brand-new member, pass its id so it is cleaned up once it has
 *   no remaining aliases.
 */
export function undoAliasMapping(db, rawSender, { createdMemberId } = {}) {
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM aliases WHERE raw_value = ?').run(rawSender);
    db.prepare('UPDATE sharing_events SET member_id = NULL WHERE raw_sender = ?').run(rawSender);

    db.prepare(
      `UPDATE review_items SET status = 'OPEN', resolved_at = NULL
       WHERE kind = 'UNKNOWN_SENDER' AND status = 'RESOLVED' AND json_extract(payload, '$.rawSender') = ?`
    ).run(rawSender);

    if (createdMemberId) {
      db.prepare(
        'DELETE FROM members WHERE id = ? AND NOT EXISTS (SELECT 1 FROM aliases WHERE member_id = ?)'
      ).run(createdMemberId, createdMemberId);
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
