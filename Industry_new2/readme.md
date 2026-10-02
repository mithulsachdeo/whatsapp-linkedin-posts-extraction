# Magazine Old Newspaper design system

A newsprint system for calm, scannable products: a blackletter nameplate, Caslon display headlines over Newsreader text, Franklin Gothic-style caps for interface chrome, typewriter type for the wire and data. Paper and ink, one press-red spot colour, sepia as a second voice. Square corners, ruled columns, halftone photographs, and a press-room motion set. A night edition inverts every ramp.

It was built for **The Postboard**, a dashboard that collects every LinkedIn post shared in two WhatsApp groups of product managers, prints each post once, and credits who shared it, when and how often. No engagement metrics.

Sources: the Postboard "Gazette" exploration made in this project. No codebase, Figma or brand assets were provided. There is no logo; the nameplate is the name set in `--font-masthead`.

## Using it

Link `styles.css` (it `@import`s everything under `tokens/`). Components live on `window.Industry_indust` after loading `_ds_bundle.js` (the namespace keeps the project's original id). Put `class="paper"` on the page root for the grain. Set `data-edition="night"` on any ancestor for the night edition; components need no changes.

## Content fundamentals

- Write like a newsroom. Product actions get newsroom words: import → "File a chat export", start → "Send to press", processing → "Setting type", history → "Press log", unknown sender → "Byline pending", assign member → "Print correction", shared by → "Passed along by", no results → "No stories filed".
- Plain, factual and specific. Headlines in sentence case, no full stop. Standfirsts are one italic sentence. Numbers are exact: "6,214 messages read", never "thousands".
- Second person for instructions ("Export the chat without media"), third person in reporting ("Priya Sharma passed along…"). No first-person brand voice, no exclamation marks, no emoji.
- Uppercase is reserved for kickers, labels and buttons, always letter-spaced.
- Pending states are said calmly: what's waiting, that nothing is lost ("Their shares are counted; only the byline is waiting").

## Visual foundations

- **Colour.** Ground `--color-bg` (#f3ecdc newsprint), text `--color-text` (#1b1a17 ink). Press red `--color-accent-*` for kickers, drop caps, stamps, active underlines and share counts; use 700 (`--color-accent-text`) for text on paper. Sepia `--color-accent-2-*` for pending, notices and the second voice. Each role has a 100–900 ramp; tints from 100–300, text from 700–900. Never introduce blues or greens.
- **Night edition.** `[data-edition="night"]` reverses every ramp (100 becomes darkest), so `neutral-700` muted text and `accent-700` red text stay readable on dark paper.
- **Type.** `--font-masthead` UnifrakturMaguntia, nameplate only, once per page. `--font-display` Libre Caslon Display, regular weight, all headlines. `--font-body` Newsreader for reading, italics for standfirsts and captions, small caps for bylines. `--font-ui` Libre Franklin for labels, buttons and nav (uppercase, tracked .12–.14em). `--font-mono` Courier Prime for the wire, datelines and numeric columns.
- **Layout.** Pages are centred editions (max ~1200px) with the masthead on top. Content flows into CSS columns (`.columns`, min 240px) with hairline column rules. One lead story per front page. Reading width `--measure` 64ch.
- **Rules, not boxes.** Structure comes from lines: hairline (`.rule`), strong edition-strip rules, 4px double rules for section breaks and under the lead, dotted rules between list rows, a heavy 4px rule over column heads. Cards don't exist; stories are separated by rules.
- **Corners and elevation.** Radius 0 everywhere. Circles appear only as stamps. No soft shadows: overlays (dialog, toast) take a hard offset `--shadow-md` / `--shadow-lg` in ink.
- **Backgrounds.** `.paper` adds a two-layer dot grain (`--texture-paper`). No gradients, no full-bleed colour except the ink wire strip and night-edition slides.
- **Imagery.** Every photo goes through `.halftone` / `HalftonePhoto`: greyscale, 40% sepia, contrast 1.15 and a 4px dot screen (`--texture-halftone`). Captions are italic under a hairline. Photos are warm, documentary and people-led; no stock gloss.
- **Notices.** Double-ruled boxes (border plus offset outline), ink, red or sepia.
- **Hover and press.** Links and headlines go deep red (`accent-800`) on hover; rows tint `accent-100`; outline buttons fill `neutral-300`; ink buttons turn deep red. Press nudges 1px down-right. Focus: 2px accent outline, 2px offset. Disabled: 45% opacity.
- **Motion.** `ink-in` (1.1s blur-to-sharp, nameplates), `press-reveal` (900ms top-to-bottom clip, columns and lead), `stamp-in` (550ms overshoot, the share stamp), `wire-scroll` (60s linear ticker, pauses on hover), `type-on` + `caret` (progress steps), `rise` (500ms, page entries and overlays). Easing `--ease-out` cubic-bezier(.2,.7,.2,1); `--ease-thump` for the stamp. Everything respects `prefers-reduced-motion`.
- **Transparency and blur.** Only the dialog backdrop (`--color-overlay`) and the stamp's 82% paper fill.

## Iconography

Typographic glyphs come first, set in the body face: ▸ (active / bullet), ✓ (done), ↗ (external link), ← (back), × (close), ❧ (end of article), § ¶ † (references), ☞ (pointer). Use Unicode characters, never emoji. When a true pictogram is unavoidable (upload, search), use Lucide from CDN at stroke-width 1.5 in `currentColor`. That is a substitution: no icon set was provided.

## Fonts

All five families load from Google Fonts in `tokens/fonts.css`. No binaries were supplied. If you license different faces (e.g. a true Franklin Gothic or Caslon), drop the files in `assets/fonts/` and replace the import with `@font-face` rules.

## Components

Each has `.jsx`, `.d.ts` and `.prompt.md` beside it.

- `components/masthead/`: **Masthead**, **SectionNav**, **WireTicker**
- `components/stories/`: **LeadStory**, **ColumnStory**, **IndexRow**, **ShareStamp**, **HalftonePhoto**, **Tag**
- `components/article/`: **Article** (drop cap on the first paragraph), **PullQuote**
- `components/feedback/`: **Notice**, **Toast**, **Dialog**, **EmptyState**, **PressProgress**
- `components/forms/`: **Button**, **TextField**, **Select**, **OptionRule**
- `components/data/`: **Table**

CSS-only classes: `.kicker`, `.headline-*`, `.standfirst`, `.byline`, `.dateline`, `.meta`, `.label`, `.rule*`, `.columns`, `.index`, `.stamp`, `.halftone`, `.caption`, `.dropcap`, `.check`, `.paper`, `.anim-*`.

Intentional additions: **Tag** (status labels such as "Byline pending" were needed across stories) and **PullQuote** (part of the article page).

## Templates

- `templates/postboard/`: the Postboard dashboard. Front page (lead + columns or index), member files, article pages with circulation record, wire-room import, byline desk, empty states. Tweaks: role, data state, edition, frame.
- `templates/landing/`: product landing page set as a front page.
- `templates/article/`: long-read article.
- `templates/deck/`: 7-slide 1920×1080 deck.
- `templates/email/`: 600px weekly digest email (inline styles, literal colours).

## Files

- `styles.css`: imports only.
- `tokens/`: `fonts.css`, `colors.css` (day + night), `type.css`, `spacing.css`, `motion.css`, `base.css`, `components.css`.
- `guidelines/`: foundation cards (colour, type, rules, spacing, texture, imagery, motion, iconography, voice).
- `assets/photo.jpg`: reference photograph for imagery cards.
- `theme.json`, `thumbnail.html`, `SKILL.md`.
