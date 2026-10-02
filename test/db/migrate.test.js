import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from '../helpers/testDb.js';
import { migrate } from '../../src/db/migrate.js';

test('migrate creates the core schema', () => {
  const { db, close } = createTestDb();
  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => row.name);

    for (const expected of ['members', 'aliases', 'posts', 'sharing_events', 'review_items', 'import_batches']) {
      assert.ok(tables.includes(expected), `expected table ${expected} to exist`);
    }
  } finally {
    close();
  }
});

test('migrate is idempotent: re-running applies nothing new', () => {
  const { db, close } = createTestDb();
  try {
    const appliedAgain = migrate(db);
    assert.deepEqual(appliedAgain, []);
  } finally {
    close();
  }
});

test('migrate enables WAL journal mode on a file-backed db', () => {
  const { db, close } = createTestDb();
  try {
    const mode = db.prepare('PRAGMA journal_mode').get();
    assert.equal(mode.journal_mode, 'wal');
  } finally {
    close();
  }
});
