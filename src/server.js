import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db/connection.js';
import { migrate } from './db/migrate.js';
import { createApp } from './http/app.js';
import { HttpPreviewFetcher } from './preview/previewFetcher.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT ?? 3000;
const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, '..', 'data', 'postboard.sqlite');

mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = openDb(DB_PATH);
migrate(db);

// The live app wires the real network-fetching PreviewFetcher; ingest()'s
// own default (NullPreviewFetcher) keeps every other caller -- tests,
// anything that omits the option -- offline-safe.
const app = createApp(db, { previewFetcher: HttpPreviewFetcher });

app.listen(PORT, () => {
  console.log(`Postboard listening on http://localhost:${PORT} (db: ${DB_PATH})`);
});
