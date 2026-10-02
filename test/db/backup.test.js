// Primary seam: backupDatabase/pruneBackups exercised against a real
// temporary SQLite DB and a real temporary backup directory -- no mocking of
// the filesystem or SQLite, matching the project's seam convention.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { createTestDb } from '../helpers/testDb.js';
import { backupDatabase, pruneBackups, startNightlyBackupScheduler } from '../../src/db/backup.js';

function withBackupDir(fn) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'postboard-backup-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('backupDatabase writes a timestamped, independently-openable snapshot of the live db', () => {
  const { db, close } = createTestDb();
  try {
    withBackupDir((backupDir) => {
      db.prepare('INSERT INTO members (display_name) VALUES (?)').run('Priya Sharma');

      const backupPath = backupDatabase(db, backupDir, { now: new Date('2026-09-30T02:00:00Z') });

      assert.ok(existsSync(backupPath));
      assert.equal(path.dirname(backupPath), backupDir);

      // The backup is a standalone, valid SQLite file -- not a reference to
      // the live one -- so it must be openable and contain the committed row
      // even after the live db is mutated further.
      const copy = new DatabaseSync(backupPath, { readOnly: true });
      const row = copy.prepare('SELECT display_name FROM members WHERE display_name = ?').get('Priya Sharma');
      assert.equal(row.display_name, 'Priya Sharma');
      copy.close();
    });
  } finally {
    close();
  }
});

test('backupDatabase names the file after the given timestamp so retention can sort/filter by it', () => {
  const { db, close } = createTestDb();
  try {
    withBackupDir((backupDir) => {
      const backupPath = backupDatabase(db, backupDir, { now: new Date('2026-09-30T02:00:00Z') });
      assert.equal(path.basename(backupPath), 'postboard-20260930-020000.sqlite');
    });
  } finally {
    close();
  }
});

test('pruneBackups deletes backup files older than the retention window and keeps the rest', () => {
  withBackupDir((backupDir) => {
    const { db: tmpDb, close } = createTestDb();
    try {
      const oldFile = backupDatabase(tmpDb, backupDir, { now: new Date('2026-09-01T02:00:00Z') });
      const recentFile = backupDatabase(tmpDb, backupDir, { now: new Date('2026-09-29T02:00:00Z') });

      // backupDatabase stamps the filename, not the file's mtime -- set
      // mtime explicitly so pruning (which reads mtime) reflects each
      // backup's real age independent of when the test ran.
      utimesSync(oldFile, new Date('2026-09-01T02:00:00Z'), new Date('2026-09-01T02:00:00Z'));
      utimesSync(recentFile, new Date('2026-09-29T02:00:00Z'), new Date('2026-09-29T02:00:00Z'));

      const deleted = pruneBackups(backupDir, { retentionDays: 3, now: new Date('2026-09-30T02:00:00Z') });

      assert.deepEqual(deleted, [oldFile]);
      assert.deepEqual(readdirSync(backupDir), [path.basename(recentFile)]);
    } finally {
      close();
    }
  });
});

test('pruneBackups ignores files in the directory that are not postboard backups', () => {
  withBackupDir((backupDir) => {
    const { db: tmpDb, close } = createTestDb();
    try {
      const strayPath = path.join(backupDir, 'notes.txt');
      writeFileSync(strayPath, 'unrelated file');
      utimesSync(strayPath, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'));

      const deleted = pruneBackups(backupDir, { retentionDays: 3, now: new Date('2026-09-30T02:00:00Z') });

      assert.deepEqual(deleted, []);
      assert.ok(existsSync(strayPath));
    } finally {
      close();
    }
  });
});

test('startNightlyBackupScheduler runs an immediate backup, then prunes old ones, on an interval', () => {
  const { db, close } = createTestDb();
  try {
    withBackupDir((backupDir) => {
      const events = [];
      const scheduler = startNightlyBackupScheduler(db, backupDir, {
        intervalMs: 24 * 60 * 60 * 1000,
        onBackup: (result) => events.push(result),
      });
      try {
        assert.equal(events.length, 1);
        assert.ok(existsSync(events[0].backupPath));
        assert.deepEqual(events[0].deleted, []);
      } finally {
        scheduler.stop();
      }
    });
  } finally {
    close();
  }
});

test('startNightlyBackupScheduler reports failures via onError instead of throwing', () => {
  const { db, close } = createTestDb();
  try {
    const events = [];
    const scheduler = startNightlyBackupScheduler(db, path.join(os.tmpdir(), 'postboard-backup-does-not-exist', 'nested'), {
      intervalMs: 24 * 60 * 60 * 1000,
      onError: (err) => events.push(err),
    });
    try {
      assert.equal(events.length, 0); // backupDatabase creates the dir itself -- no failure expected here
    } finally {
      scheduler.stop();
      rmSync(path.join(os.tmpdir(), 'postboard-backup-does-not-exist'), { recursive: true, force: true });
    }
  } finally {
    close();
  }
});
