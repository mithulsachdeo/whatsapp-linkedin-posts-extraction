# LinkedIn Post Discovery from WhatsApp Exports — Design Spec

**Date:** 2026-09-30
**Status:** Ready for implementation planning

## Problem Statement

A community of Product Managers shares LinkedIn post URLs inside two existing
WhatsApp groups (one group is a ~70% overlapping subset of the other). Those
links are interspersed with unrelated conversation, so useful posts get buried.
As a result, members miss posts they would have wanted to see, and some shared
posts receive little engagement.

The community wants to keep sharing links the way they already do — dropping
them into the WhatsApp chat — without asking every member to also submit links
through a separate form. Today there is no way to see, in one place, every
LinkedIn post that has ever been shared, who shared it, and when.

## Solution

A web application that ingests WhatsApp chat exports, extracts every LinkedIn
post link, attributes each link to the WhatsApp sender and message timestamp,
consolidates duplicate links into unique post records (while preserving every
individual sharing event), and presents a shared, publicly reachable dashboard
where community members can discover posts.

Members change nothing about their behaviour — they keep sharing links in
WhatsApp. A single admin/curator periodically supplies chat exports (initially
by dropping the exported `.txt` into a watched cloud-drive folder). The app does
the rest: extraction, attribution, deduplication, and surfacing anything
uncertain for human review rather than guessing.

Scope for this version (v1) is **discovery and attribution only**. Engagement
tracking is explicitly deferred to v2.

## User Stories

### Ingestion

1. As the admin, I want to upload a WhatsApp "Without Media" `.txt` export
   through the browser, so that its LinkedIn links are captured without me
   editing the file.
2. As the admin, I want the parser to automatically detect whether an export
   came from iOS or Android (and its date ordering), so that I never have to
   configure the format per file.
3. As the admin, I want to choose which of the two groups an upload belongs to
   at upload time, so that each sharing event is attributed to the correct
   group without the system guessing.
4. As the admin, I want to drop an exported `.txt` into a watched cloud-drive
   folder (Google Drive/Dropbox) and have the app auto-ingest it, so that I do
   not have to open a browser and upload manually.
5. As the admin, I want to re-export the full chat history periodically
   (weekly or whenever convenient) rather than daily, so that keeping the app
   current is not a tedious daily chore.
6. As the admin, I want re-importing an export I have already imported — or an
   export that overlaps a previous one — to create no duplicate records, so
   that frequent, overlapping re-exports are safe.
7. As the admin, I want the app to warn me when I upload a file whose contents
   are byte-identical to one already imported, so that I can avoid redundant
   work.
8. As the admin, I want ingestion to be implemented behind a replaceable
   adapter interface, so that a future permitted automated source can be added
   without reworking extraction, dedup, or storage.

### Extraction & classification

9. As the admin, I want the app to extract every LinkedIn URL from message
   text, so that no shared link is silently missed.
10. As the admin, I want each URL classified as a LinkedIn post, a non-post
    LinkedIn link, or an unresolved short link, so that the dashboard shows
    posts while other links are still retained and reviewable.
11. As the admin, I want `/posts/...`, `/feed/update/urn:li:activity:...`, and
    article `/pulse/...` URLs treated as posts, so that the common post shapes
    are captured.
12. As the admin, I want profile, company, and job LinkedIn links captured but
    flagged as "not a post," so that they are neither shown as posts nor
    silently discarded.
13. As the admin, I want `lnkd.in` short links resolved via a single HTTP
    redirect lookup at import time, so that shortened links can be canonicalized
    to their real post identity.
14. As the admin, I want a short link that fails to resolve placed in the review
    queue as unresolved rather than guessed at, so that ambiguous data is
    surfaced, not fabricated.

### Deduplication

15. As a member, I want one unique LinkedIn post to appear as a single record
    on the dashboard, so that the same post shared many times is not listed
    repeatedly.
16. As a member, I want a post record to accumulate all of its sharing events
    across both groups, so that I can see how widely and how often it was
    shared.
17. As the admin, I want the same person sharing the same link at two different
    times to count as two distinct sharing events, so that genuine re-shares
    are preserved.
18. As the admin, I want tracking parameters (e.g. `utm_*`, `trackingId`) and
    host casing normalized away during canonicalization, so that cosmetically
    different URLs for the same post deduplicate correctly.

### Identity & attribution

19. As the admin, I want every sharing event to store the raw WhatsApp sender
    string verbatim, so that attribution is never lost or overwritten.
20. As the admin, I want to maintain a member identity with an alias table
    where both phone numbers and display names are equal-strength aliases, so
    that the same person appearing under different sender strings maps to one
    member.
21. As the admin, I want an unrecognized sender to be sent to a review queue
    rather than fuzzily merged, so that correct attribution is never silently
    guessed.
22. As the admin, I want mapping an unknown sender to a member to retroactively
    re-attribute all of that sender's past sharing events, so that historical
    data becomes correct once I resolve the identity.
23. As a member, I want a post whose sharer is not yet resolved to still appear
    on the dashboard, labelled "Pending attribution," so that discovery is never
    blocked by unresolved identity.

### Review queue

24. As the admin, I want a review queue that collects unknown senders, non-post
    LinkedIn links, and unresolved short links, so that everything uncertain is
    in one place for me to resolve.
25. As the admin, I want to resolve an unknown sender by mapping it to an
    existing member or creating a new member, so that attribution becomes
    correct.
26. As the admin, I want to dismiss a non-post LinkedIn link or promote it to a
    post if I disagree with the classifier, so that I have the final say on
    classification.
27. As the admin, I want to resolve an unresolved short link by pasting the
    real URL or dismissing it, so that stuck links can be recovered.
28. As the admin, I want every review action to be reversible and to re-run
    dedup/attribution on the affected records, so that mistakes are cheap to
    correct.

### Discovery dashboard

29. As a member, I want a public dashboard I can reach by URL without logging
    in, so that discovering posts is frictionless.
30. As a member, I want each post shown as a card with the clickable LinkedIn
    link, who shared it, when it was first shared, and how many times / by how
    many distinct members it was shared, so that I can judge and find posts
    quickly.
31. As a member, I want posts ordered most-recently-shared first by default, so
    that newly shared posts are not buried.
32. As a member, I want to switch the sort to most-shared, so that I can find
    the posts the community amplified most.
33. As a member, I want to filter to everything a particular member shared, so
    that I can follow a specific person's contributions.
34. As a member, I want to text-search over the post URL/slug (and over any
    fetched preview author/text), so that I can locate a specific post.
35. As a member, I want to see a single "last updated" timestamp for the whole
    app, so that I know how current the data is.
36. As a member, I want each post to show its fetched preview (author, role,
    excerpt) when one is available, so that I can recognise and judge a post
    without opening LinkedIn.
37. As a member, I want a post whose preview could not be fetched to still
    appear, showing its URL with a clear "no preview" note, so that no post is
    hidden just because LinkedIn returned nothing.
38. As the admin, I want to manually paste or edit a post's preview details, so
    that important posts that failed to fetch can still read well on the board.
39. As a member, I want to switch the list between a rows and a cards density,
    so that I can scan the board the way I prefer.
40. As a member, I want each share to optionally show the WhatsApp message text
    that accompanied the link, so that I get the sharer's own context.

### Platform & administration

41. As the admin, I want the mutating routes (ingest, review, member edits)
    protected by a shared admin password/token while the dashboard stays open,
    so that random visitors cannot corrupt the data before full auth exists.
42. As the admin, I want the underlying data file backed up nightly on the
    host, so that my manual attribution work is not lost.

## Implementation Decisions

### Architecture & platform

- **Single deployable Node application** backed by **SQLite** (WAL mode enabled),
  hosted on one small always-on host with a stable public URL. SQLite is chosen
  for zero DB-ops at community scale; the schema is kept portable so a later
  move to Postgres is a migration, not a rewrite.
- **Canonical timezone:** IST (`Asia/Kolkata`), stored as a single config value.
  WhatsApp exports carry local wall-clock time with no zone; all parsing and
  display use this one value.
- No LLM/AI calls anywhere in the core pipeline (extraction, classification,
  identity mapping, dedup, status tracking).
- The core pipeline is fully offline and deterministic. Two outbound HTTP
  concerns sit **beside** it, both best-effort and non-blocking: `lnkd.in`
  redirect resolution (for canonicalization) and **post-preview fetching** (see
  "Preview fetching"). No LinkedIn **engagement metrics** are fetched or claimed
  — no likes, comments, or impressions (principle 8). A preview is public
  descriptive content (author, title, excerpt), not an engagement claim.

### Preview fetching (best-effort, cached, replaceable)

- Previews sit behind a **`PreviewFetcher` port** so the fetch strategy is
  swappable and fully stubbable in tests.
- On import, each new Post triggers **one** best-effort preview fetch (public
  Open-Graph-style author/title/excerpt). Ingestion **never blocks** on it and
  never fails because of it.
- Whatever is fetched is **cached** on the Post. A post whose preview could not
  be fetched is marked `preview_unavailable` and still appears on the board in
  the design's URL-only ("no preview") style — never hidden.
- The admin can **manually set or edit** a Post's preview (author/role/excerpt),
  which overrides the fetched value and survives re-imports.
- Honest caveat carried from design review: LinkedIn heavily rate-limits and
  often blocks unauthenticated preview fetches, so a meaningful share of posts
  are expected to fall back to URL-only. This is acceptable by design.

### Ingestion (replaceable adapter boundary)

- Ingestion sits behind an **`IngestionAdapter` interface**. v1 implements:
  - **`WhatsAppTxtAdapter`** — parses a "Without Media" export supplied as a
    `.txt` file, or as a `.zip` from which the chat `.txt` is extracted. Auto-
    detects iOS (`[dd/mm/yy, h:mm:ss AM] Sender: msg`) vs Android
    (`dd/mm/yy, h:mm - Sender: msg`) formats and date ordering. Handles
    multi-line messages and skips system/notice lines.
  - **Folder-watch source** (Google Drive/Dropbox) — polls a configured folder
    and feeds new `.txt` files through the same adapter. Manual browser upload is
    retained as a fallback path into the same code.
- Unofficial WhatsApp-Web automation (whatsapp-web.js, Baileys, etc.) is **out
  of scope** for v1 (WhatsApp ToS violation / ban risk). The official WhatsApp
  Business Cloud API is documented as **unable** to read arbitrary existing group
  messages and is not used. Either could later be added as a new adapter *if and
  only if* it becomes a documented, permitted source.
- **Group tagging:** the target group is selected by the admin per upload (per
  watched folder for the folder-watch source); it is never inferred from file
  contents.

### Data model (conceptual)

- **Member** — a person. Has one or more **Aliases** (raw sender strings; phone
  numbers and display names are equal-strength, both just strings pointing to a
  member) and a display name.
- **Post** — a unique LinkedIn post, keyed on its **canonical URL**. Accumulates
  sharing events across both groups. Carries optional cached **preview** fields
  (author, role/subtitle, excerpt), a `preview_unavailable` flag, and a flag
  marking an admin-edited preview that must not be overwritten by a later fetch.
- **SharingEvent** — one occurrence of a post being shared. Stores the raw
  sender string verbatim, the message timestamp, the `group_id`, the resolved
  member (nullable → "Pending attribution"), an optional **note** (the WhatsApp
  message text that accompanied the link, when present), and a link to its Post.
  Uniquely identified by `(group_id, timestamp, raw_sender, canonical_url)`.
- **ReviewItem** — an unresolved unit of work of one of three kinds:
  `UNKNOWN_SENDER`, `OTHER_LINKEDIN`, `UNRESOLVED_SHORT_LINK`.
- **ImportBatch** — records each ingested file, including a content hash used to
  warn on byte-identical re-uploads.
- `group_id` is a first-class column on sharing events (and threaded where dedup
  requires it) but is **not surfaced in the v1 UI**; it exists for correct
  idempotency and for v2.

### URL classification & canonicalization

- Classification is deterministic:
  - **POST**: `/posts/...`, `/feed/update/urn:li:activity:...`, `/pulse/...`.
  - **OTHER_LINKEDIN**: `/in/...` (profiles), `/company/...`, jobs, and other
    non-post LinkedIn URLs — captured and retained, browsable admin-side, never
    shown as posts, never silently discarded.
  - **UNRESOLVED**: `lnkd.in/...` short links — one HTTP redirect-resolve attempt
    at import; on success the resolved URL is reclassified, on failure a
    `UNRESOLVED_SHORT_LINK` review item is created.
- **Canonicalization** lowercases the host, strips tracking/query noise (`utm_*`,
  `trackingId`, `rcm`, and similar), and normalizes to a stable post identifier
  (the `urn:li:activity:<id>` or `/posts/<slug>` id). The canonical URL is the
  Post's dedup key.

### Deduplication & idempotency

- Ingestion **upserts** sharing events on the natural key
  `(group_id, timestamp, raw_sender, canonical_url)` — re-importing the same or
  overlapping export produces no new sharing events.
- Posts are upserted on canonical URL and accumulate sharing events across both
  groups.
- The same person sharing the same link at **different** timestamps yields
  **distinct** sharing events (legitimate re-shares are preserved).
- Each import file's content hash is recorded; a byte-identical re-upload raises
  a non-blocking warning.

### Identity resolution

- Raw sender strings are stored verbatim on every sharing event.
- On import, a raw sender matching a known alias auto-links to its member. An
  unrecognized sender links to **no** member (the event shows "Pending
  attribution") and creates an `UNKNOWN_SENDER` review item.
- There is **no fuzzy auto-merging**. Merging aliases into a member is always an
  explicit admin action, which retroactively re-attributes that alias's events.

### Review workflow

- The review queue exposes the three item kinds with these actions, all
  reversible and all re-running dedup/attribution on affected records:
  - `UNKNOWN_SENDER` → map to existing member, or create new member.
  - `OTHER_LINKEDIN` → dismiss (confirm not-a-post), or promote to post.
  - `UNRESOLVED_SHORT_LINK` → paste resolved URL, or dismiss.

### Dashboard

- **Public, no login.** Post card/row shows: the cached preview (author, role,
  excerpt) when available — otherwise the URL in the "no preview" style — a
  clickable link, who shared it (member display name(s) **and** the raw
  sender/phone, acceptable because the deployment is internal-for-now),
  first/last-shared dates, and share/distinct-sharer count. **Group is not
  displayed** (per the finalized decision; the design's group filter and group
  tags are removed at implementation).
- The list offers a **rows / cards density toggle**.
- The **post detail** view lists every sharing event with its sharer, timestamp,
  and the optional accompanying note, marks the first share, and links out to
  LinkedIn.
- Posts with an unresolved sharer still appear, labelled **"Pending
  attribution."**
- **Default sort:** most-recently-shared first. Controls: sort (recent /
  most-shared), filter-by-member, density toggle, and text search over URL/slug
  and any fetched preview text. No tags/topics in v1.
- A single app-wide **"last updated"** timestamp reflects the most recent
  successful ingestion.
- **Visual source of truth:** the delivered design system at `Industry/`,
  specifically the operate-mode **Postboard** template
  (`Industry/templates/postboard/`) on the attached **Organic** system, and its
  component pages. Implementation consumes those tokens/components; it strips the
  group filter and group tags to honor the group-hidden decision.

### Access control (interim)

- A single shared **admin password/token** gates the mutating routes (ingest,
  review, member edits). The dashboard remains open. Full per-member
  authentication is deferred to v2.

## Testing Decisions

Tests assert **external, observable behaviour** — what the app does through its
public boundaries — never internal implementation details. A good test here
feeds a realistic input at a seam and asserts on queryable outcomes, so the
internals (parser structure, canonicalization helpers) can be refactored freely.

- **Primary seam — the ingestion service** (`ingest(rawExportText, groupId) →
  ImportResult`), run against a real temporary SQLite database. This single seam
  exercises the whole pipeline together: parsing, URL extraction, classification,
  canonicalization, dedup/idempotency, identity matching, and review-queue
  routing. Assertions are made through the same public query API the dashboard
  uses. Coverage should include, at minimum:
  - iOS and Android export formats, including multi-line messages and skipped
    system lines.
  - Idempotency: importing the same export twice, and importing overlapping
    exports, both yield zero new sharing events the second time.
  - Same person + same link + different timestamps → two distinct sharing events.
  - Canonicalization collapses tracking-param variants of one post into one Post.
  - Classification routes profiles/company/jobs to `OTHER_LINKEDIN` and failed
    short links to `UNRESOLVED_SHORT_LINK` review items.
  - Unknown senders produce "Pending attribution" events and an `UNKNOWN_SENDER`
    review item; mapping the alias retroactively re-attributes prior events.
- **Secondary seam — the HTTP boundary**: dashboard queries (default sort,
  most-shared sort, filter-by-member, URL search) and review-queue actions
  (each action's effect and its reversibility), tested through the route
  handlers.
- The two outbound HTTP concerns — short-link resolution and the
  `PreviewFetcher` — are the external dependencies; both are stubbed at their
  boundaries so tests stay deterministic and offline. Short link: success →
  reclassified, failure → review item. Preview: success → cached on the Post,
  failure → `preview_unavailable` set, ingestion still succeeds; an
  admin-edited preview is not overwritten by a later fetch.
- **Prior art:** none (greenfield). These two seams and the "temporary real
  SQLite, assert via public query API" pattern establish the convention for the
  project.

## Out of Scope

- **Engagement tracking of any kind** (share-count *display* aside): no member
  upvotes/reactions, no "I engaged" marking — deferred to v2.
- **Any LinkedIn activity/engagement metrics** (likes, comments, impressions) —
  never fetched, never claimed. (Best-effort public *preview* fetching — author,
  title, excerpt — is in scope and is not an engagement claim.)
- **Automated WhatsApp ingestion** via unofficial libraries or the Business
  Cloud API — excluded by ToS/feasibility; only the adapter seam is prepared for
  a future permitted source.
- **Per-member authentication / accounts** and any role model beyond the single
  interim admin token — deferred to v2.
- **Multi-group UI** (group display, filter-by-group) — `group_id` is modelled
  but not surfaced.
- **Topics/tags, categorization, or any feature not serving discovery,
  attribution, or engagement.**
- **Scheduler / automated periodic export** — the WhatsApp "Export chat" tap is
  irreducibly manual; only post-export upload is automated (folder-watch).

## Further Notes

- The one irreducible manual step is tapping **"Export chat → Save to Drive"** in
  WhatsApp; everything after is automated by the folder-watch source. Robust
  idempotency is what makes infrequent, fully-overlapping re-exports safe and
  removes the need for daily effort.
- Raw export files retained by the admin are the ultimate source of truth; the
  SQLite file (nightly file-copy backup on the host) protects the expensive,
  irreplaceable manual-attribution work.
- `lnkd.in` resolution needs only the HTTP redirect (`Location`) — no LinkedIn
  authentication — because only the post's *identity* is required, not its
  contents. Resolution can still fail or be rate-limited, which is precisely why
  failures fall to the review queue. A real `lnkd.in` sample from the group
  should be used to verify exact redirect behaviour before implementing that
  path.
- The GitHub issue tracker is configured (`docs/agents/issue-tracker.md`); this
  spec is published as issue #1 and the implementation tickets are its children.
- A complete, interactive design prototype was delivered at `Industry/` (the
  Postboard template on the Organic system). It encodes the UI for every screen
  — list, post detail, member view, pending attribution, import flow, review
  queue, empty states, and a mobile frame. Two prototype decisions were
  reconciled against this spec: **post previews are adopted** (best-effort,
  cached, admin-editable), and **groups remain hidden** (the prototype's group
  filter/tags are removed at implementation).
