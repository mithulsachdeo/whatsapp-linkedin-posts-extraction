// Nightly SQLite backup (ticket #11). Uses `VACUUM INTO` rather than a raw
// file copy: WAL mode (src/db/connection.js) means the data of record can be
// split across the main file and a -wal file, so copying just the main file
// risks a torn/stale snapshot. `VACUUM INTO` asks SQLite itself to write a
// complete, consistent, standalone copy -- safe to run against a live
// connection, no separate checkpoint step required.
//
// RESTORE PROCEDURE (manual, on the host):
//   1. Stop the app (so nothing is writing to the live db file).
//   2. Pick the desired backup from the backup directory, e.g.
//      data/backups/postboard-20260930-020000.sqlite
//   3. Copy it over the live db path (default data/postboard.sqlite),
//      replacing it: `cp data/backups/postboard-20260930-020000.sqlite data/postboard.sqlite`
//      Remove any stale data/postboard.sqlite-wal / -shm sidecar files first.
//   4. Restart the app. It reapplies migrations (a no-op if the backup is
//      already current) and resumes against the restored data.
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const FILE_PATTERN = /^postboard-(\d{8}-\d{6})\.sqlite$/;

function formatTimestamp(date) {
  // YYYYMMDD-HHMMSS in UTC -- colon-free so the filename is valid on every
  // host filesystem (notably Windows), and sorts lexicographically by age.
  const iso = date.toISOString(); // e.g. 2026-09-30T02:00:00.000Z
  const [datePart, timePart] = iso.split('T');
  return `${datePart.replace(/-/g, '')}-${timePart.slice(0, 8).replace(/:/g, '')}`;
}

/**
 * Writes a complete, independently-openable snapshot of `db` into
 * `backupDir`, named by `now`. Creates `backupDir` if missing.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} backupDir
 * @param {{ now?: Date }} [options]
 * @returns {string} absolute path to the backup file written
 */
export function backupDatabase(db, backupDir, options = {}) {
  const now = options.now ?? new Date();
  mkdirSync(backupDir, { recursive: true });

  const filename = `postboard-${formatTimestamp(now)}.sqlite`;
  const backupPath = path.join(backupDir, filename);

  db.prepare('VACUUM INTO ?').run(backupPath);
  return backupPath;
}

/**
 * Deletes backup files in `backupDir` older than `retentionDays`. Only
 * touches files matching the `postboard-<timestamp>.sqlite` naming
 * convention -- never anything else an admin might keep in that directory.
 * @param {string} backupDir
 * @param {{ retentionDays?: number, now?: Date }} [options]
 * @returns {string[]} absolute paths of files deleted
 */
export function pruneBackups(backupDir, options = {}) {
  const retentionDays = options.retentionDays ?? 7;
  const now = options.now ?? new Date();
  const cutoffMs = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;

  if (!existsSync(backupDir)) return [];

  const deleted = [];
  for (const entry of readdirSync(backupDir)) {
    if (!FILE_PATTERN.test(entry)) continue;
    const filePath = path.join(backupDir, entry);
    if (statSync(filePath).mtime.getTime() < cutoffMs) {
      unlinkSync(filePath);
      deleted.push(filePath);
    }
  }
  return deleted;
}

/**
 * Starts a nightly backup-then-prune cycle on an interval, running once
 * immediately so a backup exists without waiting a full interval. Mirrors
 * startFolderWatchPoller's shape (src/ingest/folderWatch.js): best-effort,
 * reports via callbacks rather than throwing, and never holds the process
 * open on its own.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} backupDir
 * @param {{ intervalMs?: number, retentionDays?: number, onBackup?: (result: { backupPath: string, deleted: string[] }) => void, onError?: (err: Error) => void }} [options]
 * @returns {{ stop: () => void }}
 */
export function startNightlyBackupScheduler(db, backupDir, options = {}) {
  const intervalMs = options.intervalMs ?? 24 * 60 * 60 * 1000;

  const run = () => {
    try {
      const backupPath = backupDatabase(db, backupDir);
      const deleted = pruneBackups(backupDir, { retentionDays: options.retentionDays });
      options.onBackup?.({ backupPath, deleted });
    } catch (err) {
      options.onError?.(err);
    }
  };

  run();
  const timer = setInterval(run, intervalMs);
  // Never hold the process open just for backups (e.g. tests, a CLI one-shot
  // run) -- the server's own listen() keeps it alive.
  timer.unref?.();

  return { stop: () => clearInterval(timer) };
}
