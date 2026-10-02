// Folder-watch ingestion adapter (ticket #9): polls a configured
// local/cloud-synced folder for new .txt/.zip files and feeds each one
// through the exact same WhatsAppTxtAdapter + ingest() pipeline manual
// browser upload uses -- folder-watch is a second *source* in front of the
// same IngestionAdapter seam, not a parallel pipeline. Each watched folder
// maps to one admin-configured group (src/ingest/watchedFolders.js); manual
// upload remains the fallback path into the same code.
import fs from 'node:fs';
import path from 'node:path';
import { WhatsAppTxtAdapter } from './adapter.js';
import { ingest } from './ingest.js';

/**
 * @typedef {{ path: string, groupId: string }} WatchedFolder
 */

/**
 * Polls every watched folder once for new/changed .txt or .zip files and
 * ingests each one found. Safe to call repeatedly (e.g. on a timer) --
 * already-processed files (by folder+filename+mtime) are skipped.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {WatchedFolder[]} folders
 * @param {{ previewFetcher?: object, shortLinkResolver?: object }} [options]
 * @returns {Array<object>} one entry per file/folder that produced a result this poll
 */
export function pollFolders(db, folders, options = {}) {
  const results = [];
  for (const folder of folders) {
    results.push(...pollFolder(db, folder, options));
  }
  return results;
}

function pollFolder(db, folder, options) {
  const { path: folderPath, groupId } = folder;

  let entries;
  try {
    entries = fs.readdirSync(folderPath, { withFileTypes: true });
  } catch (err) {
    // A folder that isn't there yet (not synced down, or misconfigured) is
    // expected to happen transiently with cloud-synced directories -- never
    // throw out of a poll over it, just report it and move on.
    return [{ folderPath, filename: null, status: 'FOLDER_UNAVAILABLE', error: err.message }];
  }

  const results = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const lower = entry.name.toLowerCase();
    if (!lower.endsWith('.txt') && !lower.endsWith('.zip')) continue;

    const filePath = path.join(folderPath, entry.name);
    const mtime = fs.statSync(filePath).mtime.toISOString();

    const alreadyProcessed = db
      .prepare('SELECT 1 FROM watched_files WHERE folder_path = ? AND filename = ? AND file_mtime = ?')
      .get(folderPath, entry.name, mtime);
    if (alreadyProcessed) continue;

    try {
      const buffer = fs.readFileSync(filePath);
      const loaded = WhatsAppTxtAdapter.load(buffer, entry.name);
      const result = ingest(db, loaded.text, groupId, {
        filename: loaded.sourceFilename ?? entry.name,
        contentHash: loaded.contentHash,
        previewFetcher: options.previewFetcher,
        shortLinkResolver: options.shortLinkResolver,
      });

      markFileProcessed(db, {
        folderPath,
        filename: entry.name,
        mtime,
        contentHash: loaded.contentHash,
        importBatchId: result.importBatchId,
      });
      results.push({ folderPath, filename: entry.name, status: 'INGESTED', result });
    } catch (err) {
      // Best-effort per file (mirrors ingestion never blocking on preview
      // fetch): one malformed file in a watched folder must not block the
      // rest of the folder, and marking it processed despite the failure is
      // what keeps a permanently-broken file from being retried on every
      // single future poll -- an admin fixing/replacing the file changes its
      // mtime, which is what makes the poller give it another try.
      markFileProcessed(db, { folderPath, filename: entry.name, mtime, contentHash: null, importBatchId: null, error: err.message });
      results.push({ folderPath, filename: entry.name, status: 'FAILED', error: err.message });
    }
  }
  return results;
}

function markFileProcessed(db, { folderPath, filename, mtime, contentHash, importBatchId, error }) {
  db.prepare(
    `INSERT INTO watched_files (folder_path, filename, file_mtime, content_hash, import_batch_id, error, processed_at)
     VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT(folder_path, filename) DO UPDATE SET
       file_mtime = excluded.file_mtime,
       content_hash = excluded.content_hash,
       import_batch_id = excluded.import_batch_id,
       error = excluded.error,
       processed_at = excluded.processed_at`
  ).run(folderPath, filename, mtime, contentHash, importBatchId, error ?? null);
}

/**
 * Starts polling `folders` on an interval. A no-op (returns a stub stop())
 * when no folders are configured, so wiring this into the server is always
 * safe even with folder-watch off.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {WatchedFolder[]} folders
 * @param {{ intervalMs?: number, previewFetcher?: object, shortLinkResolver?: object, onPoll?: (results: object[]) => void, onError?: (err: Error) => void }} [options]
 * @returns {{ stop: () => void }}
 */
export function startFolderWatchPoller(db, folders, options = {}) {
  if (!folders || folders.length === 0) return { stop() {} };

  const intervalMs = options.intervalMs ?? 60_000;
  const poll = () => {
    try {
      const results = pollFolders(db, folders, options);
      options.onPoll?.(results);
    } catch (err) {
      options.onError?.(err);
    }
  };

  poll(); // pick up anything already waiting before the first interval elapses
  const timer = setInterval(poll, intervalMs);
  // Never hold the process open just for folder-watch polling (e.g. tests, a
  // CLI one-shot run) -- the server's own listen() keeps it alive.
  timer.unref?.();

  return { stop: () => clearInterval(timer) };
}
