import { createApp } from './http/app.js';
import { openDb } from './db/connection.js';
import { resolveDbConfig } from './db/config.js';
import { migrate } from './db/migrate.js';
import { HttpPreviewFetcher } from './preview/previewFetcher.js';
import { HttpShortLinkResolver } from './ingest/shortLinkResolver.js';

const PORT = process.env.PORT ?? 3000;

const db = await openDb(resolveDbConfig());
await migrate(db);

// The live app wires the real network-fetching PreviewFetcher and
// ShortLinkResolver; ingest()'s own defaults (NullPreviewFetcher,
// NullShortLinkResolver) keep every other caller -- tests, anything that
// omits the option -- offline-safe.
const app = createApp(db, { previewFetcher: HttpPreviewFetcher, shortLinkResolver: HttpShortLinkResolver });

app.listen(PORT, () => {
  console.log(`Postboard listening on http://localhost:${PORT}`);
});
