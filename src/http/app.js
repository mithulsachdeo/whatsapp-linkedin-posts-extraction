import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDashboard } from '../query/dashboard.js';
import {
  getUnknownSenderReviewItems,
  getOtherLinkedInReviewItems,
  getUnresolvedShortLinkReviewItems,
  getMembers,
} from '../query/review.js';
import { layout } from '../views/layout.js';
import { renderDashboard } from '../views/dashboard.js';
import { renderImportPage } from '../views/import.js';
import { renderReviewPage } from '../views/review.js';
import { detectAdmin, requireAdmin } from './adminAuth.js';
import { WhatsAppTxtAdapter } from '../ingest/adapter.js';
import { ingest } from '../ingest/ingest.js';
import { GROUPS } from '../ingest/groups.js';
import { setPreviewOverride } from '../preview/previewCache.js';
import { mapAliasToMember, createMemberAndMapAlias, undoAliasMapping } from '../identity/aliases.js';
import {
  dismissOtherLinkedInItem,
  promoteOtherLinkedInItem,
  undoOtherLinkedInAction,
} from '../review/otherLinkedIn.js';
import {
  dismissShortLinkItem,
  resolveShortLinkItem,
  undoShortLinkAction,
} from '../review/shortLink.js';

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
          shortLinkResolver: options.shortLinkResolver,
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
    const items = getUnknownSenderReviewItems(db);
    const otherLinkedInItems = getOtherLinkedInReviewItems(db);
    const shortLinkItems = getUnresolvedShortLinkReviewItems(db);
    const members = getMembers(db);
    const toast = buildToastFromQuery(req.query);
    const otherLinkedInToast = buildOtherLinkedInToastFromQuery(req.query);
    const shortLinkToast = buildShortLinkToastFromQuery(req.query);
    const shortLinkError = buildShortLinkErrorFromQuery(req.query);
    res.send(
      layout({
        title: 'Review',
        active: 'review',
        isAdmin: req.isAdmin,
        lastUpdated: data.lastUpdated,
        body: renderReviewPage(
          { items, members, otherLinkedInItems, shortLinkItems },
          { toast, otherLinkedInToast, shortLinkToast, shortLinkError }
        ),
      })
    );
  });

  // Review action (spec): map an unknown sender to an existing member, or
  // create a new one -- either way retroactively re-attributes every past
  // sharing event from that raw sender. Redirects back to /review with the
  // toast encoded in the query string so the Undo form can reverse exactly
  // this match.
  app.post('/review/:id/match', requireAdmin, (req, res) => {
    const item = getUnknownSenderReviewItems(db).find((i) => i.id === Number(req.params.id));
    if (!item) {
      res.redirect('/review');
      return;
    }

    const { memberId, newMemberName } = req.body ?? {};
    const trimmedName = newMemberName?.trim();

    let memberName;
    let createdMemberId = '';
    if (memberId) {
      const member = getMembers(db).find((m) => m.id === Number(memberId));
      if (!member) {
        res.redirect('/review');
        return;
      }
      mapAliasToMember(db, item.rawSender, member.id);
      memberName = member.displayName;
    } else if (trimmedName) {
      createdMemberId = createMemberAndMapAlias(db, item.rawSender, trimmedName);
      memberName = trimmedName;
    } else {
      res.redirect('/review');
      return;
    }

    const params = new URLSearchParams({
      matched: '1',
      rawSender: item.rawSender,
      memberName,
      createdMemberId: String(createdMemberId || ''),
    });
    res.redirect(`/review?${params.toString()}`);
  });

  // Undo (spec): reverses the match a review-screen toast is still showing.
  app.post('/review/undo', requireAdmin, (req, res) => {
    const { rawSender, createdMemberId } = req.body ?? {};
    if (rawSender) {
      undoAliasMapping(db, rawSender, {
        createdMemberId: createdMemberId ? Number(createdMemberId) : undefined,
      });
    }
    res.redirect('/review');
  });

  // Review actions (spec): dismiss confirms a non-post LinkedIn link is not
  // a post; promote reclassifies it as one, flowing into dedup/attribution
  // (src/review/otherLinkedIn.js). Both reversible via the shared undo route.
  app.post('/review/other/:id/dismiss', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const item = getOtherLinkedInReviewItems(db).find((i) => i.id === id);
    if (!item || !dismissOtherLinkedInItem(db, id)) {
      res.redirect('/review');
      return;
    }
    res.redirect(`/review?${buildOtherLinkedInRedirectParams('dismissed', item)}`);
  });

  app.post('/review/other/:id/promote', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const item = getOtherLinkedInReviewItems(db).find((i) => i.id === id);
    if (!item || !promoteOtherLinkedInItem(db, id)) {
      res.redirect('/review');
      return;
    }
    res.redirect(`/review?${buildOtherLinkedInRedirectParams('promoted', item)}`);
  });

  app.post('/review/other/:id/undo', requireAdmin, (req, res) => {
    undoOtherLinkedInAction(db, Number(req.params.id));
    res.redirect('/review');
  });

  // Review actions (spec): paste the real URL a short link pointed to --
  // re-runs it through the classify/canonicalize/dedup pipeline
  // (src/review/shortLink.js) -- or dismiss. Both reversible via the shared
  // undo route.
  app.post('/review/short/:id/resolve', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const item = getUnresolvedShortLinkReviewItems(db).find((i) => i.id === id);
    if (!item) {
      res.redirect('/review');
      return;
    }
    if (!resolveShortLinkItem(db, id, req.body?.resolvedUrl)) {
      res.redirect(`/review?shortError=1&shortErrorId=${id}`);
      return;
    }
    res.redirect(`/review?${buildShortLinkRedirectParams('resolved', item)}`);
  });

  app.post('/review/short/:id/dismiss', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const item = getUnresolvedShortLinkReviewItems(db).find((i) => i.id === id);
    if (!item || !dismissShortLinkItem(db, id)) {
      res.redirect('/review');
      return;
    }
    res.redirect(`/review?${buildShortLinkRedirectParams('dismissed', item)}`);
  });

  app.post('/review/short/:id/undo', requireAdmin, (req, res) => {
    undoShortLinkAction(db, Number(req.params.id));
    res.redirect('/review');
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

function buildToastFromQuery(query) {
  if (query.matched !== '1' || !query.rawSender || !query.memberName) return null;
  return {
    rawSender: String(query.rawSender),
    memberName: String(query.memberName),
    createdMemberId: query.createdMemberId ? Number(query.createdMemberId) : null,
  };
}

function buildOtherLinkedInRedirectParams(action, item) {
  return new URLSearchParams({ otherAction: action, otherId: String(item.id), otherUrl: item.url }).toString();
}

function buildOtherLinkedInToastFromQuery(query) {
  if (!['dismissed', 'promoted'].includes(query.otherAction) || !query.otherId || !query.otherUrl) return null;
  return {
    action: query.otherAction,
    id: Number(query.otherId),
    url: String(query.otherUrl),
  };
}

function buildShortLinkRedirectParams(action, item) {
  return new URLSearchParams({ shortAction: action, shortId: String(item.id), shortUrl: item.url }).toString();
}

function buildShortLinkToastFromQuery(query) {
  if (!['dismissed', 'resolved'].includes(query.shortAction) || !query.shortId || !query.shortUrl) return null;
  return {
    action: query.shortAction,
    id: Number(query.shortId),
    url: String(query.shortUrl),
  };
}

function buildShortLinkErrorFromQuery(query) {
  if (query.shortError !== '1' || !query.shortErrorId) return null;
  return { id: Number(query.shortErrorId) };
}
