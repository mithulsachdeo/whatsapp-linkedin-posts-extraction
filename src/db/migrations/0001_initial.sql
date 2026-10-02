-- Core schema per the design spec's conceptual data model
-- (docs/superpowers/specs/2026-09-30-linkedin-post-discovery-design.md).
-- Ticket 1 ships this DDL only -- no ingestion/extraction logic yet, so every
-- table below starts and stays empty until the ingestion ticket lands. The
-- shape is laid down now because it is pure, low-risk DDL that the ingestion,
-- review-queue, and dashboard tickets all build on; the ingestion ticket may
-- still need a follow-up migration to adjust it once real exports are parsed.

CREATE TABLE members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Aliases: raw WhatsApp sender strings (phone numbers and display names are
-- equal-strength aliases) that resolve to a member.
CREATE TABLE aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  raw_value TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_aliases_member_id ON aliases(member_id);

-- Posts: one row per unique LinkedIn post, keyed on its canonical URL.
CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical_url TEXT NOT NULL UNIQUE,
  preview_author TEXT,
  preview_role TEXT,
  preview_excerpt TEXT,
  preview_unavailable INTEGER NOT NULL DEFAULT 0,
  preview_edited INTEGER NOT NULL DEFAULT 0,
  first_shared_at TEXT,
  last_shared_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Sharing events: one occurrence of a post being shared. Natural key per spec
-- is (group_id, timestamp, raw_sender, canonical_url); canonical_url is
-- represented here via post_id since posts are upserted on canonical_url.
CREATE TABLE sharing_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL,
  raw_sender TEXT NOT NULL,
  member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  message_timestamp TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (group_id, message_timestamp, raw_sender, post_id)
);
CREATE INDEX idx_sharing_events_post_id ON sharing_events(post_id);
CREATE INDEX idx_sharing_events_member_id ON sharing_events(member_id);

-- Review queue: unresolved units of work surfaced to the admin.
CREATE TABLE review_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('UNKNOWN_SENDER', 'OTHER_LINKEDIN', 'UNRESOLVED_SHORT_LINK')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED', 'DISMISSED')),
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at TEXT
);

-- Import batches: one row per ingested file. content_hash backs the
-- byte-identical re-upload warning; the dashboard's "last updated" timestamp
-- is the most recent COMPLETE batch's completed_at.
CREATE TABLE import_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT NOT NULL,
  filename TEXT,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETE', 'FAILED')),
  messages_read INTEGER NOT NULL DEFAULT 0,
  links_found INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT
);
CREATE INDEX idx_import_batches_content_hash ON import_batches(content_hash);
