import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDashboard } from '../query/dashboard.js';
import { layout } from '../views/layout.js';
import { renderDashboard } from '../views/dashboard.js';
import { renderImportPage } from '../views/import.js';
import { renderReviewPlaceholder } from '../views/placeholders.js';
import { detectAdmin, requireAdmin } from './adminAuth.js';
import { WhatsAppTxtAdapter } from '../ingest/adapter.js';
import { ingest } from '../ingest/ingest.js';
import { GROUPS } from '../ingest/groups.js';
import { setPreviewOverride } from '../preview/previewCache.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDUSTRY_DIR = path.join(__dirname, '..', '..', 'Industry');

/**
 * Builds the Express app. HTTP is the secondary test seam: routes are kept
 * thin, delegating all data access to the public query API so route tests
 * exercise the same seam the dashboard renders through.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ adminToken?: string }} [options]
 */
export function createApp(db, options = {}) {
  const app = express();
  const adminToken = options.adminToken ?? process.env.ADMIN_TOKEN;
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

  app.use(express.urlencoded({ extended: false }));
  app.use(detectAdmin(adminToken));
  // Design-system tokens/components are the visual source of truth; served
  // as-is rather than copied, so retuning Industry/styles.css is reflected
  // without a build step.
  app.use('/assets', express.static(INDUSTRY_DIR));

  app.get('/', (req, res) => {
    const data = getDashboard(db);
    const density = req.query.density === 'cards' ? 'cards' : 'rows';
    const body = renderDashboard(data, { isAdmin: req.isAdmin, density });
    res.send(
      layout({ title: 'Posts', active: 'posts', isAdmin: req.isAdmin, lastUpdated: data.lastUpdated, body })
    );
  });

  app.get('/import', requireAdmin, (req, res) => {
    const data = getDashboard(db);
    res.send(
      layout({
        title: 'Import',
        active: 'import',
        isAdmin: req.isAdmin,
        lastUpdated: data.lastUpdated,
        body: renderImportPage(),
      })
    );
  });

  app.post('/import', requireAdmin, upload.single('file'), (req, res) => {
    const groupId = req.body?.groupId;
    const file = req.file;

    let body;
    if (!file) {
      body = renderImportPage({ error: 'Choose a .txt or .zip chat export to import.' });
    } else if (!GROUPS.some((g) => g.id === groupId)) {
      body = renderImportPage({ error: 'Choose which group this export belongs to.' });
    } else {
      try {
        const loaded = WhatsAppTxtAdapter.load(file.buffer, file.originalname);
        const result = ingest(db, loaded.text, groupId, {
          filename: loaded.sourceFilename ?? file.originalname,
          contentHash: loaded.contentHash,
          previewFetcher: options.previewFetcher,
        });
        body = renderImportPage({ result });
      } catch (err) {
        body = renderImportPage({ error: `Import failed: ${err.message}` });
      }
    }

    const refreshed = getDashboard(db);
    res.send(
      layout({
        title: 'Import',
        active: 'import',
        isAdmin: req.isAdmin,
        lastUpdated: refreshed.lastUpdated,
        body,
      })
    );
  });

  app.get('/review', requireAdmin, (req, res) => {
    const data = getDashboard(db);
    res.send(
      layout({
        title: 'Review',
        active: 'review',
        isAdmin: req.isAdmin,
        lastUpdated: data.lastUpdated,
        body: renderReviewPlaceholder(),
      })
    );
  });

  // Admin action (spec): manually set/edit a post's preview. Overrides
  // whatever was fetched (or not) and is never overwritten by a later fetch
  // -- see src/preview/previewCache.js's preview_edited guard.
  app.post('/posts/:id/preview', requireAdmin, (req, res) => {
    const postId = Number(req.params.id);
    const { author, role, excerpt } = req.body ?? {};
    setPreviewOverride(db, postId, {
      author: author?.trim() || null,
      role: role?.trim() || null,
      excerpt: excerpt?.trim() || null,
    });
    res.redirect('/');
  });

  return app;
}
