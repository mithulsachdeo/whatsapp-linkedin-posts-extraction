// Alias resolution is always an explicit admin action -- no fuzzy
// auto-merging (spec). Mapping a raw sender string to a member retroactively
// re-attributes every past sharing event from that sender and resolves its
// UNKNOWN_SENDER review item, per the spec's review-workflow decision that
// every review action re-runs attribution on affected records.
export function mapAliasToMember(db, rawSender, memberId) {
  db.exec('BEGIN');
  try {
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

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
