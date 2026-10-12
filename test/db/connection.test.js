import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../src/db/connection.js';
import { resolveDbConfig } from '../../src/db/config.js';

test('openDb runs exec, prepare/get/all/run against in-memory libSQL', async () => {
  const db = await openDb({ url: ':memory:' });
  await db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
  const r = await db.prepare('INSERT INTO t (name) VALUES (?)').run('alice');
  assert.equal(Number(r.lastInsertRowid), 1);
  assert.equal(r.changes, 1);            // C1: .changes must alias rowsAffected
  const noop = await db.prepare('UPDATE t SET name = ? WHERE id = ?').run('x', 999);
  assert.equal(noop.changes, 0);         // no-match → changes 0, like node:sqlite
  const row = await db.prepare('SELECT name FROM t WHERE id = ?').get(1);
  assert.equal(row.name, 'alice');
  const rows = await db.prepare('SELECT * FROM t').all();
  assert.equal(rows.length, 1);
  await db.close();
});

test('transaction commits on success and rolls back on throw', async () => {
  const db = await openDb({ url: ':memory:' });
  await db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, n INTEGER)');
  await db.transaction(async (tx) => {
    await tx.prepare('INSERT INTO t (n) VALUES (?)').run(1);
    await tx.prepare('INSERT INTO t (n) VALUES (?)').run(2);
  });
  assert.equal((await db.prepare('SELECT COUNT(*) c FROM t').get()).c, 2);
  await assert.rejects(db.transaction(async (tx) => {
    await tx.prepare('INSERT INTO t (n) VALUES (?)').run(3);
    throw new Error('boom');
  }));
  assert.equal((await db.prepare('SELECT COUNT(*) c FROM t').get()).c, 2);
  await db.close();
});

test('resolveDbConfig: test→memory, dev→file, prod→url+token', () => {
  assert.deepEqual(resolveDbConfig({ NODE_ENV: 'test' }), { url: ':memory:' });
  assert.deepEqual(resolveDbConfig({ DATABASE_URL: 'libsql://x', DATABASE_AUTH_TOKEN: 'tok' }), { url: 'libsql://x', authToken: 'tok' });
});
