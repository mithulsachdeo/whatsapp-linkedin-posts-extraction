import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWatchedFolders } from '../../src/ingest/watchedFolders.js';

test('returns an empty list when WATCHED_FOLDERS is unset (folder-watch off, manual upload only)', () => {
  assert.deepEqual(loadWatchedFolders({}), []);
});

test('parses a JSON array of {path, groupId} entries', () => {
  const env = {
    WATCHED_FOLDERS: JSON.stringify([
      { path: '/drive/product-chai', groupId: 'product-chai' },
      { path: '/drive/pm-collective', groupId: 'pm-collective' },
    ]),
  };
  assert.deepEqual(loadWatchedFolders(env), [
    { path: '/drive/product-chai', groupId: 'product-chai' },
    { path: '/drive/pm-collective', groupId: 'pm-collective' },
  ]);
});

test('rejects malformed JSON', () => {
  assert.throws(() => loadWatchedFolders({ WATCHED_FOLDERS: 'not json' }), /valid JSON/);
});

test('rejects a non-array value', () => {
  assert.throws(() => loadWatchedFolders({ WATCHED_FOLDERS: '{"path":"/x","groupId":"g"}' }), /JSON array/);
});

test('rejects an entry missing path or groupId', () => {
  assert.throws(
    () => loadWatchedFolders({ WATCHED_FOLDERS: JSON.stringify([{ path: '/x' }]) }),
    /WATCHED_FOLDERS\[0\]/
  );
});
