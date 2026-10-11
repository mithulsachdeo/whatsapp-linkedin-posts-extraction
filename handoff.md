---
tags: [handoff, project/postboard]
type: handoff
date: 2026-10-11
---

# Handoff — Postboard (WhatsApp → LinkedIn Post Discovery)

Cold-start handoff for the next session or a teammate. Vault source of truth: `D:\Mithul_Vault\Projects\Postboard\`.

**Product:** "The Rethinkers' Times" — surfaces every LinkedIn post shared across the community's WhatsApp groups. (Codename/repo: Postboard.)
**Owner:** Mithul Sachdeo (non-technical PM, builds with Claude Code / Antigravity).
**Repo:** `github.com/mithulsachdeo/whatsapp-linkedin-posts-extraction` (private). Local: `D:\My projects\Whatsapp linkedin posts extraction`.

**As of 2026-10-11:** **v1 + newspaper reskin + 3D entrance motion + discrete edition pagination + date-range filter — all on the mainline and, for the first time, PUSHED to GitHub.** Mainline **`design/industry-new2`** (HEAD `9b560a6`, **249 tests green**) now carries everything through the date-range filter. `design/industry-new2` and `build/v1` are pushed; the local branch set is cleaned up (all merged feature branches deleted). The long-standing "nothing is on the remote" risk is **closed** for the mainline.

## The problem (one line)
LinkedIn post links shared in two overlapping WhatsApp PM groups get buried in chatter, so members miss posts.

## The solution (one line)
Admin imports WhatsApp chat exports; the app extracts LinkedIn posts, attributes each to sender + timestamp, de-duplicates, and shows a public newspaper-style discovery dashboard (sort, filter-by-member, search, per-device Read/archive, paginated print editions, and a date-range filter).

## Architecture (summary)
Single deployable **Node + Express**, **SQLite (WAL)** via `node:sqlite`, plain-SQL migrations, server-rendered views (no client framework) consuming the **`Industry_new2`** "newspaper" design system at `/assets`. Ingestion behind a replaceable `IngestionAdapter` (WhatsApp `.txt`/`.zip` + folder-watch). Best-effort `PreviewFetcher` and `lnkd.in` resolver beside the pipeline. Per-device state (Read/archive, layout) via cookies; content filters (member, search, view, **date range**) ride the URL query string and compose as AND conditions in `getDashboard`. Canonical timezone is **IST (Asia/Kolkata)** stored as UTC ISO strings (`src/ingest/parseChat.js`). Frontend motion orchestrator (`Industry_new2/card-convergence-blast.js`) drives the entrance animation + SSR edition-band fragments. Tests: `node --test` + supertest against a real SQLite DB.

## Key decisions (full log in vault: Decision Log)
- **v1:** D1–D9. **Newspaper reskin:** D10–D16.
- **Card motion & pagination (2026-10-07):** D17 rename "The Rethinkers' Times" (supersedes D15); D18 360° 3D card convergence into central `#7a2418` circle with kinetic blast dispersion; D19 discrete "Print Next Edition" pagination in isolated 3-column edition bands (zero reflow) + rotary-press unroll; D20 exploratory visual branches discarded after review.
- **This session (2026-10-11):** D21 date-range filter — From–To (both optional), "any share event in window" semantics, filter-aware IST-bounded native date inputs, URL query params, GET form with Apply + Clear.

## Status: done vs next
**Done (on `design/industry-new2` = `9b560a6`, verified, 249 tests):**
- Everything through the newspaper reskin, card motion (D18), and edition pagination (D19).
- **Date-range filter** (D21): any-share-in-window From–To filter, filter-aware picker bounds expressed as IST calendar dates, IST-correct near-midnight handling, native `<input type="date">` with min/max in a GET form (Apply + Clear dates), empty-in-range message. New module `src/query/istDateRange.js`; 33 new tests. Built by a Sonnet 5 `/implement` subagent after a `/grilling` pass settled the design; merged FF into the mainline.
- **Pushed to GitHub (first time):** `design/industry-new2` (`9b560a6`) and `build/v1` (`1378f6a`) now on the remote alongside `master`.
- **Branch hygiene:** deleted all six merged local branches (card-motion ×2, date-range-filter, drop-share-count, read-archive, column-header-alignment). Local set = exactly the three pushed branches.

**Next (need Mithul):**
1. Feed a **real WhatsApp export** to validate parser + preview/short-link fetch on live data (most runs offline/stubbed); confirm the two real group names (currently hardcoded).
2. Decide whether to make the **`.env` + dotenv** change (see Risks) so the admin password survives restarts.
3. Browser-eyeball the date-range filter end-to-end (markup/behaviour verified + server started, but no full interactive pass).
4. v2 candidates: per-member auth, engagement/upvotes, member roster UI.

## Open items (need Mithul)
- A real `.txt`/`.zip` export + confirmation of the two real group names.
- Keep or discard the two leftover draft files in the repo root (`handoff_antigravity` / `handoff_antigravity.md`) now that the vault is reconciled and `handoff.md` is refreshed.
- Decide on the `.env` + dotenv durable fix for `ADMIN_TOKEN`.

## Risks
- **`ADMIN_TOKEN` is read only from the launch environment** (no `.env`/dotenv) — a server started without it, or with a different value, returns "Incorrect password" even for the right password. This bit us this session (L4). Durable fix is a committed `.env` + a one-line loader.
- **Session-spawned dev servers get reaped** on turn end; run detached (`Start-Process`) or from your own terminal for a persistent server (L4).
- **Previews/short-links mostly fail** unauthenticated — degrade to URL-only by design; the rich card look needs real/edited previews.
- `node:sqlite` needs Node ≥22.5; systemd deploy story untested on a real Linux host.

## Where things live
- **Code:** `D:\My projects\Whatsapp linkedin posts extraction` — GitHub `mithulsachdeo/whatsapp-linkedin-posts-extraction` (private). **Pushed:** `design/industry-new2` (`9b560a6`, mainline), `build/v1` (`1378f6a`, original v1), `master` (docs/spec). No local-only branches remain.
- **Design system:** repo `Industry_new2/` (newspaper), served at `/assets`. Motion: `Industry_new2/card-convergence-blast.js` + `tokens/motion.css`.
- **Date filter:** `src/query/dashboard.js` (+ `getDateRangeBounds`), `src/query/istDateRange.js`, `src/http/app.js` (`/` + `/dispatches`), `src/views/dashboard.js`.
- **Spec:** `docs/superpowers/specs/2026-09-30-linkedin-post-discovery-design.md` = GitHub issue #1.
- **Run it:** `ADMIN_TOKEN=test-admin-1234 PORT=3000 node src/server.js` (test token = local throwaway, not a real credential).
- **Vault:** `D:\Mithul_Vault\Projects\Postboard\`.
