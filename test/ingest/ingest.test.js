// Primary seam per the spec's testing decisions: ingest(db, rawExportText,
// groupId) against a real temporary SQLite DB, asserted through the public
// query API (getDashboard) and direct table reads for identity/review-queue
// outcomes not yet exposed through a query module.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from '../helpers/testDb.js';
import { ingest } from '../../src/ingest/ingest.js';
import { mapAliasToMember } from '../../src/identity/aliases.js';
import { getDashboard } from '../../src/query/dashboard.js';

const GROUP = 'group-a';

test('ingests an iOS-format export: extracts the post, attributes the sender, captures the note', async () => {
  const { db, close } = await createTestDb();
  try {
    const text = [
      '[30/09/26, 10:15:00 AM] Priya Sharma: Worth a read on roadmap reviews',
      'https://www.linkedin.com/posts/priya-sharma_activity-7245119038-abcd',
      '[30/09/26, 10:16:00 AM] Arjun Das: lol ok',
    ].join('\n');

    const result = await ingest(db, text, GROUP);

    assert.equal(result.messagesRead, 2);
    assert.equal(result.linksFound, 1);
    assert.equal(result.newPosts, 1);
    assert.equal(result.alreadyOnBoard, 0);
    assert.equal(result.newSharingEvents, 1);
    assert.equal(result.duplicateFileWarning, false);

    const dashboard = await getDashboard(db);
    assert.equal(dashboard.posts.length, 1);
    assert.equal(dashboard.posts[0].url, 'https://www.linkedin.com/posts/priya-sharma_activity-7245119038-abcd');
    assert.equal(dashboard.posts[0].shareCount, 1);

    const event = await db.prepare('SELECT * FROM sharing_events').get();
    assert.equal(event.raw_sender, 'Priya Sharma');
    assert.match(event.note, /Worth a read/);
  } finally {
    await close();
  }
});

test('ingests an Android-format export with a multi-line message', async () => {
  const { db, close } = await createTestDb();
  try {
    const text = [
      '30/09/26, 10:15 - Priya Sharma: Worth a read on roadmap reviews',
      'Here is the link:',
      'https://www.linkedin.com/posts/priya-sharma_activity-7245119038-abcd',
      '30/09/26, 10:16 - Arjun Das: nice',
    ].join('\n');

    const result = await ingest(db, text, GROUP);

    assert.equal(result.messagesRead, 2);
    assert.equal(result.newPosts, 1);
    const event = await db.prepare('SELECT * FROM sharing_events').get();
    assert.match(event.note, /Worth a read on roadmap reviews\nHere is the link:/);
  } finally {
    await close();
  }
});

test('skips system/notice lines (no Sender: shape) without creating a message', async () => {
  const { db, close } = await createTestDb();
  try {
    const text = [
      '30/09/26, 09:00 - Messages and calls are end-to-end encrypted. No one outside of this chat can read or listen to them.',
      '30/09/26, 09:01 - Priya Sharma added Arjun Das',
      '30/09/26, 10:15 - Priya Sharma: https://www.linkedin.com/posts/priya-sharma_activity-1-abcd',
    ].join('\n');

    const result = await ingest(db, text, GROUP);

    assert.equal(result.messagesRead, 1);
    assert.equal(result.newPosts, 1);
  } finally {
    await close();
  }
});

test('importing the same export twice yields zero new sharing events the second time', async () => {
  const { db, close } = await createTestDb();
  try {
    const text = '30/09/26, 10:15 - Priya Sharma: https://www.linkedin.com/posts/priya-sharma_activity-1-abcd';

    const first = await ingest(db, text, GROUP);
    const second = await ingest(db, text, GROUP);

    assert.equal(first.newSharingEvents, 1);
    assert.equal(second.newSharingEvents, 0);
    assert.equal(second.newPosts, 0);
    assert.equal(second.alreadyOnBoard, 1);
    assert.equal(second.duplicateFileWarning, true);

    const dashboard = await getDashboard(db);
    assert.equal(dashboard.posts[0].shareCount, 1);
  } finally {
    await close();
  }
});

test('importing an overlapping export yields zero new sharing events for the overlapping portion', async () => {
  const { db, close } = await createTestDb();
  try {
    const first = [
      '30/09/26, 10:15 - Priya Sharma: https://www.linkedin.com/posts/priya-sharma_activity-1-abcd',
      '30/09/26, 10:16 - Arjun Das: https://www.linkedin.com/posts/arjun-das_activity-2-abcd',
    ].join('\n');
    const overlapping = [
      '30/09/26, 10:16 - Arjun Das: https://www.linkedin.com/posts/arjun-das_activity-2-abcd',
      '30/09/26, 10:17 - Grace Liu: https://www.linkedin.com/posts/grace-liu_activity-3-abcd',
    ].join('\n');

    await ingest(db, first, GROUP);
    const second = await ingest(db, overlapping, GROUP);

    assert.equal(second.newSharingEvents, 1); // only Grace's post is new
    assert.equal(second.alreadyOnBoard, 1); // Arjun's post already existed

    const dashboard = await getDashboard(db);
    assert.equal(dashboard.posts.length, 3);
  } finally {
    await close();
  }
});

test('the same person sharing the same link at different timestamps yields two distinct sharing events', async () => {
  const { db, close } = await createTestDb();
  try {
    const text = [
      '30/09/26, 10:15 - Priya Sharma: https://www.linkedin.com/posts/priya-sharma_activity-1-abcd',
      '30/09/26, 11:00 - Priya Sharma: https://www.linkedin.com/posts/priya-sharma_activity-1-abcd',
    ].join('\n');

    const result = await ingest(db, text, GROUP);

    assert.equal(result.newSharingEvents, 2);
    const dashboard = await getDashboard(db);
    assert.equal(dashboard.posts[0].shareCount, 2);
  } finally {
    await close();
  }
});

test('canonicalization collapses tracking-param and host-casing variants of one post into one Post', async () => {
  const { db, close } = await createTestDb();
  try {
    const text = [
      '30/09/26, 10:15 - Priya Sharma: https://www.LinkedIn.com/posts/priya-sharma_activity-1-abcd?utm_source=whatsapp&utm_medium=share',
      '30/09/26, 10:20 - Arjun Das: https://www.linkedin.com/posts/priya-sharma_activity-1-abcd?trackingId=xyz&rcm=abc',
    ].join('\n');

    const result = await ingest(db, text, GROUP);

    assert.equal(result.newPosts, 1);
    assert.equal(result.alreadyOnBoard, 1);
    const dashboard = await getDashboard(db);
    assert.equal(dashboard.posts.length, 1);
    assert.equal(dashboard.posts[0].url, 'https://www.linkedin.com/posts/priya-sharma_activity-1-abcd');
    assert.equal(dashboard.posts[0].shareCount, 2);
  } finally {
    await close();
  }
});

test('an unknown sender produces a Pending-attribution event and an UNKNOWN_SENDER review item', async () => {
  const { db, close } = await createTestDb();
  try {
    const text = '30/09/26, 10:15 - +91 90000 00000: https://www.linkedin.com/posts/someone_activity-1-abcd';

    const result = await ingest(db, text, GROUP);

    assert.deepEqual(result.pendingAttributionSenders, ['+91 90000 00000']);

    const dashboard = await getDashboard(db);
    assert.equal(dashboard.posts[0].pendingAttribution, true);

    const reviewItem = await db.prepare("SELECT * FROM review_items WHERE kind = 'UNKNOWN_SENDER'").get();
    assert.ok(reviewItem);
    assert.equal(reviewItem.status, 'OPEN');
    assert.equal(JSON.parse(reviewItem.payload).rawSender, '+91 90000 00000');
  } finally {
    await close();
  }
});

test('mapping an unknown sender to a member retroactively re-attributes past sharing events', async () => {
  const { db, close } = await createTestDb();
  try {
    const text = '30/09/26, 10:15 - +91 90000 00000: https://www.linkedin.com/posts/someone_activity-1-abcd';
    await ingest(db, text, GROUP);

    const member = await db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Priya Sharma');
    await mapAliasToMember(db, '+91 90000 00000', Number(member.lastInsertRowid));

    const dashboard = await getDashboard(db);
    assert.equal(dashboard.posts[0].pendingAttribution, false);

    const reviewItem = await db.prepare("SELECT * FROM review_items WHERE kind = 'UNKNOWN_SENDER'").get();
    assert.equal(reviewItem.status, 'RESOLVED');
  } finally {
    await close();
  }
});

test('a raw sender matching a known alias auto-links to its member on import', async () => {
  const { db, close } = await createTestDb();
  try {
    const member = await db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Priya Sharma');
    await db.prepare('INSERT INTO aliases (member_id, raw_value) VALUES (?, ?)').run(
      Number(member.lastInsertRowid),
      '+91 90000 00000'
    );

    const text = '30/09/26, 10:15 - +91 90000 00000: https://www.linkedin.com/posts/someone_activity-1-abcd';
    const result = await ingest(db, text, GROUP);

    assert.deepEqual(result.pendingAttributionSenders, []);
    const dashboard = await getDashboard(db);
    assert.equal(dashboard.posts[0].pendingAttribution, false);
  } finally {
    await close();
  }
});

test('non-LinkedIn URLs are not extracted at all', async () => {
  const { db, close } = await createTestDb();
  try {
    const text = '30/09/26, 10:15 - Priya Sharma: check this https://example.com/foo';

    const result = await ingest(db, text, GROUP);

    assert.equal(result.linksFound, 0);
    assert.equal(result.newPosts, 0);
  } finally {
    await close();
  }
});

test('a LinkedIn profile/company/jobs URL is not a post but is captured as an OTHER_LINKEDIN review item', async () => {
  const { db, close } = await createTestDb();
  try {
    const text = [
      '30/09/26, 10:15 - Priya Sharma: https://www.linkedin.com/in/priya-sharma',
      '30/09/26, 10:16 - Priya Sharma: https://www.linkedin.com/company/acme',
      '30/09/26, 10:17 - Priya Sharma: https://www.linkedin.com/jobs/view/12345',
    ].join('\n');

    const result = await ingest(db, text, GROUP);

    assert.equal(result.linksFound, 3);
    assert.equal(result.newPosts, 0);

    const dashboard = await getDashboard(db);
    assert.equal(dashboard.posts.length, 0);

    const items = await db.prepare("SELECT * FROM review_items WHERE kind = 'OTHER_LINKEDIN'").all();
    assert.equal(items.length, 3);
    assert.ok(items.every((i) => i.status === 'OPEN'));
    assert.deepEqual(
      items.map((i) => JSON.parse(i.payload).url).sort(),
      [
        'https://www.linkedin.com/company/acme',
        'https://www.linkedin.com/in/priya-sharma',
        'https://www.linkedin.com/jobs/view/12345',
      ]
    );
  } finally {
    await close();
  }
});

test('re-importing the same export produces no duplicate OTHER_LINKEDIN review items', async () => {
  const { db, close } = await createTestDb();
  try {
    const text = '30/09/26, 10:15 - Priya Sharma: https://www.linkedin.com/in/priya-sharma';

    await ingest(db, text, GROUP);
    await ingest(db, text, GROUP);

    const items = await db.prepare("SELECT * FROM review_items WHERE kind = 'OTHER_LINKEDIN'").all();
    assert.equal(items.length, 1);
  } finally {
    await close();
  }
});

test('auto-detects mm/dd date order when a header unambiguously has a month > 12-impossible day in the first slot', async () => {
  const { db, close } = await createTestDb();
  try {
    // 09/15/26 cannot be dd/mm (no 15th month) -> must be mm/dd -> 15 Sep 2026
    const text = '09/15/26, 10:15 - Priya Sharma: https://www.linkedin.com/posts/someone_activity-1-abcd';

    await ingest(db, text, GROUP);

    const event = await db.prepare('SELECT message_timestamp FROM sharing_events').get();
    // 15 Sep 2026, 10:15 IST -> 04:45 UTC
    assert.equal(event.message_timestamp, '2026-09-15T04:45:00.000Z');
  } finally {
    await close();
  }
});
