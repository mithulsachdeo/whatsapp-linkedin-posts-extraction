import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDashboard } from '../query/dashboard.js';
import { layout } from '../views/layout.js';
import { renderDashboard } from '../views/dashboard.js';
import { renderImportPlaceholder, renderReviewPlaceholder } from '../views/placeholders.js';
import { detectAdmin, requireAdmin } from './adminAuth.js';

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

  app.use(detectAdmin(adminToken));
  // Design-system tokens/components are the visual source of truth; served
  // as-is rather than copied, so retuning Industry/styles.css is reflected
  // without a build step.
  app.use('/assets', express.static(INDUSTRY_DIR));

  app.get('/', (req, res) => {
    const data = getDashboard(db);
    const body = renderDashboard(data, { isAdmin: req.isAdmin });
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
        body: renderImportPlaceholder(),
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

  return app;
}
