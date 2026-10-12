# Spec: Turso + free-host migration (sync→async storage swap)

## Problem Statement

The owner wants Postboard ("The Rethinkers' Times") deployed on a **free** host so the community can reach it at a URL without a monthly bill. As built, the app can't be hosted for free: it keeps all its data in an on-disk SQLite (WAL) file and runs always-on background work (a folder-watch poller and a nightly backup scheduler). Free platforms give either an ephemeral filesystem (serverless — data is wiped between requests) or a sleeping process (no reliable background timers), so the app would silently lose every imported post or never run its jobs. The owner has accepted a re-architecture to achieve $0 hosting.

## Solution

Move the database off local disk to a **networked SQLite-compatible database (Turso / libSQL)**, so the compute no longer needs a durable disk and can run on a free tier (a free persistent-process web service, e.g. Render Free — explicitly NOT Vercel, whose request-body cap would break chat-export imports). Because the libSQL client is asynchronous, the app's synchronous data layer is converted to async behind a thin adapter that preserves the existing call shapes, so **no observable behavior changes** — the dashboard, attribution, dedup, review, import, preview, date-range filter, and gutter photos all work exactly as before. The folder-watch and custom nightly-backup features are retired (a networked DB on a sleeping host can't run them; Turso provides managed backups). From a reader's and the admin's point of view, nothing about the product changes except that it now lives at a free public URL and its data persists in Turso.

## User Stories

1. As the site owner, I want the app hosted at $0/month, so that I can share it with the community without taking on a subscription.
2. As the site owner, I want imported posts to persist permanently in a networked database, so that a host restart, redeploy, or free-tier sleep never loses data.
3. As a community member, I want the discovery dashboard to look and behave exactly as before after the migration, so that the move is invisible to me.
4. As a community member, I want the most-recently-shared posts ordered correctly, so that dedup and timestamp-based ordering keep working after the storage swap.
5. As a community member, I want the member (correspondent) filter to keep returning the right posts, so that filtering is unaffected by the backend change.
6. As a community member, I want the date-range filter and its IST-aware bounds to keep working, so that narrowing by date behaves identically.
7. As a community member, I want search over URLs and preview text to keep working, so that discovery is unchanged.
8. As a community member, I want my per-device Read/Unread/archive state (cookie-based) to keep working, so that the migration doesn't reset my view.
9. As a community member, I want the paginated "Print Next Edition" batches to keep working, so that browsing beyond the first edition is unchanged.
10. As a community member, I want the newspaper gutter photos (and their close/persist behavior) to keep working, so that the visual experience is unchanged.
11. As the admin, I want to log in with the shared admin token on the deployed host, so that I can access the mutating routes.
12. As the admin, I want to import a WhatsApp chat export on the deployed host and have every LinkedIn post extracted, attributed, and de-duplicated into the networked database, so that the core workflow works in production.
13. As the admin, I want overlapping re-imports to never create duplicate posts, so that the idempotency guarantee survives the async rewrite.
14. As the admin, I want a single share of a link to produce one post with one share event, and repeat shares to add share events without duplicating the post, so that the "one post, many share events" invariant holds.
15. As the admin, I want unknown senders to still create review items and map retroactively and reversibly, so that attribution workflows are unchanged.
16. As the admin, I want to promote or dismiss "other LinkedIn" review items and undo those actions, so that the review workflow is unchanged and its undo still removes exactly the created share event.
17. As the admin, I want to set or edit a post's preview and have it survive re-imports, so that manual preview overrides are unchanged.
18. As the admin, I want `lnkd.in` short links to still appear as posts immediately and resolve/merge best-effort, so that short-link handling is unchanged.
19. As the admin, I want an import that is too large to be rejected with a clear message rather than crashing the free instance, so that a huge upload can't take the site down.
20. As the admin, I want my imported data to still be there after the free host sleeps and wakes, so that intermittent traffic doesn't cost me data.
21. As the developer, I want all database access to go through one async adapter with the same shape the code already uses, so that the conversion is mechanical and low-risk.
22. As the developer, I want every existing behavior test to keep asserting the same observable outcomes (converted only to await), so that the migration is proven not to change behavior.
23. As the developer, I want the test suite to run against an in-memory libSQL database, so that tests stay fast and offline with no network dependency.
24. As the developer, I want database writes that must be atomic to run inside real interactive transactions that commit or roll back as a unit, so that partial writes can't corrupt attribution/dedup.
25. As the developer, I want the connection configuration resolved from the environment (production Turso URL+token, local file for dev, in-memory for tests), so that the same code runs everywhere.
26. As the developer, I want foreign-key cascade behavior verified against the real remote database before relying on it, so that short-link merge/reclassify deletes behave correctly in production.
27. As the developer, I want the retired folder-watch and backup code removed cleanly, so that no dead always-on code ships to the free host.
28. As the operator, I want a documented one-time deploy procedure (provision Turso, set secrets, deploy), so that I can bring the site up and recover it without guesswork.

## Implementation Decisions

- **Storage backend.** Replace Node's built-in synchronous `node:sqlite` with the asynchronous libSQL client (`@libsql/client`), targeting a Turso-hosted database in production. This supersedes decision D7's "on-disk SQLite (WAL), single deployable" for the hosting dimension; the schema and SQL are unchanged (libSQL is SQLite-compatible).

- **One async DB adapter (the single internal pivot).** Introduce an adapter that wraps the libSQL client and exposes the same shapes the codebase already calls, but async. Its contract (from the verification prototype):
  - `exec(sql) → Promise<void>` — single statement / PRAGMA.
  - `executeMultiple(sql) → Promise<void>` — multi-statement scripts (migrations).
  - `prepare(sql) → { get(...args) → Promise<row|undefined>, all(...args) → Promise<row[]>, run(...args) → Promise<{ rowsAffected, changes, lastInsertRowid }> }`.
  - `transaction(fn) → Promise<T>` — runs `fn(tx)` in an interactive write transaction, committing on success and rolling back on throw; `tx` has the same shape as the adapter.
  - `close() → Promise<void>`.
  The prototype confirmed against the real client: `run()` must expose **`changes`** (aliasing `rowsAffected`) because the code reads `result.changes` to detect inserted rows; `lastInsertRowid` is a **BigInt** and must be `Number()`-wrapped where an id enters app logic; integer columns return as JS numbers (so identity comparisons are unaffected); and interactive `transaction('write')` commit/rollback work as expected.

- **Connection config from environment.** A single resolver returns `:memory:` under test, a local file in dev, and the Turso `{ url, authToken }` in production. Production must use the stateful `libsql://` protocol (interactive transactions require it), not an HTTP-only client.

- **Sync→async conversion is mechanical and total.** Every database call site becomes `await`; every function containing one becomes async; the ripple propagates up to the Express route handlers, which become async and `await` their data calls. The conversion touches the query modules, the ingest pipeline, the review and identity command modules, the preview cache, and the HTTP layer.

- **The view/render layer is NOT in the async chain.** Views already receive plain data objects, not the database, so rendering stays synchronous; the async boundary stops at the routes. This is load-bearing for keeping the change contained.

- **Transactions use real interactive transactions, tx threaded through helpers.** Every existing manual BEGIN/COMMIT/ROLLBACK block becomes an adapter `transaction(fn)`. Critically, the shared single-statement helpers invoked inside a transaction must receive the transaction handle, not the base connection — otherwise their writes run outside the transaction (breaking atomicity) and deadlock against the open write transaction. The ingest pipeline has three such transactions (the main write path plus the short-link merge and reclassify paths); the identity, review, backfill, and migration paths have their own. No transaction-wrapped operation calls another (verified — interactive transactions do not nest, and this codebase never nests them).

- **Post-commit best-effort work is preserved.** Ingest's preview fetch and short-link resolution continue to fire after the transaction commits, as two settle-all passes whose completion is observable to callers (the tests await them). Failures there must not fail the ingest.

- **Retire folder-watch and custom backup.** Remove the folder-watch poller, the nightly-backup scheduler, and the now-orphaned watched-folders loader. Managed backups are delegated to Turso. The server bootstrap opens the DB, runs migrations, builds the app, and listens — no background schedulers.

- **Compute host.** A free persistent-process web service (Render Free) rather than serverless. Rationale: serverless request-body limits would reject chat-export uploads, and a persistent process needs no per-request DB-connection juggling. The free tier sleeps on idle (acceptable: a brief cold start), and data durability now comes from Turso, not the host.

- **Protect the free instance from large uploads.** Lower the import upload cap (from 200 MB to ~50 MB) so a huge file can't exhaust the small free instance's memory; surface an oversize upload as a clean import-page error. Only chat text is parsed; media is not needed.

- **Deploy configuration.** A declarative host config (web service, Node pinned to 24, start command unchanged, health check on the home route) plus documented one-time steps: provision the Turso database, obtain its URL and auth token, set the admin token and both DB secrets in the host dashboard, deploy, and verify an import that survives a sleep/wake cycle.

## Testing Decisions

- **What makes a good test here:** assert only externally observable behavior — the data returned by the public query/command API and the HTTP responses — never adapter internals. The whole point of the migration is that these observable outcomes are unchanged, so the existing behavior tests are the proof; they are converted to `await` but their assertions stay identical in intent.

- **Seams (reuse existing; add exactly one):**
  1. The **public query/command API** — the existing primary seam (per the original spec's testing decisions: exercise ingestion and read back through the query API). Converted to async, same assertions.
  2. The **HTTP layer via supertest** — the existing secondary seam; unchanged, still asserting real end-to-end responses.
  3. The **DB adapter** — one new focused unit seam, justified because the adapter is the single boundary the migration pivots on. It is tested directly for: async get/all/run, the `changes` alias, BigInt `lastInsertRowid`, multi-statement execution, and transaction commit/rollback.

- **Shared test harness:** the common test-DB helper is converted to open an in-memory libSQL database and run migrations asynchronously; every DB-touching test acquires its database through this one helper, so the entire suite funnels through the single adapter seam. Tests run offline against in-memory libSQL — no network, no Turso dependency in CI.

- **Prior art:** the existing `node --test` + supertest suite (route tests under the HTTP seam, query-API tests under the primary seam, ingest invariant tests for dedup/attribution). The ingest invariant tests ("one post, many share events"; "overlapping re-imports don't duplicate"; share-event counts) are the critical safety net for the async conversion and must not be weakened — in particular the share-event count assertions depend on the adapter's `changes` guarantee.

- **Green at every step:** the conversion proceeds module by module with the full suite required to pass after each, so a regression is caught at the task that introduced it rather than at the end.

- **Real-remote verification:** one manual verification against an actual Turso database before relying on production — confirm foreign-key cascade deletes are enforced over the remote connection (the in-memory/embedded path is proven; the remote path is not), and confirm an import persists across a host restart.

## Out of Scope

- Any change to product behavior, UI, copy, or features (dashboard, attribution, dedup, review, import, preview, date-range filter, gutter photos, Read/archive, pagination) — this is a storage/hosting swap only.
- Per-member authentication, engagement/upvotes, and a member roster UI (still deferred to v2).
- Folder-watch ingestion and the in-app nightly backup scheduler (intentionally retired, not reimplemented).
- Migrating to a different compute host than the chosen free persistent-process tier, and any paid-host configuration.
- A Postgres migration (the networked database is Turso/libSQL, keeping the existing SQLite-compatible schema).
- Off-host backup automation beyond Turso's managed backups.

## Further Notes

- A verification prototype against the real libSQL client confirmed the adapter contract (including the `changes` alias, BigInt insert ids, number-typed integer columns, multi-statement execution, interactive transaction commit/rollback, and foreign-key cascade enforcement on the embedded path). The only residual unknown is foreign-key enforcement over the remote Turso connection, deferred to the real-remote verification above.
- A prior audit of the migration approach ruled out nested transactions as a risk and identified the `changes` alias, the three ingest transactions, and the tx-threading requirement as the correctness-critical details — all reflected in the Implementation Decisions.
- The step-by-step implementation plan lives in the repo under the plans directory and should be used alongside this spec by the implementing agent.
- The product's observable behavior is defined by the original design spec (2026-09-30) and decisions D1–D21; this spec changes only the storage backend and the hosting target.
