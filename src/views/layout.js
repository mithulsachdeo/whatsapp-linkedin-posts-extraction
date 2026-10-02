// Server-rendered HTML via template literals -- no templating-engine
// dependency. Escaping is manual via `esc()`; keep every piece of
// user/DB-sourced text run through it before interpolation.

export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * @param {{ title: string, active: 'posts'|'import'|'review', isAdmin: boolean, lastUpdated: string|null, body: string }} params
 */
export function layout({ title, active, isAdmin, lastUpdated, body }) {
  const navLink = (href, key, label, extra = '') =>
    `<a href="${href}" aria-current="${active === key ? 'page' : 'false'}">${label}${extra}</a>`;

  const adminNav = isAdmin
    ? navLink('/import', 'import', 'Import') + navLink('/review', 'review', 'Review')
    : '';

  const lastUpdatedText = lastUpdated
    ? `Last updated ${esc(lastUpdated)}`
    : 'Last updated: never';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} — Postboard</title>
<link rel="stylesheet" href="/assets/styles.css" />
</head>
<body>
<nav class="nav" style="flex-wrap:wrap;gap:var(--space-2) var(--space-4);padding:var(--space-4) var(--space-6)">
<span class="nav-brand" style="display:flex;align-items:center;gap:10px"><span style="width:22px;height:22px;border-radius:50%;background:var(--color-accent);display:inline-block"></span>Postboard</span>
${navLink('/', 'posts', 'Posts')}
${adminNav}
<span style="margin-left:auto;font-size:13px;color:var(--color-neutral-700)" data-testid="last-updated">${lastUpdatedText}</span>
</nav>
<main style="padding:var(--space-4) var(--space-6) 80px;max-width:1180px">
${body}
</main>
</body>
</html>
`;
}
