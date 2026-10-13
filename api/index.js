// Vercel serverless entry. Vercel's Express zero-config detector looks for an
// entrypoint that DIRECTLY imports express and exports an app (never calls
// listen) — so this file does exactly that: it exports a tiny gating Express
// app whose only job is to lazily build the REAL app (open the libSQL
// connection + run migrations ONCE, memoized across warm invocations) and
// delegate every request to it. Reuses the same createApp() as src/server.js.
import express from 'express';
import { createApp } from '../src/http/app.js';
import { openDb } from '../src/db/connection.js';
import { resolveDbConfig } from '../src/db/config.js';
import { migrate } from '../src/db/migrate.js';
import { HttpPreviewFetcher } from '../src/preview/previewFetcher.js';
import { HttpShortLinkResolver } from '../src/ingest/shortLinkResolver.js';

let realAppPromise;

// Returns a promise of the fully-built app (DB opened + migrated). Memoized so
// the cold-start cost is paid once per warm instance. A failed init is NOT
// cached, so the next request retries a clean cold start. Exported for tests.
export function getApp() {
  if (!realAppPromise) {
    realAppPromise = (async () => {
      const db = await openDb(resolveDbConfig());
      await migrate(db);
      return createApp(db, {
        previewFetcher: HttpPreviewFetcher,
        shortLinkResolver: HttpShortLinkResolver,
      });
    })().catch((err) => {
      realAppPromise = undefined;
      throw err;
    });
  }
  return realAppPromise;
}

// The exported entrypoint: an Express app that awaits readiness then hands the
// whole request to the real app. No body parser here, so the raw request
// stream reaches the real app's urlencoded/multer parsers intact.
const app = express();
app.use(async (req, res, next) => {
  try {
    const realApp = await getApp();
    realApp(req, res);
  } catch (err) {
    next(err);
  }
});

export default app;
