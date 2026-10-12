import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from '../helpers/testDb.js';
import { migrate } from '../../src/db/migrate.js';
import { backfillUnresolvedShortLinks } from '../../src/db/backfillUnresolvedShortLinks.js';
import { getDashboard } from '../../src/query/dashboard.js';

test('migrate creates the core schema', async () => {
  const { db, close } = await createTestDb();
  try {
    const tables = (
      await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all()
    ).map((row) => row.name);

    for (const expected of ['members', 'aliases', 'posts', 'sharing_events', 'review_items', 'import_batches']) {
      assert.ok(tables.includes(expected), `expected table ${expected} to exist`);
    }
  } finally {
    await close();
  }
});

test('migrate is idempotent: re-running applies nothing new', async () => {
  const { db, close } = await createTestDb();
  try {
    const appliedAgain = await migrate(db);
    assert.deepEqual(appliedAgain, []);
  } finally {
    await close();
  }
});

// WAL (journal_mode) assertion removed: libSQL manages its own storage engine
// and drops the file-level WAL concept. Replaced with a positive schema check.
test('migrate leaves the posts table in place', async () => {
  const { db, close } = await createTestDb();
  try {
    assert.ok(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='posts'").get());
  } finally {
    await close();
  }
});

// One-time backfill (ticket #11): the UNRESOLVED_SHORT_LINK review queue is
// removed, but an existing item -- seeded directly here the way an install
// that predates this change would already have one on disk -- must still
// turn into a normal Post + sharing event, and the item itself must be gone.
test('backfillUnresolvedShortLinks converts a seeded UNRESOLVED_SHORT_LINK item into a post and sharing event, then removes the item', async () => {
  const { db, close } = await createTestDb();
  try {
    db.prepare("INSERT INTO review_items (kind, payload) VALUES ('UNRESOLVED_SHORT_LINK', ?)").run(
      JSON.stringify({
        url: 'https://lnkd.in/abc123',
        rawSender: 'Priya Sharma',
        timestamp: '2026-09-30T10:15:00.000Z',
        groupId: 'group-a',
        note: 'Worth a read',
      })
    );

    const converted = backfillUnresolvedShortLinks(db);
    assert.equal(converted, 1);

    const dashboard = getDashboard(db);
    assert.equal(dashboard.posts.length, 1);
    assert.equal(dashboard.posts[0].url, 'https://lnkd.in/abc123');
    assert.equal(dashboard.posts[0].shareCount, 1);

    const remaining = await db.prepare("SELECT * FROM review_items WHERE kind = 'UNRESOLVED_SHORT_LINK'").all();
    assert.equal(remaining.length, 0);
  } finally {
    await close();
  }
});

test('backfillUnresolvedShortLinks is idempotent: a second run finds nothing left to convert', async () => {
  const { db, close } = await createTestDb();
  try {
    db.prepare("INSERT INTO review_items (kind, payload) VALUES ('UNRESOLVED_SHORT_LINK', ?)").run(
      JSON.stringify({
        url: 'https://lnkd.in/abc123',
        rawSender: 'Priya Sharma',
        timestamp: '2026-09-30T10:15:00.000Z',
        groupId: 'group-a',
        note: null,
      })
    );

    backfillUnresolvedShortLinks(db);
    const secondRun = backfillUnresolvedShortLinks(db);
    assert.equal(secondRun, 0);

    const dashboard = getDashboard(db);
    assert.equal(dashboard.posts.length, 1); // not duplicated
  } finally {
    await close();
  }
});

test('migrate itself runs the backfill exactly once, recorded in the migration ledger', async () => {
  const { db, close } = await createTestDb(); // createTestDb already calls migrate() once
  try {
    db.prepare("INSERT INTO review_items (kind, payload) VALUES ('UNRESOLVED_SHORT_LINK', ?)").run(
      JSON.stringify({
        url: 'https://lnkd.in/xyz789',
        rawSender: 'Arjun Das',
        timestamp: '2026-09-29T09:00:00.000Z',
        groupId: 'group-a',
        note: null,
      })
    );

    // The backfill already ran (and was recorded) during createTestDb's own
    // migrate() call, before this item existed -- re-running migrate() must
    // not pick it up a second time; it is a one-time-per-database routine.
    const appliedAgain = await migrate(db);
    assert.deepEqual(appliedAgain, []);

    const stillThere = await db.prepare("SELECT * FROM review_items WHERE kind = 'UNRESOLVED_SHORT_LINK'").all();
    assert.equal(stillThere.length, 1);
  } finally {
    await close();
  }
});
