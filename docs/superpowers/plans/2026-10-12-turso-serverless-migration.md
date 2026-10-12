# Turso + Free-Host Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Postboard's storage from on-disk `node:sqlite` to a networked Turso (libSQL) database so the app can run on a free host, converting the synchronous data layer to async with the test suite green at every step.

**Architecture:** Replace the synchronous `node:sqlite` connection seam (`openDb` → `DatabaseSync`) with a thin **async adapter** backed by `@libsql/client`. The adapter exposes the same shapes the code already uses (`exec`, `prepare(sql).{get,all,run}`, plus a `transaction()` helper), so each call site changes mechanically: add `await`, make the enclosing function `async`. The HTTP routes `await` the now-async query/command functions; the **view/render layer is untouched** because it already receives plain `data` objects, not the DB. The folder-watch poller and custom nightly-backup scheduler are removed (a networked DB on a sleeping free host can't run them; Turso provides its own backups). Tests run against an **in-memory libSQL** DB (`:memory:`) — same async client, no network — so the test seam matches production.

**Tech Stack:** Node ≥ 22.5 (pinned 24), Express 4, `@libsql/client` (libSQL/Turso), `node --test` + supertest. Host: Render **free** web service (no disk needed — DB is remote). DB: Turso free tier.

**Spec:** This plan has no separate design spec; it implements the hosting decision recorded in the 2026-10-12 session (free-host requirement → Turso + free serverless/persistent-process compute) and preserves the behavior specified in `docs/superpowers/specs/2026-09-30-linkedin-post-discovery-design.md` and decisions D1–D21. Behavior must not change; only the storage backend and sync→async shape change.

## Verified facts (libSQL spike, @libsql/client@0.18.0, 2026-10-12)

A throwaway spike confirmed the adapter design against the real library:
- `createClient({ url: ':memory:' })` works; `execute({ sql, args })` binds positional `?` from the array.
- Result shape: `{ columns, columnTypes, rows (array of name-accessible objects), rowsAffected (number), lastInsertRowid (BigInt) }`.
- **`intMode` defaults to `number`** — SELECTed INTEGER columns are JS numbers, so `row.id === Number(x)` holds. No `intMode` config needed.
- `lastInsertRowid` is a **BigInt** → `Number()` it (already done at the 3 sites: `aliases.js:46`, `ingest.js:214,404`).
- `rowsAffected` behaves exactly like node:sqlite's `.changes` (1 on match, 0 on no-match) — this is the C1 fix.
- `executeMultiple(script)` runs multi-statement SQL; `execute()` also accepts multi-statement but we still use `executeMultiple` for migration files.
- `transaction('write')` exposes `execute`, `executeMultiple`, `batch`; **commit persists, rollback undoes** (verified).
- `PRAGMA foreign_keys = ON` enforces `ON DELETE CASCADE` on the embedded path and stays on for later statements. **Remote-Turso FK enforcement is still unverified** — confirm in Task 14 against a real `libsql://` DB (the schema relies on cascade deletes in `ingest.js:339,367` and `otherLinkedIn.js`).

## Audit corrections folded in

This plan was revised after a codebase audit. Key corrections: the adapter exposes `changes` (C1); `ingest.js` has **3** transactions not 1 (C2, Task 8); transaction bodies must thread `tx` into the shared single-statement helpers (C3, Tasks 5/6/8); the real test seam is **`createTestDb`** in `test/helpers/testDb.js`, made async in a dedicated Task 2b (M1); the WAL assertion and two string-`:memory:` tests are fixed (M2/M3); `watchedFolders.js` is deleted with folder-watch (M4); the post-commit path is two `Promise.all` passes returning `*Settled` (M5). The nested-transaction fear was investigated and is **unfounded** — no transaction-wrapped function calls another.

## Global Constraints

- **No behavior change.** Every existing test must still pass (adjusted only for `await`). The dashboard, attribution, dedup, review, import, preview, date-range, and gutter features behave identically. 258 tests is the floor.
- **Node ≥ 22.5, pinned to 24** (`node:sqlite` is gone, but `@libsql/client` and top-level `await` in ESM need a modern Node; keep `.node-version` = 24 and `engines.node >=22.5.0`).
- **ESM, `type: module`** — no CommonJS. Match existing style (template-literal views, `esc()`, no new frameworks).
- **Positional params only** — libSQL `execute({ sql, args })` takes a positional `args` array; the codebase already uses `?` placeholders with positional params. Do not introduce named params.
- **`lastInsertRowid` is a BigInt** in libSQL results — wrap in `Number(...)` wherever an id flows into app logic or JSON (natural keys, created member ids, post ids).
- **Multi-statement SQL** (migration files, PRAGMAs) uses `client.executeMultiple(sqlString)`, never `execute` (which is single-statement).
- **Transactions** use the adapter's `transaction()` helper (interactive write transaction), never raw `exec('BEGIN')` — libSQL needs an explicit transaction object.
- **Secrets never committed.** `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `ADMIN_TOKEN` come from env only.
- **Branch:** do all work on `feat/turso-migration` off `design/industry-new2`. Commit per task. Do not push or merge until the full suite is green and a manual smoke test passes.

---

## File Structure

- `src/db/connection.js` — **rewrite.** `openDb(config)` returns the async adapter (not `DatabaseSync`). Houses the adapter: `exec`, `executeMultiple`, `prepare(sql).{get,all,run}`, `transaction(fn)`, `close`.
- `src/db/config.js` — **create.** Resolves libSQL connection config from env: production `{ url: libsql://…, authToken }`; dev `{ url: 'file:data/postboard.db' }`; test `{ url: ':memory:' }`. One place so routes/tests/scripts agree.
- `src/db/migrate.js` — **modify.** `migrate(db)` → `async function migrate(db)`; use `executeMultiple` per migration file; wrap the version bump in `db.transaction`.
- `src/query/dashboard.js`, `src/query/review.js` — **modify.** Exported functions become `async`; every `.prepare().get/all` becomes `await db.…`.
- `src/ingest/ingest.js` — **modify.** `ingest(...)` becomes async; the one big write transaction ported to `db.transaction`. Highest-risk file (30 sites, dedup + attribution atomicity).
- `src/identity/aliases.js`, `src/review/otherLinkedIn.js`, `src/db/backfillUnresolvedShortLinks.js` — **modify.** Async + their transaction blocks ported to `db.transaction`.
- `src/preview/previewCache.js` — **modify.** Async.
- `src/http/app.js` — **modify.** Route handlers become `async`; `await` every query/command call. Views unchanged.
- `src/server.js` — **modify.** `await migrate(db)`; **remove** `startFolderWatchPoller` and `startNightlyBackupScheduler` wiring. Keep `app.listen`.
- `src/ingest/folderWatch.js`, `src/db/backup.js` — **delete** (folder-watch and custom backup are dropped). Remove their tests.
- `test/helpers/*`, all `test/**/*.test.js` touching the DB — **modify.** Open the in-memory libSQL DB via `openDb`/config; `await migrate`; `await` query/command calls.
- `render.yaml` — **rewrite** to a free web service (no disk) with Turso env vars.
- `DEPLOY.md` — **rewrite** for Turso provisioning + Render free.
- `package.json` — **modify.** Add `@libsql/client`; `start` unchanged.
- `.env.example` — **modify.** Add `DATABASE_URL`, `DATABASE_AUTH_TOKEN`.

### The one mechanical pattern (applies to every call-site conversion below)

The adapter makes the change uniform. Learn it once:

| Before (`node:sqlite`, sync) | After (adapter, async) |
|---|---|
| `const row = db.prepare(sql).get(a, b);` | `const row = await db.prepare(sql).get(a, b);` |
| `const rows = db.prepare(sql).all(...p);` | `const rows = await db.prepare(sql).all(...p);` |
| `const r = db.prepare(sql).run(a);` then `r.lastInsertRowid` | `const r = await db.prepare(sql).run(a);` then `Number(r.lastInsertRowid)` |
| `db.exec('PRAGMA …')` | `await db.exec('PRAGMA …')` |
| `db.exec('BEGIN'); …; db.exec('COMMIT');` | `await db.transaction(async (tx) => { … use tx … });` |

Any function containing one of these becomes `async` and returns a `Promise`; every caller `await`s it. The ripple stops at the Express route (made `async`) — views are not in the chain.

---

### Task 1: Async DB adapter + connection config

**Files:**
- Create: `src/db/config.js`
- Modify: `src/db/connection.js` (full rewrite)
- Modify: `package.json` (add `@libsql/client`)
- Test: `test/db/connection.test.js` (create)

**Interfaces:**
- Produces: `resolveDbConfig(env = process.env) → { url: string, authToken?: string }`
- Produces: `async openDb(config) → Adapter` where
  `Adapter = { exec(sql): Promise<void>, executeMultiple(sql): Promise<void>, prepare(sql): { get(...a): Promise<object|undefined>, all(...a): Promise<object[]>, run(...a): Promise<{ rowsAffected: number, changes: number, lastInsertRowid: bigint }> }, transaction(fn: (tx: Adapter) => Promise<T>): Promise<T>, close(): Promise<void> }`

- [ ] **Step 1: Add the dependency**

Run: `npm install @libsql/client`
Confirm it appears under `dependencies` in `package.json`.

- [ ] **Step 2: Write the failing test**

```javascript
// test/db/connection.test.js
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
```

- [ ] **Step 2b: Run it to confirm it fails**

Run: `node --test test/db/connection.test.js`
Expected: FAIL (`openDb` still returns `DatabaseSync`; `resolveDbConfig` undefined).

- [ ] **Step 3: Write `src/db/config.js`**

```javascript
// Resolves the libSQL connection config from the environment. One source of
// truth so routes, scripts and tests agree. Tests use an in-memory DB; dev
// falls back to a local file; prod requires a Turso URL + auth token.
export function resolveDbConfig(env = process.env) {
  if (env.NODE_ENV === 'test') return { url: ':memory:' };
  if (env.DATABASE_URL) {
    const cfg = { url: env.DATABASE_URL };
    if (env.DATABASE_AUTH_TOKEN) cfg.authToken = env.DATABASE_AUTH_TOKEN;
    return cfg;
  }
  return { url: 'file:data/postboard.db' };
}
```

- [ ] **Step 4: Rewrite `src/db/connection.js`**

```javascript
// DB convention: Turso/libSQL via @libsql/client. The client is async (it talks
// to a networked DB in production, an in-memory/local file in dev/test), so this
// adapter exposes async versions of the shapes the codebase already uses:
// exec / executeMultiple / prepare().{get,all,run} / transaction(). WAL/foreign-
// keys PRAGMAs are applied on open (no-ops on :memory:).
import { createClient } from '@libsql/client';

function wrap(exec) {
  return {
    exec: (sql) => exec({ sql, args: [] }).then(() => undefined),
    executeMultiple: (sql) => exec(sql),            // see note in transaction()
    prepare(sql) {
      return {
        get: async (...args) => (await exec({ sql, args })).rows[0],
        all: async (...args) => (await exec({ sql, args })).rows,
        run: async (...args) => {
          const r = await exec({ sql, args });
          // `changes` aliases rowsAffected — the codebase reads result.changes
          // (node:sqlite idiom, e.g. insertSharingEvent at ingest.js:385). Omit
          // it and dedup/attribution silently break (C1). lastInsertRowid is a
          // BigInt; callers Number() it.
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
    _client: client,
  };
}
```

Note: `executeMultiple` on the base client is used by `migrate` for multi-statement migration scripts. WAL is not set — libSQL/Turso manages its own storage engine; `PRAGMA journal_mode=WAL` is a local-file concept and is dropped.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test test/db/connection.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/db/config.js src/db/connection.js test/db/connection.test.js
git commit -m "feat: async libSQL DB adapter replacing node:sqlite connection"
```

---

### Task 2: Async migrations

**Files:**
- Modify: `src/db/migrate.js`
- Test: `test/db/migrate.test.js` (modify if present; else fold into connection test)

**Interfaces:**
- Consumes: `openDb` adapter from Task 1.
- Produces: `async function migrate(db): Promise<void>` — idempotent; applies pending SQL migration files in order inside a transaction and records the version.

- [ ] **Step 1: Convert `migrate` to async**

In `src/db/migrate.js`:
- Make `export async function migrate(db)`.
- Replace the schema-version read (`db.prepare('PRAGMA user_version').get()` or the versions table query) with `await`.
- For each pending migration file, run its SQL via `await db.executeMultiple(fileSql)` (migration files contain multiple statements).
- Wrap each migration's apply + version bump in `await db.transaction(async (tx) => { await tx.executeMultiple(fileSql); await tx.prepare('…set version…').run(version); })`.
- Remove the raw `db.exec('BEGIN'/'COMMIT'/'ROLLBACK')` lines.
- Keep the existing "backfill is not wrapped in the outer transaction" behavior: call `await backfillUnresolvedShortLinks(db)` (now async, Task 8-adjacent) **after** its migration's transaction commits.

- [ ] **Step 2: Update `test/db/migrate.test.js` (M3)**

- Change `const db = openDb(...)` to `const db = await openDb({ url: ':memory:' })` and every `migrate(db)` call (lines ~27, ~116) to `await migrate(db)` (it returns a Promise now; keep asserting on its resolved return array if those assertions exist).
- **Delete the WAL assertion** at lines ~34-39 (`PRAGMA journal_mode` → `'wal'`): WAL is dropped (libSQL manages storage) and the test seam is `:memory:`. Replace it, if a positive check is wanted, with a schema-exists assertion: `assert.ok(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='posts'").get())`.
- `await` any other query in the test.

- [ ] **Step 3: Run**

Run: `node --test test/db/migrate.test.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/db/migrate.js test/db/migrate.test.js
git commit -m "feat: async migrations via executeMultiple + transaction"
```

---

### Task 2b: Make the test harness async (M1 — the biggest mechanical change)

**Files:**
- Modify: `test/helpers/testDb.js` (the real test seam)
- Modify: `test/http/card-motion-animation.test.js`, `test/http/edition-dispatches.test.js` (M2 — they open the DB directly with a string)

**Interfaces:**
- Produces: `async createTestDb() → { db: Adapter, close: () => Promise<void> }`

Why this task exists: **~24 of 30 DB-touching test files get their DB via `const { db, close } = createTestDb();`** (`test/helpers/testDb.js:14-27`), which today calls the sync `openDb(dbPath)` + sync `migrate(db)` against a temp **file**. Once those are async, `createTestDb` and its `close()` are async, so **every** call site becomes `const { db, close } = await createTestDb();` and `await close();`. Do this once here so Tasks 3-9 can rely on it; those tasks' "update the tests to await" steps then mean only awaiting the query/command calls, not re-plumbing DB setup.

- [ ] **Step 1: Rewrite `createTestDb` to async in-memory**

```javascript
// test/helpers/testDb.js
import { openDb } from '../../src/db/connection.js';
import { migrate } from '../../src/db/migrate.js';

export async function createTestDb() {
  const db = await openDb({ url: ':memory:' });
  await migrate(db);
  return { db, close: () => db.close() };
}
```

(Drops the temp-file plumbing — `:memory:` is faster and isolated per call. Remove any `fs`/`os.tmpdir`/unlink code and the sync `node:sqlite` import.)

- [ ] **Step 2: Convert the two direct-open tests (M2)**

In `test/http/card-motion-animation.test.js:9` and `test/http/edition-dispatches.test.js:9`, change `const db = openDb(':memory:'); migrate(db);` to:

```javascript
const db = await openDb({ url: ':memory:' });
await migrate(db);
```

(and make the enclosing `beforeEach`/test `async`). These are not `*.route.test.js`, so they're easy to miss — they're listed here explicitly.

- [ ] **Step 3: Run the full suite to see the blast radius**

Run: `node --test`
Expected: MANY failures (every test using `createTestDb` now gets a Promise, not `{db, close}`). This is expected — Tasks 3-9 convert each call site to `await createTestDb()` as part of converting that area's tests. Do not try to fix all call sites here; fix them task-by-task so each stays reviewable. Commit the harness change alone.

- [ ] **Step 4: Commit**

```bash
git add test/helpers/testDb.js test/http/card-motion-animation.test.js test/http/edition-dispatches.test.js
git commit -m "test: async createTestDb harness (:memory:) + direct-open tests"
```

Note for all of Tasks 3-9: wherever a test does `const { db, close } = createTestDb()` / `close()`, make it `await createTestDb()` / `await close()`, and make the enclosing hook/test `async`.

---

### Task 3: Convert `src/query/dashboard.js` (read-only, 15 sites)

**Files:**
- Modify: `src/query/dashboard.js`
- Test: `test/query/dashboard.test.js`, `test/query/dashboard.dateRange.test.js`

**Interfaces:**
- Produces (all now async, same params/returns otherwise):
  `async getDashboard(db, options) → { posts, lastUpdated }`,
  `async getMemberFilterOptions(db) → { totalCount, pendingCount, members }`,
  `async getPostDetail(db, postId) → detail|null`,
  `async getPostUrl(db, postId) → string|null`,
  `async getDateRangeBounds(db, options) → { min, max }|null`.

- [ ] **Step 1: Update the tests first (they define the async contract)**

In both dashboard test files: make every test callback `async`; change DB setup to `const { db, close } = await createTestDb();` and `await close();` (per Task 2b); change each `getDashboard(db, …)` / `getMemberFilterOptions(db)` / `getPostDetail(db, …)` / `getPostUrl(db, …)` / `getDateRangeBounds(db, …)` call to `await`; change seed inserts to `await db.prepare(...).run(...)`.

- [ ] **Step 2: Run to confirm failure**

Run: `node --test test/query/dashboard.test.js test/query/dashboard.dateRange.test.js`
Expected: FAIL (functions still sync / return non-awaited values).

- [ ] **Step 3: Convert the module**

Apply the mechanical pattern to all 15 sites: make the five exported functions `async`; `await` every `db.prepare(...).get/all`; in `getSharersByPost` (a helper) make it `async` and `await` its caller. `istDateRange.js` is pure date math — **do not touch it**.

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/query/dashboard.test.js test/query/dashboard.dateRange.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/query/dashboard.js test/query/dashboard.test.js test/query/dashboard.dateRange.test.js
git commit -m "refactor: async dashboard queries"
```

---

### Task 4: Convert `src/query/review.js` (read-only, 7 sites)

**Files:**
- Modify: `src/query/review.js`
- Test: the review-query tests (and any `test/http/review.route.test.js` setup that calls these directly).

**Interfaces:**
- Produces: `async getUnknownSenderReviewItems(db)`, `async getOtherLinkedInReviewItems(db)`, `async getMembers(db)` — same returns, now Promises.

- [ ] **Step 1: Update tests to `await` these three functions and the DB setup.**
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Make the three functions `async`; `await` all `.prepare().all/get`.**
- [ ] **Step 4: Run → PASS.** `node --test test/query/review.test.js`
- [ ] **Step 5: Commit** `refactor: async review queries`

---

### Task 5: Convert `src/identity/aliases.js` (19 sites, 3 transactions)

**Files:**
- Modify: `src/identity/aliases.js`
- Test: `test/identity/aliases.test.js` (or wherever alias mapping is tested)

**Interfaces:**
- Produces: `async mapAliasToMember(db, rawSender, memberId)`, `async createMemberAndMapAlias(db, rawSender, name) → number (createdMemberId, Number())`, `async undoAliasMapping(db, rawSender, opts)`.

- [ ] **Step 1: Update tests to `await` all three + DB setup.**
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Convert.** Make the three functions `async`. Replace each `db.exec('BEGIN') … db.exec('COMMIT')/db.exec('ROLLBACK')` block with:

```javascript
return await db.transaction(async (tx) => {
  // ...the statements that were between BEGIN and COMMIT, each awaited on `tx`...
  // e.g. const r = await tx.prepare('INSERT INTO members (display_name) VALUES (?)').run(name);
  //      const memberId = Number(r.lastInsertRowid);
  //      await tx.prepare('INSERT INTO aliases (member_id, raw_sender) VALUES (?, ?)').run(memberId, rawSender);
  //      return memberId;
});
```

Ensure `createMemberAndMapAlias` returns `Number(r.lastInsertRowid)` (BigInt → number). Remove all raw BEGIN/COMMIT/ROLLBACK.

**C3 — thread `tx`, not `db`, into helpers inside a transaction.** These functions call a shared single-statement helper `mapAliasToMemberTx(db, …)` (`aliases.js:9`). Inside the `db.transaction(async (tx) => …)` body, every helper and statement MUST use `tx`: `await mapAliasToMemberTx(tx, …)`, `await tx.prepare(...).run(...)`. If any statement inside the transaction still uses the outer `db`, it runs OUTSIDE the transaction (atomicity broken) and will **block/deadlock** against the open write transaction. The helper needs no change — `tx` and `db` share the adapter interface; only the argument passed changes.

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `refactor: async alias identity ops with transaction helper`

---

### Task 6: Convert `src/review/otherLinkedIn.js` (14 sites, 2 transactions)

**Files:**
- Modify: `src/review/otherLinkedIn.js`
- Test: `test/review/otherLinkedIn.test.js`

**Interfaces:**
- Produces: `async dismissOtherLinkedInItem(db, id) → boolean`, `async promoteOtherLinkedInItem(db, id) → boolean`, `async undoOtherLinkedInAction(db, id)`.

- [ ] **Step 1: Update tests to `await` + async setup.**
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Convert** the three functions to async; port both transaction blocks (`otherLinkedIn.js:53, 109`) to `db.transaction` (pattern from Task 5); `Number()` any `lastInsertRowid` that becomes a post/event id. **C3:** inside each transaction, call the shared helpers from `ingest.js` (`insertSharingEvent`, `touchPostTimestamps`, `upsertPost`, etc.) and all statements with **`tx`**, never the outer `db`. Note `promoteOtherLinkedInItem` reads `result.changes` via `insertSharingEvent` (`otherLinkedIn.js:70`) — this works because the adapter exposes `changes` (C1); its `sharingEventInserted` flag drives the undo path (`:114`), so verify the promote/undo tests still pass.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `refactor: async other-LinkedIn review ops`

---

### Task 7: Convert `src/preview/previewCache.js` (3 sites)

**Files:**
- Modify: `src/preview/previewCache.js`
- Test: `test/preview/previewCache.test.js`

**Interfaces:**
- Produces: `async setPreviewOverride(db, postId, fields)`, and any getters/setters it exports — all async, same returns.

- [ ] **Step 1: Update tests to `await`.**
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Make exports async; `await` all `.prepare().get/all/run`.**
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `refactor: async preview cache`

---

### Task 8: Convert `src/ingest/ingest.js` + `src/db/backfillUnresolvedShortLinks.js` (30 + 6 sites, **3 ingest transactions** + 1 backfill) — highest risk

**Files:**
- Modify: `src/ingest/ingest.js`
- Modify: `src/db/backfillUnresolvedShortLinks.js`
- Test: `test/ingest/ingest.test.js`, `test/ingest/previewFetch.test.js`, `test/ingest/shortLink.test.js` (and any import-route test setup)

**Interfaces:**
- Produces: `async ingest(db, text, groupId, opts) → result`. **Same result shape, and it MUST still return `previewFetchesSettled` and `shortLinkResolutionsSettled`** (promises the tests await for deterministic completion — `previewFetch.test.js`, `shortLink.test.js`). Best-effort preview/short-link work fires **after** the transaction commits; failures must not fail the ingest.
- Produces: `async backfillUnresolvedShortLinks(db)`.

**C2 — `ingest.js` has THREE transactions, not one:** `ingest.js:69` (main write path), `ingest.js:322` (`mergeOrRekeyShortLinkPost`), and `ingest.js:355` (`reclassifyShortLinkPostAsOtherLinkedIn`). The latter two run in the post-commit short-link path (each its own standalone transaction). **All three** must be ported to `db.transaction`; leaving any as raw `db.exec('BEGIN')` silently disconnects its statements from the transaction.

- [ ] **Step 1: Update the three ingest test files** to `await createTestDb()` / `await close()`, `await ingest(...)`, `await` all result-verification queries, and **keep awaiting `result.previewFetchesSettled` / `result.shortLinkResolutionsSettled`** where the tests already do (`previewFetch.test.js:55`, `shortLink.test.js`). These tests assert dedup/attribution invariants AND `newSharingEvents` counts (which depend on the C1 `.changes` fix) — they are the safety net; do not weaken them.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Convert `backfillUnresolvedShortLinks.js`** first (migrate depends on it): make it `async`; port its per-item BEGIN/COMMIT/ROLLBACK (`:34`) to `await db.transaction(async (tx) => …)` per item; **thread `tx` into every statement and helper inside** (C3); `await` all; `Number()` ids.

- [ ] **Step 4: Convert `ingest.js` — all three transactions.** Make `ingest` async and every helper it awaits async (`upsertPost`, `resolveMember`, `insertSharingEvent`, `touchPostTimestamps`, `ensureUnknownSenderReviewItem`, `ensureOtherLinkedInReviewItem`, `recordImportBatch`).
  - **Main transaction (`:69`):** wrap the write path in `await db.transaction(async (tx) => { … })`. **C3: pass `tx` into every helper call inside** — `await upsertPost(tx, …)`, `await insertSharingEvent(tx, …)`, `await touchPostTimestamps(tx, …)`, etc. (currently `ingest.js:101,113,116,120,130,135` pass `db`). A helper left on the outer `db` runs outside the transaction and will deadlock against it.
  - **`mergeOrRekeyShortLinkPost` (`:322`)** and **`reclassifyShortLinkPostAsOtherLinkedIn` (`:355`):** port each to its own `await db.transaction(...)`, `tx`-threaded. These depend on FK cascade deletes (`:339, :367`) — confirmed working on the embedded path by the spike.
  - `Number()` every `lastInsertRowid` used as an id (already done at `:214, :404`).
  - `insertSharingEvent` returns `result.changes > 0` (`:385`) — now correct because the adapter exposes `changes` (C1). Do not change the call site.
  - **Post-commit best-effort (M5):** keep the real structure — two `Promise.all` passes over `newPostFetchTargets` and `shortLinkResolveTargets` (`ingest.js:149-184`), returned as `previewFetchesSettled` / `shortLinkResolutionsSettled`. `await` the now-async `cacheFetchedPreview` / `markPreviewUnavailable` inside `applyShortLinkResolution` (`:289, :291`). Do NOT replace this with a simple loop — the tests await these two promises.

- [ ] **Step 5: Run → PASS.** `node --test test/ingest/ingest.test.js test/ingest/previewFetch.test.js test/ingest/shortLink.test.js`

- [ ] **Step 6: Commit** `refactor: async ingest pipeline (3 txns, tx-threaded) + short-link backfill`

---

### Task 9: Convert the HTTP layer `src/http/app.js`

**Files:**
- Modify: `src/http/app.js`
- Test: all `test/http/*.route.test.js` (they already go through supertest — mostly need async DB setup + `await` on any direct query calls in their arrange steps).

**Interfaces:**
- Consumes: every now-async query/command function from Tasks 3–8.
- Produces: unchanged routes and responses; handlers are now `async (req, res) => { … }` and `await` each data call.

- [ ] **Step 1: Update route-test setup** across `test/http/*` to `const { db, close } = await createTestDb(); … await close();` (per Task 2b) and `await` any direct `getMembers`/`ingest`/etc. calls used to arrange state. (The two string-`:memory:` files are already handled in Task 2b.) Supertest assertions on responses stay the same.

- [ ] **Step 2: Run the HTTP suite → FAIL** (handlers not yet awaiting).
Run: `node --test test/http/`

- [ ] **Step 3: Convert `app.js`.** For each route that calls a query/command: make the handler `async` and `await` the call (`getDashboard`, `getMemberFilterOptions`, `getDateRangeBounds`, `getPostDetail`, `getPostUrl`, `getMembers`, `getUnknownSenderReviewItems`, `getOtherLinkedInReviewItems`, `ingest`, `mapAliasToMember`, `createMemberAndMapAlias`, `undoAliasMapping`, `dismiss/promote/undoOtherLinkedInItem`, `setPreviewOverride`). Wrap each handler body in `try { … } catch (err) { next(err) }` so a rejected promise returns 500 rather than hanging (Express 4 does NOT auto-catch async rejections, and `createApp` has no error middleware today — the default handler returns 500, which is the intended behavior). The **view calls stay synchronous** (`renderDashboard(data, …)` etc.) — only the data fetch before them is awaited.

  **Watch the `.find()` chains:** sites like `getMembers(db).find(...)` (`app.js:107, 169, 389, 401, 441, 451`) become `(await getMembers(db)).find(...)` — the parentheses matter (`await getMembers(db).find(...)` awaits the wrong thing).

- [ ] **Step 4: Run the HTTP suite → PASS.**

- [ ] **Step 5: Commit** `refactor: async Express route handlers`

---

### Task 10: Server bootstrap + drop folder-watch & custom backup

**Files:**
- Modify: `src/server.js`
- Delete: `src/ingest/folderWatch.js`, `src/db/backup.js`, **`src/ingest/watchedFolders.js`** (M4 — only folder-watch uses it; orphaned once folder-watch is gone)
- Delete: their tests (`test/ingest/folderWatch*.test.js`, `test/db/backup*.test.js`, **`test/ingest/watchedFolders.test.js`** if present)
- Modify: any imports of the deleted modules (search for `folderWatch`, `watchedFolders`, `loadWatchedFolders`, `backup`).

**Interfaces:**
- Produces: a server that `await openDb(resolveDbConfig())`, `await migrate(db)`, builds the app, and `app.listen(PORT)`. No background schedulers.

- [ ] **Step 1: Rewrite `src/server.js` bootstrap**

```javascript
import { createApp } from './http/app.js';
import { openDb } from './db/connection.js';
import { resolveDbConfig } from './db/config.js';
import { migrate } from './db/migrate.js';
import { HttpPreviewFetcher } from './preview/previewFetcher.js';
import { HttpShortLinkResolver } from './ingest/shortLinkResolver.js';

const PORT = process.env.PORT ?? 3000;
const db = await openDb(resolveDbConfig());
await migrate(db);
const app = createApp(db, { previewFetcher: HttpPreviewFetcher, shortLinkResolver: HttpShortLinkResolver });
app.listen(PORT, () => console.log(`Postboard listening on http://localhost:${PORT}`));
```

(Top-level `await` is valid in an ESM entrypoint. `createApp`'s `adminToken` still comes from `options.adminToken ?? process.env.ADMIN_TOKEN`.)

- [ ] **Step 2: Delete** `src/ingest/folderWatch.js`, `src/db/backup.js`, `src/ingest/watchedFolders.js`, and their tests. Remove `loadWatchedFolders`/`startFolderWatchPoller`/`startNightlyBackupScheduler` imports anywhere (search the repo). (The `watched_files` table from migration `0002` stays in the ledger — a harmless dead table; do not write a down-migration.)

- [ ] **Step 3: Run the FULL suite** `node --test` — expected PASS (now fewer tests after the deletions, but zero failures). Record the new count.

- [ ] **Step 4: Commit** `refactor: async server bootstrap; drop folder-watch + custom backup (Turso-managed)`

---

### Task 11: Smoke test against a local libSQL file

**Files:** none (manual verification).

- [ ] **Step 1: Start the server against a local libSQL file**

Run (bash): `ADMIN_TOKEN=test-admin-1234 DATABASE_URL=file:data/postboard.db PORT=3000 node src/server.js`
Expected: boots, prints the listening line, creates `data/postboard.db`.

- [ ] **Step 2: Verify end-to-end in a browser** (main agent, per L2): load `/` (empty state renders), log in with the token, import a small WhatsApp `.txt` export, confirm posts appear with attribution, exercise the member filter + date-range filter + Read/Unread + gutter close. Confirm the gutters still render.

- [ ] **Step 3: Commit** (if any fixes were needed) and note results.

---

### Task 12: Deploy config — Render free + Turso provisioning

**Files:**
- Modify: `render.yaml` (rewrite to free web service, no disk)
- Modify: `DEPLOY.md`
- Modify: `.env.example`

**Interfaces:** none (config/docs).

- [ ] **Step 1: Rewrite `render.yaml`** to a free web service with Turso env (no `disk:` block):

```yaml
services:
  - type: web
    name: postboard
    runtime: node
    plan: free
    branch: design/industry-new2
    buildCommand: npm install
    startCommand: node src/server.js
    healthCheckPath: /
    envVars:
      - key: NODE_VERSION
        value: "24"
      - key: DATABASE_URL
        sync: false          # libsql://<db>-<org>.turso.io — set in dashboard
      - key: DATABASE_AUTH_TOKEN
        sync: false          # Turso db token — set in dashboard (secret)
      - key: ADMIN_TOKEN
        sync: false          # admin password — set in dashboard (secret)
```

- [ ] **Step 2: Rewrite `DEPLOY.md`** with the free-host flow: (a) install Turso CLI, `turso auth signup`, `turso db create postboard`, `turso db show postboard --url`, `turso db tokens create postboard`; (b) Render → New → Blueprint → set the three secrets; (c) free-tier caveats: service sleeps after ~15 min idle (cold start), Turso free limits are generous for this scale, backups are Turso-managed (`turso db shell`/point-in-time), lower the multer upload limit if large imports OOM the 512 MB free instance.

- [ ] **Step 3: Update `.env.example`** to add `DATABASE_URL=` and `DATABASE_AUTH_TOKEN=` with comments; note that unset `DATABASE_URL` means a local `file:data/postboard.db`.

- [ ] **Step 4: Commit** `chore: Render-free + Turso deploy config and docs`

---

### Task 13: Protect the free instance from large uploads (guard)

**Files:**
- Modify: `src/http/app.js` (multer limit)
- Test: `test/http/import.route.test.js` (add an oversize-rejection assertion)

**Interfaces:** unchanged routes; a smaller max upload size.

- [ ] **Step 1: Write a failing test** asserting a request body over the new limit (e.g. 50 MB) to `/import` is rejected with a 413/clear error rather than processed.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Lower the multer `limits.fileSize`** from `200 * 1024 * 1024` to `50 * 1024 * 1024` and ensure the multer error surfaces as a clean import-page error (not a crash). (Rationale: the free instance has ~512 MB RAM and multer buffers in memory; WhatsApp *text* exports are small — media isn't parsed.)
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `fix: cap import upload at 50MB to protect the free instance`

---

### Task 14: Full verification + finish

- [ ] **Step 1: Run the full suite** `node --test` — zero failures. Record the final count.
- [ ] **Step 2: Provision a real Turso DB** (user action — needs their account) and smoke-test the server against the real `libsql://` URL + token locally: `ADMIN_TOKEN=… DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… node src/server.js`, import a small export, confirm it persists across a restart.
- [ ] **Step 3: Merge** `feat/turso-migration` → `design/industry-new2` (fast-forward) and push.
- [ ] **Step 4: Deploy on Render** (user action) per `DEPLOY.md`; verify the live URL, login, and an import that survives a sleep/wake cycle.

---

## Self-Review

**Spec coverage:** The migration preserves all behavior (D1–D21, the design spec) — every existing test is converted, not removed, except the folder-watch and custom-backup suites whose features are intentionally dropped (Task 10) and replaced by Turso-managed backups. Hosting requirement (free) is met by Render free + Turso (Tasks 12–14). The sync→async conversion is covered file-by-file (Tasks 1–10) and the two sharp risks are addressed: the whole data layer is converted with tests green per step, and the upload-size landmine is handled in Task 13 (and avoided entirely by not using Vercel).

**Placeholder scan:** The per-site conversions reference the single mechanical pattern table (shown once, in full) rather than repeating 120 identical edits; the non-mechanical parts (adapter, every transaction port, BigInt handling) are shown in full. No TBD/TODO.

**Type consistency:** Adapter shape (`prepare().get/all/run`, `transaction(fn)`, `executeMultiple`, `exec`, `close`) is defined in Task 1 and used identically in Tasks 2–10. `lastInsertRowid` is consistently `Number()`-wrapped wherever an id enters app logic. `resolveDbConfig`/`openDb` signatures match between definition (Task 1) and use (Tasks 2, 10, 11).

**Audit folded in (2026-10-12):** C1 (adapter exposes `changes`), C2 (3 ingest transactions), C3 (`tx` threaded into helpers), M1 (async `createTestDb`, Task 2b), M2/M3 (string-`:memory:` tests + WAL assertion), M4 (`watchedFolders.js` deleted), M5 (real post-commit `*Settled` shape). The **nested-transaction risk was investigated and is unfounded** — no transaction-wrapped function calls another.

**Verified-vs-unverified:** The six libSQL API assumptions were confirmed empirically (see "Verified facts" above) on the embedded `:memory:` path. The ONE residual unknown is **remote-Turso foreign-key enforcement** — the spike proved FK cascades on embedded libSQL, but production is `libsql://`. Task 14 Step 2 must confirm cascade deletes against a real Turso DB before relying on them; if Turso doesn't honor the per-connection `PRAGMA foreign_keys`, the two short-link transactions (`ingest.js:339, 367`) that depend on cascade will need explicit child deletes.

**Known test-isolation note:** `:memory:` is a fresh DB per `createClient`; `createTestDb` opens one per test and passes a single `db` through the seam, so isolation holds. If any test ever needs two handles to the same in-memory DB, use `file::memory:?cache=shared`.
