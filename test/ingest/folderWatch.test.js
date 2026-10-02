// Primary seam (per CLAUDE.md): the folder-watch poller exercised against a
// real temporary SQLite DB and a real temporary directory, asserted through
// the public query API -- it feeds files through the exact same ingest()
// pipeline manual upload uses, so these tests focus on polling/dedup
// behaviour (new file picked up, processed file skipped, replaced file
// re-ingested, bad file doesn't wedge the rest), not on parsing itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTestDb } from '../helpers/testDb.js';
import { pollFolders } from '../../src/ingest/folderWatch.js';
import { getDashboard } from '../../src/query/dashboard.js';
import { buildMinimalZip } from '../helpers/zip.js';

function withTempFolder(fn) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'postboard-watch-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('ingests a new .txt file found in the watched folder, attributing it to the folder\'s configured group', () => {
  const { db, close } = createTestDb();
  try {
    withTempFolder((dir) => {
      writeFileSync(
        path.join(dir, 'chat.txt'),
        '30/09/26, 10:15 - Priya Sharma: https://www.linkedin.com/posts/priya-sharma_activity-1-abcd'
      );

      const results = pollFolders(db, [{ path: dir, groupId: 'product-chai' }]);

      assert.equal(results.length, 1);
      assert.equal(results[0].status, 'INGESTED');
      assert.equal(results[0].result.newPosts, 1);

      const dashboard = getDashboard(db);
      assert.equal(dashboard.posts.length, 1);

      const event = db.prepare('SELECT group_id FROM sharing_events').get();
      assert.equal(event.group_id, 'product-chai');
    });
  } finally {
    close();
  }
});

test('does not re-ingest a file already marked processed on a later poll', () => {
  const { db, close } = createTestDb();
  try {
    withTempFolder((dir) => {
      writeFileSync(
        path.join(dir, 'chat.txt'),
        '30/09/26, 10:15 - Priya Sharma: https://www.linkedin.com/posts/priya-sharma_activity-1-abcd'
      );
      const folders = [{ path: dir, groupId: 'product-chai' }];

      pollFolders(db, folders);
      const second = pollFolders(db, folders);

      assert.equal(second.length, 0);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sharing_events').get().n, 1);
    });
  } finally {
    close();
  }
});

test('re-ingests a file whose mtime changed (replaced/edited export)', () => {
  const { db, close } = createTestDb();
  try {
    withTempFolder((dir) => {
      const filePath = path.join(dir, 'chat.txt');
      writeFileSync(filePath, '30/09/26, 10:15 - Priya Sharma: https://www.linkedin.com/posts/priya-sharma_activity-1-abcd');
      const folders = [{ path: dir, groupId: 'product-chai' }];
      pollFolders(db, folders);

      // Replace with a different export, nudging the mtime forward so the
      // poller treats it as a distinct file version.
      writeFileSync(filePath, '30/09/26, 10:16 - Arjun Das: https://www.linkedin.com/posts/arjun-das_activity-2-abcd');
      const future = new Date(Date.now() + 60_000);
      utimesSync(filePath, future, future);

      const results = pollFolders(db, folders);

      assert.equal(results.length, 1);
      assert.equal(results[0].status, 'INGESTED');
      assert.equal(getDashboard(db).posts.length, 2);
    });
  } finally {
    close();
  }
});

test('picks up a .zip export through the same adapter as manual upload', () => {
  const { db, close } = createTestDb();
  try {
    withTempFolder((dir) => {
      const zipBuffer = buildMinimalZip(
        'WhatsApp Chat.txt',
        '30/09/26, 10:15 - Priya Sharma: https://www.linkedin.com/posts/priya-sharma_activity-1-abcd'
      );
      writeFileSync(path.join(dir, 'export.zip'), zipBuffer);

      const results = pollFolders(db, [{ path: dir, groupId: 'product-chai' }]);

      assert.equal(results[0].status, 'INGESTED');
      assert.equal(getDashboard(db).posts.length, 1);
    });
  } finally {
    close();
  }
});

test('ignores non-.txt/.zip files in the watched folder', () => {
  const { db, close } = createTestDb();
  try {
    withTempFolder((dir) => {
      writeFileSync(path.join(dir, 'notes.pdf'), 'not a chat export');

      const results = pollFolders(db, [{ path: dir, groupId: 'product-chai' }]);

      assert.equal(results.length, 0);
      assert.equal(getDashboard(db).posts.length, 0);
    });
  } finally {
    close();
  }
});

test('a file that fails to ingest is marked processed (so it does not wedge every later poll) and reported', () => {
  const { db, close } = createTestDb();
  try {
    withTempFolder((dir) => {
      // A .zip with no .txt entry inside -- WhatsAppTxtAdapter.load throws.
      const emptyZip = buildMinimalZip('readme.md', 'no chat export here');
      writeFileSync(path.join(dir, 'export.zip'), emptyZip.subarray(0, 0)); // deliberately corrupt/empty

      const results = pollFolders(db, [{ path: dir, groupId: 'product-chai' }]);

      assert.equal(results.length, 1);
      assert.equal(results[0].status, 'FAILED');

      const second = pollFolders(db, [{ path: dir, groupId: 'product-chai' }]);
      assert.equal(second.length, 0); // not retried every poll
    });
  } finally {
    close();
  }
});

test('multiple watched folders map to their own configured group independently', () => {
  const { db, close } = createTestDb();
  try {
    withTempFolder((dirA) => {
      withTempFolder((dirB) => {
        writeFileSync(
          path.join(dirA, 'a.txt'),
          '30/09/26, 10:15 - Priya Sharma: https://www.linkedin.com/posts/priya-sharma_activity-1-abcd'
        );
        writeFileSync(
          path.join(dirB, 'b.txt'),
          '30/09/26, 10:16 - Arjun Das: https://www.linkedin.com/posts/arjun-das_activity-2-abcd'
        );

        pollFolders(db, [
          { path: dirA, groupId: 'product-chai' },
          { path: dirB, groupId: 'pm-collective' },
        ]);

        const groups = db.prepare('SELECT group_id FROM sharing_events ORDER BY group_id').all().map((r) => r.group_id);
        assert.deepEqual(groups, ['pm-collective', 'product-chai']);
      });
    });
  } finally {
    close();
  }
});

test('a missing/unavailable folder is reported but does not throw (best-effort polling)', () => {
  const { db, close } = createTestDb();
  try {
    const results = pollFolders(db, [{ path: path.join(os.tmpdir(), 'postboard-does-not-exist-xyz'), groupId: 'product-chai' }]);
    assert.equal(results.length, 1);
    assert.equal(results[0].status, 'FOLDER_UNAVAILABLE');
  } finally {
    close();
  }
});
