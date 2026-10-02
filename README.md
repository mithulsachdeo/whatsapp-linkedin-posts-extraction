# Postboard

WhatsApp -> LinkedIn Post Discovery. Ingests WhatsApp chat exports, extracts
LinkedIn post links, attributes each to its sender and timestamp, dedupes
into unique post records, and exposes a shared discovery dashboard. Design
spec: `docs/superpowers/specs/2026-09-30-linkedin-post-discovery-design.md`.

## Local development

```sh
npm install
ADMIN_TOKEN=dev-only npm start   # http://localhost:3000
npm test
```

No build step. SQLite file and migrations are created automatically on
first boot at `data/postboard.sqlite` (override with `DB_PATH`).

## Deploying

Postboard is a single Node process backed by a SQLite file on disk -- no
separate database service, no build step. It's designed to run on **one
small always-on host** (a $5-10/mo VM, a Raspberry Pi, a NAS with Node, etc.)
with a stable public URL, not on ephemeral/serverless compute (the SQLite
file needs to persist on the same disk the process runs on).

**Requirements:** Node >= 22.5 (uses the built-in `node:sqlite`, no native
module compilation needed -- this is what makes "one small host" practical
even on something like Windows or an ARM box).

**Start command** (the whole app):

```sh
npm ci --omit=dev
npm start
```

That's it -- `npm start` runs `node src/server.js`, which on every boot:
applies any pending SQLite migrations (safe to run every time; already-
applied migrations are a no-op), starts the folder-watch poller if
configured, starts the nightly backup scheduler, and listens on `PORT`.

### Keeping it running

Use whatever your host already gives you to keep a Node process alive and
restart it on crash/reboot -- systemd, pm2, a Docker restart policy, or your
PaaS's native process supervisor. There's nothing Postboard-specific here;
treat it like any other long-running Node server. A minimal systemd unit:

```ini
[Unit]
Description=Postboard
After=network.target

[Service]
WorkingDirectory=/opt/postboard
EnvironmentFile=/opt/postboard/.env
ExecStart=/usr/bin/node src/server.js
Restart=on-failure
User=postboard

[Install]
WantedBy=multi-user.target
```

### Configuration

Copy `.env.example` to `.env` and fill it in (nothing auto-loads `.env`;
point your process manager at it, e.g. `EnvironmentFile=` above, or
`node --env-file=.env src/server.js`).

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ADMIN_TOKEN` | **yes** | -- | Password for the single shared admin login. Unset means admin routes are entirely unreachable (fails closed). |
| `PORT` | no | `3000` | HTTP port. |
| `DB_PATH` | no | `data/postboard.sqlite` | SQLite file location. Put it on persistent storage; parent directory is created automatically. |
| `WATCHED_FOLDERS` | no | *(off)* | JSON array of `{"path","groupId"}` to poll for new chat exports (folder-watch ingestion). `groupId` must match an id in `src/ingest/groups.js`. Manual browser upload always works regardless. |
| `FOLDER_WATCH_INTERVAL_MS` | no | `60000` | Poll interval for watched folders. |
| `BACKUP_DIR` | no | `data/backups` | Where nightly SQLite backups are written. |
| `BACKUP_INTERVAL_MS` | no | `86400000` (24h) | Backup interval. One backup is also always taken immediately at startup. |
| `BACKUP_RETENTION_DAYS` | no | `7` | How long backups are kept before pruning. |

**Canonical timezone (IST, `Asia/Kolkata`)** is intentionally *not* an env
var: the spec fixes it as a single project-wide constant used for parsing
WhatsApp's zoneless timestamps and for display, independent of whatever
timezone the host OS itself is in. There is nothing to configure.

**Restoring from a backup:** stop the app, copy the desired file from
`BACKUP_DIR` (e.g. `postboard-20260930-020000.sqlite`) over `DB_PATH`,
remove any stale `-wal`/`-shm` sidecar files next to it, restart. Full
procedure documented at the top of `src/db/backup.js`.

### Verifying a deploy

```sh
git clone <repo> && cd postboard
npm ci
ADMIN_TOKEN=... PORT=3000 npm start
```

A clean checkout should boot straight to a working dashboard: migrations
apply automatically (`schema_migrations` table + `src/db/migrations/*.sql`),
`data/` is created on first run, and `/` and `/login` both respond
immediately. No manual DB setup step exists or is needed.
