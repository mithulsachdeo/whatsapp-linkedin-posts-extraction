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
 * @returns {Promise<{ db: import('../../src/db/connection.js').Adapter, dir: string, close: () => Promise<void> }>}
 */
export async function createTestDb() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'postboard-test-'));
  const dbPath = path.join(dir, 'test.sqlite');
  const db = await openDb({ url: `file:${dbPath}` });
  await migrate(db);

  return {
    db,
    dir,
    async close() {
      await db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
