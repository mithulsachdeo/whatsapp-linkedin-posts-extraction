# Deploying Postboard ("The Rethinkers' Times")

## Why not Vercel

This app is a **single long-running Node process** with an **on-disk SQLite (WAL)**
database, a folder-watch poller, and a nightly backup scheduler. Serverless
platforms (Vercel, Netlify Functions, Lambda) give per-request functions with an
**ephemeral filesystem** — the SQLite file would be wiped between invocations and
background timers never run. So Postboard needs a **persistent host with a
durable disk**, not serverless.

This repo is configured for **Render** (`render.yaml`). Railway and Fly.io work
equally well; the only requirements are: a persistent/always-on process, a
mounted writable disk for the DB, Node ≥ 22.5 (we pin 24), and a single instance.

## One-time deploy on Render

Everything in `render.yaml` is pre-filled; these are the steps only you can do
(account, billing, secrets, the deploy click):

1. **Create a Render account** at https://render.com and connect your GitHub so
   it can read `github.com/mithulsachdeo/whatsapp-linkedin-posts-extraction`
   (a private repo — grant access to it).
2. **New → Blueprint**, pick this repo. Render reads `render.yaml` and proposes a
   Web Service **postboard** with a 1 GB disk mounted at `/data`.
3. **Set the one secret:** when prompted for the `ADMIN_TOKEN` env var (it is
   `sync: false`, i.e. not in the repo), enter a **long random string** — this is
   the admin password for `/import`, `/review`, etc. Do **not** reuse the local
   test token. Keep it in your password manager.
4. **Confirm the plan.** A disk requires a paid instance (Render **Starter**,
   ~US$7/mo + ~US$0.25/GB for the 1 GB disk). This is the cost of a persistent
   host; there is no free tier with a durable disk.
5. **Apply / Create.** First build runs `npm install`, then `node src/server.js`.
   The disk starts empty; the app creates and migrates `postboard.sqlite`
   automatically on first boot (verified locally).
6. **Verify:** open the service URL. The dashboard should load (empty — "No posts
   yet"). Go to **Admin → Login** and sign in with the `ADMIN_TOKEN` you set, then
   **Import** a WhatsApp export.

## Notes & gotchas

- **Single instance only.** SQLite has one writer and the disk can't be shared,
  so never enable horizontal autoscaling. Mounting a disk already pins it to one
  instance — leave it.
- **Node version** is pinned to 24 via `.node-version` and `NODE_VERSION` so
  `node:sqlite` runs without the `--experimental-sqlite` flag. Don't lower it below
  23 or the start command will fail.
- **Backups** are written to `/data/backups` (on the same disk). For off-host
  durability, periodically download a snapshot or add Render Disk snapshots.
- **Data persists** across deploys and restarts because it lives on the mounted
  disk, not the ephemeral build filesystem.
- **Env vars** the app honors: `ADMIN_TOKEN` (required), `PORT` (Render sets it),
  `DB_PATH`, `BACKUP_DIR`, and optionally `WATCHED_FOLDERS`,
  `FOLDER_WATCH_INTERVAL_MS`, `BACKUP_INTERVAL_MS`, `BACKUP_RETENTION_DAYS`.

## Switching providers

- **Railway:** create a project from the repo, add a **Volume** mounted at `/data`,
  set the same env vars (`ADMIN_TOKEN`, `DB_PATH=/data/postboard.sqlite`,
  `BACKUP_DIR=/data/backups`), pin Node 24. Start command `node src/server.js`.
- **Fly.io:** needs a `Dockerfile` + `fly.toml` with a `[mounts]` volume at
  `/data`; ask and I'll generate them.
