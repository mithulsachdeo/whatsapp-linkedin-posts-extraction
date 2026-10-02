// Interim admin gate per the spec: a single shared token, checked on every
// request via an `x-admin-token` header. No sessions/cookies yet -- that is
// a reasonable upgrade for the ingestion/review tickets if a header on
// every request proves annoying for a real browser flow, but it is enough
// to gate a GET placeholder today and to gate the mutating routes later.
// If no token is configured, admin routes are entirely unreachable (fails
// closed, not open).

/**
 * Express middleware: sets req.isAdmin based on the configured token.
 * @param {string | undefined} adminToken
 */
export function detectAdmin(adminToken) {
  return (req, res, next) => {
    req.isAdmin = Boolean(adminToken) && req.get('x-admin-token') === adminToken;
    next();
  };
}

/**
 * Express middleware: 403s any request that isn't recognized as admin.
 * Must run after detectAdmin.
 */
export function requireAdmin(req, res, next) {
  if (!req.isAdmin) {
    res.status(403).send('Forbidden: admin token required');
    return;
  }
  next();
}
