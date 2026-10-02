import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db/connection.js';
import { migrate } from './db/migrate.js';
import { createApp } from './http/app.js';
import { HttpPreviewFetcher } from './preview/previewFetcher.js';
import { HttpShortLinkResolver } from './ingest/shortLinkResolver.js';
import { loadWatchedFolders } from './ingest/watchedFolders.js';
import { startFolderWatchPoller } from './ingest/folderWatch.js';
import { startNightlyBackupScheduler } from './db/backup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT ?? 3000;
const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, '..', 'data', 'postboard.sqlite');
const BACKUP_DIR = process.env.BACKUP_DIR ?? path.join(__dirname, '..', 'data', 'backups');

mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = openDb(DB_PATH);
migrate(db);

// The live app wires the real network-fetching PreviewFetcher and
// ShortLinkResolver; ingest()'s own defaults (NullPreviewFetcher,
// NullShortLinkResolver) keep every other caller -- tests, anything that
// omits the option -- offline-safe.
const app = createApp(db, { previewFetcher: HttpPreviewFetcher, shortLinkResolver: HttpShortLinkResolver });

// Folder-watch ingestion (ticket #9): a second source feeding the same
// WhatsAppTxtAdapter pipeline manual upload uses. Off by default -- a no-op
// when WATCHED_FOLDERS is unset, so folder-watch never needs opting out of,
// only opting into.
const watchedFolders = loadWatchedFolders();
startFolderWatchPoller(db, watchedFolders, {
  intervalMs: process.env.FOLDER_WATCH_INTERVAL_MS ? Number(process.env.FOLDER_WATCH_INTERVAL_MS) : undefined,
  previewFetcher: HttpPreviewFetcher,
  shortLinkResolver: HttpShortLinkResolver,
  onError: (err) => console.error('Folder-watch poll failed:', err),
});
if (watchedFolders.length > 0) {
  console.log(`Folder-watch: polling ${watchedFolders.length} folder(s) every ${process.env.FOLDER_WATCH_INTERVAL_MS ?? 60000}ms`);
}

// Nightly SQLite backup (ticket #11): a timestamped VACUUM INTO snapshot,
// pruned to a retention window. See src/db/backup.js for the restore
// procedure. Runs once at startup, then every BACKUP_INTERVAL_MS (default
// 24h), so a fresh backup always exists without waiting a full interval.
startNightlyBackupScheduler(db, BACKUP_DIR, {
  intervalMs: process.env.BACKUP_INTERVAL_MS ? Number(process.env.BACKUP_INTERVAL_MS) : undefined,
  retentionDays: process.env.BACKUP_RETENTION_DAYS ? Number(process.env.BACKUP_RETENTION_DAYS) : undefined,
  onBackup: ({ backupPath, deleted }) => {
    console.log(`Backup: wrote ${backupPath}${deleted.length > 0 ? `, pruned ${deleted.length} old backup(s)` : ''}`);
  },
  onError: (err) => console.error('Backup failed:', err),
});

app.listen(PORT, () => {
  console.log(`Postboard listening on http://localhost:${PORT} (db: ${DB_PATH})`);
});
