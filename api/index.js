// Vercel serverless entry. The Turso migration made this possible: the DB is
// remote (no disk) and the background schedulers are gone, so the whole app is
// just a request handler. This file reuses the SAME createApp() the local
// server (src/server.js) uses — no behavior fork.
//
// Cold start cost (opening the libSQL connection + running migrations) is paid
// ONCE per warm instance and memoized as a promise; subsequent invocations on
// the same instance reuse it. resolveDbConfig() reads DATABASE_URL +
// DATABASE_AUTH_TOKEN from the Vercel env in production.
import { createApp } from '../src/http/app.js';
import { openDb } from '../src/db/connection.js';
import { resolveDbConfig } from '../src/db/config.js';
import { migrate } from '../src/db/migrate.js';
import { HttpPreviewFetcher } from '../src/preview/previewFetcher.js';
import { HttpShortLinkResolver } from '../src/ingest/shortLinkResolver.js';

let appPromise;

// Exported so tests can exercise the exact wiring Vercel runs (against an
// in-memory DB under NODE_ENV=test) without going through the Vercel runtime.
export function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      const db = await openDb(resolveDbConfig());
      await migrate(db);
      return createApp(db, {
        previewFetcher: HttpPreviewFetcher,
        shortLinkResolver: HttpShortLinkResolver,
      });
    })().catch((err) => {
      // Don't cache a failed init — let the next invocation retry a cold start
      // rather than wedging the instance on a transient DB hiccup.
      appPromise = undefined;
      throw err;
    });
  }
  return appPromise;
}

export default async function handler(req, res) {
  const app = await getApp();
  return app(req, res);
}
