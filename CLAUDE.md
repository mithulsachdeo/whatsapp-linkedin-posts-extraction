# WhatsApp → LinkedIn Post Discovery

A web app that ingests WhatsApp chat exports, extracts LinkedIn post links,
attributes each to its sender and timestamp, deduplicates into unique post
records, and exposes a shared discovery dashboard. Design spec:
`docs/superpowers/specs/2026-09-30-linkedin-post-discovery-design.md`.

## Agent skills

### Issue tracker

Issues and specs are tracked as GitHub issues (private repo, `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
