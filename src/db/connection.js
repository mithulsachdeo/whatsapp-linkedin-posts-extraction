// DB convention: Node's built-in `node:sqlite` (DatabaseSync), not a third-party
// driver. It ships with Node itself (>=22.5, unflagged from Node 23.4+), which
// sidesteps native-module compilation entirely -- a real pain point on Windows
// hosts (node-gyp/Python toolchain) that better-sqlite3 would otherwise force
// on every contributor and deploy target. WAL mode is enabled on every file-backed
// connection; it is a no-op on ':memory:' (SQLite has no WAL for in-memory DBs).
import { DatabaseSync } from 'node:sqlite';

/**
 * Open a SQLite connection with WAL mode and sane defaults enabled.
 * @param {string} filename - path to the SQLite file, or ':memory:' for tests.
 * @returns {DatabaseSync}
 */
export function openDb(filename) {
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}
