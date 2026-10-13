# Deploying Postboard ("The Rethinkers' Times")

## Why Render free + Turso

Postboard's database is [Turso](https://turso.tech) (hosted libSQL) — a managed,
remote SQLite-compatible database reached over the network, not a local file.
That removes the need for a durable mounted disk, which means the app can run
on a plain **free** Render Web Service: `render.yaml` defines a `plan: free`
service with no `disk:` block. All persistent state (posts, senders, review
state, settings) lives in Turso, not on the Render instance's filesystem.

Trade-off: the free Render plan spins the service down after ~15 minutes of
no traffic and cold-starts (a few seconds) on the next request. That's an
acceptable trade for $0/mo at this scale; see caveats below if that ever
becomes a problem.

## One-time setup: provision Turso

You need a Turso account and CLI (free tier: generous limits for this app's
scale — far more storage/row reads than a small team posting-discovery board
will use).

```bash
# 1. Install the Turso CLI and sign up (opens a browser to auth)
curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup

# 2. Create the database
turso db create postboard

# 3. Get the connection URL — this is DATABASE_URL
turso db show postboard --url
# -> libsql://postboard-<your-org>.turso.io

# 4. Create an auth token — this is DATABASE_AUTH_TOKEN
turso db tokens create postboard
```

Keep the URL and token somewhere safe (password manager) — you'll paste them
into Render next. The token is a secret; never commit it.

## One-time deploy on Render

1. **Create a Render account** at https://render.com and connect your GitHub
   so it can read `github.com/mithulsachdeo/whatsapp-linkedin-posts-extraction`
   (a private repo — grant access to it).
2. **New → Blueprint**, pick this repo. Render reads `render.yaml` and
   proposes a **free** Web Service named **postboard** (no disk).
3. **Set the three secrets** when prompted (all `sync: false`, i.e. not in
   the repo):
   - `DATABASE_URL` — the `libsql://...` URL from `turso db show postboard --url`.
   - `DATABASE_AUTH_TOKEN` — the token from `turso db tokens create postboard`.
   - `ADMIN_TOKEN` — a new, long random string; this is the admin password for
     `/import`, `/review`, etc. Do **not** reuse the local test token.
4. **Apply / Create.** First build runs `npm install`, then
   `node src/server.js`. The app creates and migrates the schema in Turso
   automatically on first boot (verified locally against embedded libSQL;
   confirm once against the real Turso URL per the migration plan).
5. **Verify:** open the service URL (the first request after a cold start may
   take a few seconds). The dashboard should load (empty — "No posts yet").
   Go to **Admin → Login**, sign in with the `ADMIN_TOKEN` you set, then
   **Import** a WhatsApp export and confirm it's still there after a refresh.

## Notes & gotchas (free tier)

- **Idle sleep / cold start.** The free instance sleeps after ~15 min with no
  traffic and takes a few seconds to wake on the next request. There's no
  background folder-watch or scheduled backup job running on this plan (those
  features were intentionally dropped during the Turso migration in favor of
  Turso-managed backups) — so sleeping costs nothing but a one-time delay for
  whoever hits it first.
- **Turso free-tier limits** are generous for a small team's posting-discovery
  board (rows, storage, and read/write volume at this scale are well under the
  free quota). If usage ever grows past that, upgrade the Turso plan — no app
  code changes needed.
- **Backups are Turso-managed**, not this app's responsibility. Turso keeps
  automatic point-in-time recovery; to take a manual snapshot/export, use
  `turso db shell postboard .dump > backup.sql` or the Turso dashboard's backup
  controls. There is no `BACKUP_DIR`/nightly-backup env var anymore.
- **Upload size.** The free Render instance has ~512 MB RAM and multer buffers
  uploads in memory. WhatsApp text exports are small, but if a large import
  ever OOMs the instance, lower `limits.fileSize` in `src/http/app.js`
  (see ticket for the multer config) before raising the Render plan.
- **Single instance is still fine** either way — Turso is the single source of
  truth regardless of how many Render instances exist — but the free plan
  only runs one anyway.
- **Env vars** the app honors: `ADMIN_TOKEN` (required), `PORT` (Render sets
  it), `DATABASE_URL` and `DATABASE_AUTH_TOKEN` (required in production —
  unset locally falls back to a local file DB; see `.env.example`).

## Switching providers

Any host that runs a persistent Node process and reaches the internet (to
reach Turso) works — Railway, Fly.io, a VPS, etc. No disk/volume is required
anymore since all storage is in Turso. Set the same three env vars
(`DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `ADMIN_TOKEN`), pin Node 24, and start
with `node src/server.js`.
