// Resolves the libSQL connection config from the environment. One source of
// truth so routes, scripts and tests agree. Tests use an in-memory DB; dev
// falls back to a local file; prod requires a Turso URL + auth token.
export function resolveDbConfig(env = process.env) {
  if (env.NODE_ENV === 'test') return { url: ':memory:' };
  if (env.DATABASE_URL) {
    const cfg = { url: env.DATABASE_URL };
    if (env.DATABASE_AUTH_TOKEN) cfg.authToken = env.DATABASE_AUTH_TOKEN;
    return cfg;
  }
  return { url: 'file:data/postboard.db' };
}
