// Admin gate (ticket #10, spec req. 41): a single shared admin
// password/token gates every mutating route while the public dashboard and
// post detail stay open. This replaces the interim header-only gate (ticket
// #1) with a real login: POST /login checks the password and sets a signed,
// httpOnly session cookie; requireAdmin checks that cookie on every
// request. There is still no per-member auth or account model -- that is
// deferred to v2 per the spec.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const ADMIN_COOKIE_NAME = 'postboard_admin';

// The session cookie carries no user-specific data -- there is exactly one
// admin identity -- so the "session" is just a constant payload signed with
// the admin token. Anyone who can produce a valid signature already knows
// the admin token, so this is no weaker than the token itself, and it means
// no separate session secret needs configuring or persisting.
const SESSION_PAYLOAD = 'admin';

function sign(secret, value) {
  return createHmac('sha256', secret).update(value).digest('hex');
}

function timingSafeEqualStrings(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * The Set-Cookie header value for a freshly-authenticated admin session.
 * @param {string} secret
 */
export function createSessionCookie(secret) {
  const value = `${SESSION_PAYLOAD}.${sign(secret, SESSION_PAYLOAD)}`;
  // httpOnly: not readable from client-side JS. SameSite=Lax: sent on normal
  // navigation/form posts but not cross-site, a cheap CSRF mitigant given
  // every mutating route is a same-site form post. No `Secure` flag -- this
  // app is expected to run behind a reverse proxy or on a trusted LAN in v1;
  // revisit if/when it's deployed directly over plain HTTP on the open internet.
  return `${ADMIN_COOKIE_NAME}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 60 * 60}`;
}

/** The Set-Cookie header value that clears the admin session. */
export function clearSessionCookie() {
  return `${ADMIN_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) cookies[name] = decodeURIComponent(value);
  }
  return cookies;
}

/**
 * @param {string} secret
 * @param {string | undefined} cookieValue the raw `postboard_admin` cookie value
 */
export function isValidSessionCookie(secret, cookieValue) {
  if (!secret || !cookieValue) return false;
  const [payload, signature] = cookieValue.split('.');
  if (payload !== SESSION_PAYLOAD || !signature) return false;
  return timingSafeEqualStrings(signature, sign(secret, SESSION_PAYLOAD));
}

/**
 * Express middleware: sets req.isAdmin based on the signed session cookie.
 * If no admin token is configured, admin routes are entirely unreachable
 * (fails closed, not open).
 * @param {string | undefined} adminToken
 */
export function detectAdmin(adminToken) {
  return (req, res, next) => {
    const cookies = parseCookies(req.headers.cookie);
    req.isAdmin = isValidSessionCookie(adminToken, cookies[ADMIN_COOKIE_NAME]);
    next();
  };
}

/**
 * Express middleware: rejects any request that isn't recognized as admin.
 * Must run after detectAdmin. GET requests (admin page loads) redirect to
 * the login page, preserving the original URL to return to; non-GET
 * requests (mutating actions) 401, since those are form posts expected to
 * originate from an already-authenticated page rather than a page a visitor
 * navigates to directly.
 */
export function requireAdmin(req, res, next) {
  if (!req.isAdmin) {
    if (req.method === 'GET') {
      const next_ = encodeURIComponent(req.originalUrl);
      res.redirect(`/login?next=${next_}`);
      return;
    }
    res.status(401).send('Unauthorized: please log in as admin');
    return;
  }
  next();
}
