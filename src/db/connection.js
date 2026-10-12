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
