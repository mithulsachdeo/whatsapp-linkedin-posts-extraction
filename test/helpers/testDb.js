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
      // On Windows, @libsql/client's native binding only releases its file
      // handle on GC of the client object, not synchronously on close() --
      // verified by reproduction (forcing a GC pass frees the handle
      // immediately; waiting without one does not, even for several
      // seconds). Retrying absorbs the common case; swallowing a residual
      // EPERM/EBUSY here just leaves an OS-tmp-dir leftover for the GC/OS to
      // reclaim later -- not a correctness issue for the test itself.
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      } catch (err) {
        if (err.code !== 'EPERM' && err.code !== 'EBUSY') throw err;
      }
    },
  };
}
