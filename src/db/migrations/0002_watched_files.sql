-- Folder-watch ingestion (ticket #9): tracks which files in a watched folder
-- have already been fed through the ingestion pipeline, so polling the same
-- folder repeatedly never re-ingests a file it has already processed.
-- Keyed on (folder_path, filename) rather than content_hash alone -- a
-- content-identical re-drop of the same filename is still worth re-checking
-- if the file mtime changed (e.g. a replaced export), and import_batches'
-- own content_hash already handles the byte-identical-reupload warning.
CREATE TABLE watched_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_mtime TEXT NOT NULL,
  content_hash TEXT,
  import_batch_id INTEGER REFERENCES import_batches(id) ON DELETE SET NULL,
  error TEXT,
  processed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (folder_path, filename)
);
