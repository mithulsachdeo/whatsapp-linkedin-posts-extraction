// Migration convention: plain numbered `.sql` files in src/db/migrations/,
// applied in filename order, each tracked by name in a `schema_migrations`
// table so re-running migrate() is always a no-op for files already applied.
// Boring on purpose: no migration framework dependency, just SQL files + a
// ledger table, which is enough at this project's scale and is trivial to
// read top-to-bottom.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { backfillUnresolvedShortLinks } from './backfillUnresolvedShortLinks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// Ledger name for the one-time UNRESOLVED_SHORT_LINK backfill (ticket #11).
// Not a .sql file on disk -- the per-row logic isn't portable SQL -- but
// recorded in the same schema_migrations ledger so it still runs exactly
// once across every DB, same as a real migration file would.
const BACKFILL_SHORT_LINKS_NAME = '0003_backfill_unresolved_short_links';

/**
 * Apply any migrations in `migrationsDir` not yet recorded as applied.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} [migrationsDir]
 * @returns {string[]} names of migrations applied by this call
 */
export function migrate(db, migrationsDir = DEFAULT_MIGRATIONS_DIR) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  const applied = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map((row) => row.name)
  );

  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const newlyApplied = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${err.message}`, { cause: err });
    }
    newlyApplied.push(file);
  }

  if (!applied.has(BACKFILL_SHORT_LINKS_NAME)) {
    // Not wrapped in an outer BEGIN/COMMIT: backfillUnresolvedShortLinks
    // manages its own transaction per review item (SQLite has no nested
    // transactions).
    try {
      backfillUnresolvedShortLinks(db);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(BACKFILL_SHORT_LINKS_NAME);
    } catch (err) {
      throw new Error(`Migration ${BACKFILL_SHORT_LINKS_NAME} failed: ${err.message}`, { cause: err });
    }
    newlyApplied.push(BACKFILL_SHORT_LINKS_NAME);
  }

  return newlyApplied;
}
