// The project-wide test harness: a real temporary SQLite file (not
// ':memory:', so WAL behaviour matches production) with migrations applied.
// Every seam test builds its fixtures through this and asserts through the
// public query API -- never by poking tables directly.
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../../src/db/connection.js';
import { migrate } from '../../src/db/migrate.js';

/**
 * @returns {{ db: import('node:sqlite').DatabaseSync, dir: string, close: () => void }}
 */
export function createTestDb() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'postboard-test-'));
  const dbPath = path.join(dir, 'test.sqlite');
  const db = openDb(dbPath);
  migrate(db);

  return {
    db,
    dir,
    close() {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
