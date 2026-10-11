// Date-range filter for the discovery dashboard: a post matches if ANY of its
// sharing_events falls within the [from, to] window, expressed as IST
// calendar days (see src/query/istDateRange.js for the conversion). Sibling
// to dashboard.test.js, which covers the other getDashboard filters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from '../helpers/testDb.js';
import { getDashboard, getDateRangeBounds } from '../../src/query/dashboard.js';

function insertPost(db, url) {
  return Number(db.prepare(`INSERT INTO posts (canonical_url) VALUES (?)`).run(url).lastInsertRowid);
}

function insertShare(db, postId, timestamp, overrides = {}) {
  const groupId = overrides.groupId ?? 'group-a';
  const rawSender = overrides.rawSender ?? '+91 1';
  const memberId = overrides.memberId ?? null;
  db.prepare(
    `INSERT INTO sharing_events (post_id, group_id, raw_sender, member_id, message_timestamp) VALUES (?, ?, ?, ?, ?)`
  ).run(postId, groupId, rawSender, memberId, timestamp);
}

test('getDashboard with from+to matches a post if ANY of its shares (not just first/last) falls in the window', () => {
  const { db, close } = createTestDb();
  try {
    const post = insertPost(db, 'https://www.linkedin.com/posts/multi-share');
    // First share well before the window, last share well after it -- only
    // the middle share lands inside [from, to].
    insertShare(db, post, '2026-08-01T00:00:00.000Z');
    insertShare(db, post, '2026-09-15T12:00:00.000Z');
    insertShare(db, post, '2026-10-20T00:00:00.000Z');

    const result = getDashboard(db, { from: '2026-09-14', to: '2026-09-16' });
    assert.deepEqual(result.posts.map((p) => p.url), ['https://www.linkedin.com/posts/multi-share']);
  } finally {
    close();
  }
});

test('getDashboard with from-only matches shares on or after that IST day, excluding earlier posts', () => {
  const { db, close } = createTestDb();
  try {
    const early = insertPost(db, 'https://www.linkedin.com/posts/early');
    const late = insertPost(db, 'https://www.linkedin.com/posts/late');
    insertShare(db, early, '2026-09-01T00:00:00.000Z');
    insertShare(db, late, '2026-09-20T00:00:00.000Z');

    const result = getDashboard(db, { from: '2026-09-10' });
    assert.deepEqual(result.posts.map((p) => p.url), ['https://www.linkedin.com/posts/late']);
  } finally {
    close();
  }
});

test('getDashboard with to-only matches shares on or before that IST day, excluding later posts', () => {
  const { db, close } = createTestDb();
  try {
    const early = insertPost(db, 'https://www.linkedin.com/posts/early');
    const late = insertPost(db, 'https://www.linkedin.com/posts/late');
    insertShare(db, early, '2026-09-01T00:00:00.000Z');
    insertShare(db, late, '2026-09-20T00:00:00.000Z');

    const result = getDashboard(db, { to: '2026-09-10' });
    assert.deepEqual(result.posts.map((p) => p.url), ['https://www.linkedin.com/posts/early']);
  } finally {
    close();
  }
});

test('getDashboard with neither from nor to returns everything (unchanged default)', () => {
  const { db, close } = createTestDb();
  try {
    const post = insertPost(db, 'https://www.linkedin.com/posts/a');
    insertShare(db, post, '2026-09-01T00:00:00.000Z');

    const result = getDashboard(db, {});
    assert.equal(result.posts.length, 1);
  } finally {
    close();
  }
});

test('getDashboard date range AND-composes with the member filter', () => {
  const { db, close } = createTestDb();
  try {
    const member = Number(
      db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Priya Sharma').lastInsertRowid
    );
    const byMemberInWindow = insertPost(db, 'https://www.linkedin.com/posts/by-member-in-window');
    const byMemberOutsideWindow = insertPost(db, 'https://www.linkedin.com/posts/by-member-outside-window');
    const byOtherInWindow = insertPost(db, 'https://www.linkedin.com/posts/by-other-in-window');

    insertShare(db, byMemberInWindow, '2026-09-15T00:00:00.000Z', { memberId: member });
    insertShare(db, byMemberOutsideWindow, '2026-08-01T00:00:00.000Z', { memberId: member });
    insertShare(db, byOtherInWindow, '2026-09-15T00:00:00.000Z');

    const result = getDashboard(db, { memberId: member, from: '2026-09-14', to: '2026-09-16' });
    assert.deepEqual(result.posts.map((p) => p.url), ['https://www.linkedin.com/posts/by-member-in-window']);
  } finally {
    close();
  }
});

test('getDashboard ignores a malformed from/to value rather than erroring or filtering everything out', () => {
  const { db, close } = createTestDb();
  try {
    const post = insertPost(db, 'https://www.linkedin.com/posts/a');
    insertShare(db, post, '2026-09-01T00:00:00.000Z');

    const result = getDashboard(db, { from: 'not-a-date', to: '2026-13-40' });
    assert.equal(result.posts.length, 1);
  } finally {
    close();
  }
});

// IST near-midnight boundary cases -- the critical correctness point. A share
// at 00:30 IST on 2026-09-15 is stored as 2026-09-14T19:00:00.000Z; a share at
// 23:30 IST on 2026-09-14 is stored as 2026-09-14T18:00:00.000Z.
test('getDashboard from=2026-09-15 includes a share at 00:30 IST on that day (stored as the previous UTC day)', () => {
  const { db, close } = createTestDb();
  try {
    const post = insertPost(db, 'https://www.linkedin.com/posts/midnight-early');
    insertShare(db, post, '2026-09-14T19:00:00.000Z'); // 00:30 IST on 2026-09-15

    const result = getDashboard(db, { from: '2026-09-15' });
    assert.deepEqual(result.posts.map((p) => p.url), ['https://www.linkedin.com/posts/midnight-early']);
  } finally {
    close();
  }
});

test('getDashboard to=2026-09-14 excludes a share at 00:30 IST on 2026-09-15 (one calendar day later)', () => {
  const { db, close } = createTestDb();
  try {
    const post = insertPost(db, 'https://www.linkedin.com/posts/midnight-early');
    insertShare(db, post, '2026-09-14T19:00:00.000Z'); // 00:30 IST on 2026-09-15

    const result = getDashboard(db, { to: '2026-09-14' });
    assert.deepEqual(result.posts, []);
  } finally {
    close();
  }
});

test('getDashboard to=2026-09-14 includes a share at 23:30 IST on that same day', () => {
  const { db, close } = createTestDb();
  try {
    const post = insertPost(db, 'https://www.linkedin.com/posts/midnight-late');
    insertShare(db, post, '2026-09-14T18:00:00.000Z'); // 23:30 IST on 2026-09-14

    const result = getDashboard(db, { to: '2026-09-14' });
    assert.deepEqual(result.posts.map((p) => p.url), ['https://www.linkedin.com/posts/midnight-late']);
  } finally {
    close();
  }
});

test('getDashboard from=2026-09-15 excludes a share at 23:30 IST on 2026-09-14 (the previous calendar day)', () => {
  const { db, close } = createTestDb();
  try {
    const post = insertPost(db, 'https://www.linkedin.com/posts/midnight-late');
    insertShare(db, post, '2026-09-14T18:00:00.000Z'); // 23:30 IST on 2026-09-14

    const result = getDashboard(db, { from: '2026-09-15' });
    assert.deepEqual(result.posts, []);
  } finally {
    close();
  }
});

test('getDateRangeBounds returns null min/max on an empty DB', () => {
  const { db, close } = createTestDb();
  try {
    assert.deepEqual(getDateRangeBounds(db), { min: null, max: null });
  } finally {
    close();
  }
});

test('getDateRangeBounds expresses MIN/MAX(message_timestamp) as IST calendar dates', () => {
  const { db, close } = createTestDb();
  try {
    const post = insertPost(db, 'https://www.linkedin.com/posts/a');
    // Earliest share: 23:30 IST on 2026-09-14 (stored as 2026-09-14T18:00Z).
    insertShare(db, post, '2026-09-14T18:00:00.000Z');
    // Latest share: 00:30 IST on 2026-09-20 (stored as 2026-09-19T19:00Z).
    insertShare(db, post, '2026-09-19T19:00:00.000Z');

    assert.deepEqual(getDateRangeBounds(db), { min: '2026-09-14', max: '2026-09-20' });
  } finally {
    close();
  }
});

test('getDateRangeBounds excludes the date filter itself (from/to on the options have no effect)', () => {
  const { db, close } = createTestDb();
  try {
    const post = insertPost(db, 'https://www.linkedin.com/posts/a');
    insertShare(db, post, '2026-09-01T00:00:00.000Z');
    insertShare(db, post, '2026-09-30T00:00:00.000Z');

    const bounds = getDateRangeBounds(db, { from: '2026-09-10', to: '2026-09-20' });
    assert.deepEqual(bounds, { min: '2026-09-01', max: '2026-09-30' });
  } finally {
    close();
  }
});

test('getDateRangeBounds respects the member filter', () => {
  const { db, close } = createTestDb();
  try {
    const member = Number(
      db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Priya Sharma').lastInsertRowid
    );
    const byMember = insertPost(db, 'https://www.linkedin.com/posts/by-member');
    const byOther = insertPost(db, 'https://www.linkedin.com/posts/by-other');
    insertShare(db, byMember, '2026-09-10T00:00:00.000Z', { memberId: member });
    insertShare(db, byOther, '2026-09-25T00:00:00.000Z');

    assert.deepEqual(getDateRangeBounds(db, { memberId: member }), { min: '2026-09-10', max: '2026-09-10' });
  } finally {
    close();
  }
});

test('getDateRangeBounds respects the search filter', () => {
  const { db, close } = createTestDb();
  try {
    const match = insertPost(db, 'https://www.linkedin.com/posts/okr-season');
    const other = insertPost(db, 'https://www.linkedin.com/posts/unrelated');
    insertShare(db, match, '2026-09-10T00:00:00.000Z');
    insertShare(db, other, '2026-09-25T00:00:00.000Z');

    assert.deepEqual(getDateRangeBounds(db, { search: 'okr' }), { min: '2026-09-10', max: '2026-09-10' });
  } finally {
    close();
  }
});

test('getDateRangeBounds respects the view filter', () => {
  const { db, close } = createTestDb();
  try {
    const read = insertPost(db, 'https://www.linkedin.com/posts/read');
    const unread = insertPost(db, 'https://www.linkedin.com/posts/unread');
    insertShare(db, read, '2026-09-10T00:00:00.000Z');
    insertShare(db, unread, '2026-09-25T00:00:00.000Z');

    const bounds = getDateRangeBounds(db, { view: 'unread', readIds: [read] });
    assert.deepEqual(bounds, { min: '2026-09-25', max: '2026-09-25' });
  } finally {
    close();
  }
});
