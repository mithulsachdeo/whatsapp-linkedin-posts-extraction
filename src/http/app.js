import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getDashboard, getDateRangeBounds, getMemberFilterOptions, getPostDetail, getPostUrl } from '../query/dashboard.js';
import { readIdsFromCookieHeader, addReadId, removeReadId, serializeReadCookie } from './readCookie.js';
import { parseDensity, densityFromCookieHeader, serializeDensityCookie } from './densityCookie.js';
import { gutterHiddenFromCookieHeader } from './gutterCookie.js';
import {
  getUnknownSenderReviewItems,
  getOtherLinkedInReviewItems,
  getMembers,
} from '../query/review.js';
import { layout } from '../views/layout.js';
import { renderDashboard, renderEditionFragment, BATCH_SIZE } from '../views/dashboard.js';
import { renderImportPage } from '../views/import.js';
import { renderPostDetail } from '../views/postDetail.js';
import { renderReviewPage } from '../views/review.js';
import { renderLoginPage } from '../views/login.js';
import { detectAdmin, requireAdmin, createSessionCookie, clearSessionCookie } from './adminAuth.js';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// The visual source of truth is the "Magazine Old Newspaper" design system in
// Industry_new2. Served as-is (styles.css @imports its token files, which
// resolve relative to /assets/styles.css), so retuning the tokens needs no
// build step.
const INDUSTRY_DIR = path.join(__dirname, '..', '..', 'Industry_new2');
const GUTTER_PHOTOS_DIR = path.join(INDUSTRY_DIR, 'gutter-photos');

// Gutter photo ads (spec): the 15 pre-optimized B&W photos are read from
// disk at request time -- never hardcoded -- so dropping files in/out of
// Industry_new2/gutter-photos/ just works. Guarded: a missing directory (or
// one with no .webp files) yields an empty list, which renderGutterAds
// treats as "render nothing" rather than throwing.
function readGutterPhotoFilenames() {
  try {
    return readdirSync(GUTTER_PHOTOS_DIR).filter((name) => name.toLowerCase().endsWith('.webp'));
  } catch {
    return [];
  }
}

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
    // Layout persistence (spec): an explicit ?density is honoured and
    // re-written to the cookie (so the latest explicit choice sticks);
    // otherwise fall back to the cookie, then to the cards default. This is
    // what lets postDetail's plain href="/" back-link restore the chosen
    // layout without carrying it in the query string.
    const explicitDensity = parseDensity(req.query.density);
    const density = explicitDensity ?? densityFromCookieHeader(req.headers.cookie) ?? 'cards';
    if (explicitDensity) {
      res.setHeader('Set-Cookie', serializeDensityCookie(explicitDensity));
    }
    // Always most-recently-shared first; a share-count sort was removed (it
    // ranked self-promotion, not endorsement). Any stray ?sort is ignored.
    const sort = 'recent';
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    // Per-device Unread/Read/All view (spec): purely a per-browser filter
    // layered on the shared query via the read_posts cookie -- never touches
    // global counts/order/attribution. Unread is the default.
    const view = req.query.view === 'read' || req.query.view === 'all' ? req.query.view : 'unread';
    const readIds = readIdsFromCookieHeader(req.headers.cookie);

    const queryOptions = { sort, view, readIds };
    if (search) queryOptions.search = search;

    // Filter-by-member (spec): "pending attribution" is itself a filter
    // choice alongside filtering to a specific resolved member. An unknown
    // or stale ?member= value is ignored rather than erroring, falling back
    // to "Everyone".
    let activeMember = null;
    const memberParam = req.query.member;
    if (memberParam === 'pending') {
      queryOptions.pending = true;
      activeMember = { type: 'pending' };
    } else if (memberParam) {
      const member = getMembers(db).find((m) => m.id === Number(memberParam));
      if (member) {
        queryOptions.memberId = member.id;
        activeMember = { type: 'member', id: member.id, displayName: member.displayName };
      }
    }

    // Date-range filter (spec): picker bounds are computed from the
    // member/search/view-filtered set BEFORE from/to are applied, so the
    // date filter never constrains its own bounds. ?from/?to are plain
    // strings here -- a malformed value is ignored by getDashboard/the view,
    // not validated on this side, same as the member-id lookup above.
    const dateRangeBounds = getDateRangeBounds(db, queryOptions);
    const from = typeof req.query.from === 'string' ? req.query.from : '';
    const to = typeof req.query.to === 'string' ? req.query.to : '';
    if (from) queryOptions.from = from;
    if (to) queryOptions.to = to;

    const data = getDashboard(db, queryOptions);
    const filterOptions = getMemberFilterOptions(db);
    // Gutter photo ads (spec): Posts-page only -- read here, in the `/`
    // route, rather than threaded through shared layout.js, so Import/
    // Review/Login/Post-detail never receive the photo list or markup.
    const guttersHidden = gutterHiddenFromCookieHeader(req.headers.cookie);
    const gutterPhotos = guttersHidden ? [] : readGutterPhotoFilenames();
    const body = renderDashboard(data, {
      isAdmin: req.isAdmin,
      density,
      sort,
      search,
      activeMember,
      filterOptions,
      view,
      from,
      to,
      dateRangeBounds,
      gutterPhotos,
      guttersHidden,
    });
    res.send(
      layout({ title: 'Posts', active: 'posts', isAdmin: req.isAdmin, lastUpdated: data.lastUpdated, body })
    );
  });

  // Partial edition dispatches endpoint for in-place pagination / lazy loading
  app.get('/dispatches', (req, res) => {
    const explicitDensity = parseDensity(req.query.density);
    const density = explicitDensity ?? densityFromCookieHeader(req.headers.cookie) ?? 'cards';
    const sort = 'recent';
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const view = req.query.view === 'read' || req.query.view === 'all' ? req.query.view : 'unread';
    const readIds = readIdsFromCookieHeader(req.headers.cookie);

    const queryOptions = { sort, view, readIds };
    if (search) queryOptions.search = search;

    let activeMember = null;
    const memberParam = req.query.member;
    if (memberParam === 'pending') {
      queryOptions.pending = true;
      activeMember = { type: 'pending' };
    } else if (memberParam) {
      const member = getMembers(db).find((m) => m.id === Number(memberParam));
      if (member) {
        queryOptions.memberId = member.id;
        activeMember = { type: 'member', id: member.id, displayName: member.displayName };
      }
    }

    // Date-range filter (spec): must round-trip through this pagination
    // fragment route the same way as /.
    const from = typeof req.query.from === 'string' ? req.query.from : '';
    const to = typeof req.query.to === 'string' ? req.query.to : '';
    if (from) queryOptions.from = from;
    if (to) queryOptions.to = to;

    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const limit = Math.max(1, parseInt(req.query.limit, 10) || BATCH_SIZE);
    const editionIndex = Math.floor(offset / limit) + 1;

    const data = getDashboard(db, queryOptions);
    const totalCount = data.posts.length;
    const batch = data.posts.slice(offset, offset + limit);

    const fragment = renderEditionFragment(batch, {
      offset,
      totalCount,
      density,
      view,
      editionIndex,
    });

    res.type('html').send(fragment);
  });

  // Post detail (ticket #8): public, no login, like the rest of the
  // dashboard -- cached preview/URL-only block, Open-on-LinkedIn/Copy-link
  // actions, and the full share history. An unknown or non-numeric id 404s
  // rather than falling back to the dashboard, since this is a direct link.
  app.get('/posts/:id', (req, res) => {
    const postId = Number(req.params.id);
    const post = Number.isInteger(postId) ? getPostDetail(db, postId) : null;
    const lastUpdated = getDashboard(db).lastUpdated;

    if (!post) {
      res.status(404).send(
        layout({
          title: 'Post not found',
          active: 'posts',
          isAdmin: req.isAdmin,
          lastUpdated,
          body: '<h1>Post not found</h1><p><a href="/">&larr; Back to all posts</a></p>',
        })
      );
      return;
    }

    res.send(
      layout({
        title: post.previewAuthor || 'Post',
        active: 'posts',
        isAdmin: req.isAdmin,
        lastUpdated,
        body: renderPostDetail(post, { isAdmin: req.isAdmin }),
      })
    );
  });

  // Outbound click-through (spec): the ONLY place a post gets marked read.
  // Looks the post's real URL up from the DB -- never redirects to a
  // user-supplied URL (no open redirect) -- and 404s for an unknown/
  // non-numeric id rather than redirecting anywhere. Public, no admin gate.
  app.get('/out/:postId', (req, res) => {
    const postId = Number(req.params.postId);
    const url = Number.isInteger(postId) ? getPostUrl(db, postId) : null;
    if (!url) {
      res.status(404).send(
        layout({
          title: 'Post not found',
          active: 'posts',
          isAdmin: req.isAdmin,
          lastUpdated: getDashboard(db).lastUpdated,
          body: '<h1>Post not found</h1><p><a href="/">&larr; Back to all posts</a></p>',
        })
      );
      return;
    }

    const readIds = readIdsFromCookieHeader(req.headers.cookie);
    res.setHeader('Set-Cookie', serializeReadCookie(addReadId(readIds, postId)));
    res.redirect(url);
  });

  // Restore to Unread (spec): removes the id from the read_posts cookie.
  // Redirects back to the Read view it was actioned from.
  app.post('/unarchive/:postId', (req, res) => {
    const postId = Number(req.params.postId);
    const readIds = readIdsFromCookieHeader(req.headers.cookie);
    if (Number.isInteger(postId)) {
      res.setHeader('Set-Cookie', serializeReadCookie(removeReadId(readIds, postId)));
    }
    res.redirect(safeNext(req.body?.returnTo) ?? '/?view=read');
  });

  // Admin login (ticket #10): the single gate in front of every mutating
  // route. `next` is restricted to an on-site path (must start with a
  // single `/`) so it can't be used as an open redirect.
  app.get('/login', (req, res) => {
    if (req.isAdmin) {
      res.redirect(safeNext(req.query.next) ?? '/');
      return;
    }
    res.send(
      layout({
        title: 'Admin login',
        active: 'posts',
        isAdmin: req.isAdmin,
        lastUpdated: getDashboard(db).lastUpdated,
        body: renderLoginPage({ next: typeof req.query.next === 'string' ? req.query.next : '' }),
      })
    );
  });

  app.post('/login', (req, res) => {
    const { password, next } = req.body ?? {};
    if (!adminToken || password !== adminToken) {
      res.status(401).send(
        layout({
          title: 'Admin login',
          active: 'posts',
          isAdmin: false,
          lastUpdated: getDashboard(db).lastUpdated,
          body: renderLoginPage({ error: 'Incorrect password.', next: typeof next === 'string' ? next : '' }),
        })
      );
      return;
    }
    res.setHeader('Set-Cookie', createSessionCookie(adminToken));
    res.redirect(safeNext(next) ?? '/');
  });

  app.post('/logout', (req, res) => {
    res.setHeader('Set-Cookie', clearSessionCookie());
    res.redirect('/');
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
    const members = getMembers(db);
    const toast = buildToastFromQuery(req.query);
    const otherLinkedInToast = buildOtherLinkedInToastFromQuery(req.query);
    res.send(
      layout({
        title: 'Review',
        active: 'review',
        isAdmin: req.isAdmin,
        lastUpdated: data.lastUpdated,
        body: renderReviewPage(
          { items, members, otherLinkedInItems },
          { toast, otherLinkedInToast }
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

// Restricts post-login redirects to an on-site path -- `next` is
// user-controlled (round-tripped through the login form), so anything that
// could be interpreted as an absolute/protocol-relative URL is rejected
// rather than followed.
function safeNext(next) {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//')) return null;
  return next;
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

