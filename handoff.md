---
tags: [handoff, project/postboard]
type: handoff
date: 2026-10-04
---

# Handoff — Postboard (WhatsApp → LinkedIn Post Discovery)

Cold-start handoff for the next session or a teammate. Vault source of truth: `D:\Mithul_Vault\Projects\Postboard\`.

**Product:** "The Rethinkers' Postcard" — surfaces every LinkedIn post shared across the community's WhatsApp groups. (Codename/repo: Postboard.)
**Owner:** Mithul Sachdeo (non-technical PM, builds with Claude Code).
**Repo:** `github.com/mithulsachdeo/whatsapp-linkedin-posts-extraction` (private). Local: `D:\My projects\Whatsapp linkedin posts extraction`.

**As of 2026-10-04:** v1 built + heavily refined; a full newspaper reskin is the mainline. Active branch **design/industry-new2** (HEAD `0273cdf`) carries the newspaper UI + read-archive + lnkd.in-as-posts + preview-first sort + attribution/label/title refinements + the **full-width header band + sticky side rail** layout (merged from `fix/column-header-alignment`) — **207 tests green**. **Nothing is pushed to the remote** — all work is local branches. `master` has docs/spec only.

## The problem (one line)
LinkedIn post links shared in two overlapping WhatsApp PM groups get buried in chatter, so members miss posts.

## The solution (one line)
Admin imports WhatsApp chat exports; the app extracts LinkedIn posts, attributes each to sender + timestamp, de-duplicates, and shows a public newspaper-style discovery dashboard (sort, filter-by-member, search, per-device Read/archive).

## Architecture (summary)
Single deployable Node + Express, SQLite (WAL) via `node:sqlite`, plain-SQL migrations, server-rendered views (no client framework) consuming the **Industry_new2** "newspaper" design system at `/assets`. Ingestion behind a replaceable `IngestionAdapter` (WhatsApp `.txt`/`.zip` + folder-watch). Best-effort `PreviewFetcher` and `lnkd.in` resolver sit beside the pipeline. Per-device state (Read/archive, layout) via cookies. Tests: `node --test` + supertest against a real temp SQLite DB.

## Key decisions (full log in vault: Decision Log)
v1: D1–D9. This session:
- **D10** newspaper design system (Industry_new2) as the mainline, replacing Organic.
- **D11** per-device Read/archive (cookie + `/out` redirect).
- **D12** removed the share-count signal (no most-shared sort / counts — ranks self-promotion, not endorsement).
- **D13** preview-first sort (preview-available before URL-only, each by date desc).
- **D14** `lnkd.in` links are posts; resolution a best-effort merge/enhancer; `UNRESOLVED_SHORT_LINK` queue removed + backfilled.
- **D15** product renamed "The Rethinkers' Postcard".
- **D16** dashboard = full-width header band + sticky side rail (merged into the mainline).

## Status: done vs next
**Done (on design/industry-new2 = HEAD `0273cdf`, verified, 207 tests):** newspaper reskin; read-archive; share-count removal; layout cookie + Columns default; preview-first sort; lnkd.in-as-posts + backfill; "by {name}" attribution; contextual kicker (author/excerpt for preview posts, "From the archive" otherwise); product rename (title fits one line); search-button regrouped to "Search"; full-width header band + sticky rail layout (merged from `fix/column-header-alignment`).
**Next (need Mithul):**
1. Push branches / open a PR — nothing is on the remote yet.
2. Feed a real WhatsApp export to validate parser + preview/short-link fetch on live data (most run offline/stubbed).
3. Decide v2 items: per-member auth, engagement/upvotes, member roster UI.

## Open items (need Mithul)
- Merge the layout branch? Push to remote / open PR?
- A real `.txt`/`.zip` export for live validation; confirm the two real group names (currently hardcoded).
- Optional: seed/admin-edit a preview so the author/excerpt card treatment is visible (LinkedIn blocks most unauthenticated preview fetches, so posts are mostly URL-only today).

## Risks
- **All work is local & unpushed** — back up / push before relying on it; branches only on this machine.
- **Previews/short-links mostly fail** unauthenticated — by design they degrade to URL-only; the rich card look needs real/edited previews to show.
- Deploy story (systemd) untested on a real Linux host; `node:sqlite` needs Node >=22.5.
- Mid-width (761-900px) rail sizing on the new layout not yet eyeballed.

## Where things live
- **Code:** `D:\My projects\Whatsapp linkedin posts extraction` — GitHub `mithulsachdeo/whatsapp-linkedin-posts-extraction` (private). Mainline **design/industry-new2** (`0273cdf`); fix/column-header-alignment, feat/read-archive, feat/drop-share-count (all merged into mainline); build/v1 (original v1); master (docs only). **Nothing pushed.**
- **Design system:** repo `Industry_new2/` (newspaper), served at `/assets`. (`Industry/` was the earlier Organic system, removed on the reskin branch.)
- **Spec:** `docs/superpowers/specs/2026-09-30-linkedin-post-discovery-design.md` = GitHub issue #1.
- **Run it:** `ADMIN_TOKEN=... PORT=3000 node src/server.js`; admin token used in testing: `test-admin-1234` (local throwaway, not a real credential).
- **Vault (source of truth):** `D:\Mithul_Vault\Projects\Postboard\`.
