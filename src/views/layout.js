// Server-rendered HTML via template literals -- no templating-engine
// dependency. Escaping is manual via `esc()`; keep every piece of
// user/DB-sourced text run through it before interpolation.
//
// The shell is the "Magazine Old Newspaper" edition frame from Industry_new2:
// the dateline/edition strip, the blackletter nameplate, the section nav and a
// closing colophon. Group names are never printed anywhere in the chrome, per
// the group-hidden decision (D1).

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
    `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}${extra}</a>`;

  const adminNav = isAdmin
    ? navLink('/import', 'import', 'Import') +
      navLink('/review', 'review', 'Review') +
      `<form method="post" action="/logout" style="display:inline;margin:0"><button type="submit">Logout</button></form>`
    : `<a href="/login">Admin</a>`;

  const lastUpdatedText = lastUpdated
    ? `Last updated ${esc(lastUpdated)}`
    : 'Last updated: never';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} — The Rethinkers' Postcard</title>
<link rel="stylesheet" href="/assets/styles.css" />
</head>
<body class="paper">
<header style="padding:var(--space-4) var(--space-6) 0;max-width:1200px;margin:0 auto">
  <div class="edition-strip">
    <span>Shared once · Credited always</span>
    <span data-testid="last-updated">${lastUpdatedText}</span>
    <span>No engagement figures kept</span>
  </div>
  <div class="masthead-block anim-ink">
    <!-- Localized override: "The Rethinkers' Postcard" (24 chars) is longer than the
         design system's "The Postboard" default, which wraps at the shared
         clamp(44px,10vw,112px) size. This clamp(32px,6vw,76px) keeps it on one line
         at desktop widths (>=1200px, ~1100px usable column) without touching the
         shared .masthead-title token in Industry_new2/tokens/components.css. -->
    <h1 class="masthead-title" style="font-size:clamp(32px,6vw,76px)">The Rethinkers' Postcard</h1>
    <p class="masthead-motto">Every LinkedIn post shared in the groups, printed once and credited to whoever passed it along</p>
  </div>
  <nav class="section-nav">
    ${navLink('/', 'posts', 'Posts')}
    ${adminNav}
  </nav>
</header>
<main style="padding:var(--space-6) var(--space-6) 96px;max-width:1200px;margin:0 auto">
${body}
</main>
<footer style="padding:var(--space-3) var(--space-6) var(--space-8);max-width:1200px;margin:0 auto">
  <div style="border-top:var(--rule-heavy) double var(--color-text);padding-top:var(--space-2);display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px var(--space-4);font:600 var(--text-xs)/1.4 var(--font-ui);letter-spacing:.12em;text-transform:uppercase;color:var(--color-muted)">
    <span>Printed from members' own chat exports</span>
    <span>No engagement figures are kept</span>
  </div>
</footer>
</body>
</html>
`;
}
