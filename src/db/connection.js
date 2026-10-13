// DB convention: Turso/libSQL via @libsql/client. The client is async (it talks
// to a networked DB in production, an in-memory/local file in dev/test), so this
// adapter exposes async versions of the shapes the codebase already uses:
// exec / executeMultiple / prepare().{get,all,run} / transaction(). Foreign-key
// enforcement is applied on open (journal-mode WAL is dropped -- that's a
// local-file concept and libSQL/Turso manages its own storage engine).
import { createClient } from '@libsql/client';

function wrap(exec) {
  return {
    exec: (sql) => exec({ sql, args: [] }).then(() => undefined),
    executeMultiple: (sql) => exec(sql),            // multi-statement scripts (migrations)
    prepare(sql) {
      return {
        get: async (...args) => (await exec({ sql, args })).rows[0],
        all: async (...args) => (await exec({ sql, args })).rows,
        run: async (...args) => {
          const r = await exec({ sql, args });
          // `changes` aliases rowsAffected -- the codebase reads result.changes
          // (node:sqlite idiom). Omit it and dedup/attribution silently break.
          // lastInsertRowid is a BigInt; callers Number() it.
          return { rowsAffected: r.rowsAffected, changes: r.rowsAffected, lastInsertRowid: r.lastInsertRowid };
        },
      };
    },
  };
}

export async function openDb(config) {
  const client = createClient(config);
  await client.execute('PRAGMA foreign_keys = ON');
  const base = wrap((stmt) => (typeof stmt === 'string' ? client.executeMultiple(stmt) : client.execute(stmt)));
  return {
    ...base,
    // Run many statements in ONE network round-trip, atomically (libSQL runs a
    // batch inside an implicit transaction). Each statement is {sql, args};
    // later statements see earlier ones' writes, so an INSERT can reference a
    // row an earlier INSERT in the same batch created. Returns one result per
    // statement (with the `changes` alias) so callers can count affected rows.
    // This is what makes bulk ingest fast over a networked DB — per-row round
    // trips would otherwise be thousands of network calls.
    async batch(statements, mode = 'write') {
      const results = await client.batch(statements, mode);
      return results.map((r) => ({
        rowsAffected: r.rowsAffected,
        changes: r.rowsAffected,
        lastInsertRowid: r.lastInsertRowid,
        rows: r.rows,
      }));
    },
    async transaction(fn) {
      const tx = await client.transaction('write');
      // Inside a transaction, statements run on `tx`, not the base client.
      const txAdapter = wrap((stmt) => (typeof stmt === 'string' ? tx.executeMultiple(stmt) : tx.execute(stmt)));
      try {
        const result = await fn(txAdapter);
        await tx.commit();
        return result;
      } catch (err) {
        await tx.rollback();
        throw err;
      }
    },
    close: () => client.close(),
  };
}
