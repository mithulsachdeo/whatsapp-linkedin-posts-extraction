// Import flow views in the Industry_new2 "wire room" idiom: the upload form
// and the "press run complete" stats readout. The stat markup keeps its
// value-then-label <div> structure and exact labels, which the route tests
// assert on.
import { esc } from './layout.js';
import { GROUPS } from '../ingest/groups.js';

export function renderImportPage({ result, error } = {}) {
  return `
    <div style="max-width:680px">
      <div class="kicker">The wire room</div>
      <h1 class="headline headline-xl" style="margin:var(--space-2) 0 var(--space-3)">Import a chat export</h1>
      <p class="standfirst" style="max-width:56ch">Upload a WhatsApp "Without Media" export (.txt, or the .zip WhatsApp produces) to pull in every LinkedIn post it contains. Stories already in the archive are counted again, never reprinted.</p>
      ${error ? renderError(error) : ''}
      ${result ? renderResult(result) : ''}
      ${renderForm()}
    </div>
  `;
}

function renderForm() {
  const options = GROUPS.map((g) => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');
  return `
    <form method="post" action="/import" enctype="multipart/form-data" style="display:flex;flex-direction:column;gap:var(--space-4);max-width:440px;margin-top:var(--space-6)">
      <label class="field">
        <span class="field-label">Filed from</span>
        <select class="input" name="groupId" required>${options}</select>
      </label>
      <label class="field">
        <span class="field-label">Chat export (.txt or .zip)</span>
        <input class="input input-boxed" type="file" name="file" accept=".txt,.zip" required />
      </label>
      <p class="field-hint">In WhatsApp, open the group, tap its name, then Export chat → Without media.</p>
      <button type="submit" class="btn btn-ink" style="align-self:flex-start">Send to press</button>
    </form>
  `;
}

function renderError(message) {
  return `
    <div class="notice notice-red" data-testid="import-error" style="margin:var(--space-4) 4px">
      <div class="notice-text"><div class="kicker">Hold the press</div><div class="notice-body">${esc(message)}</div></div>
    </div>`;
}

function renderResult(result) {
  const stat = (value, label, accent = false) => `
    <div style="padding:var(--space-3) var(--space-4) var(--space-3) 0;border-left:1px solid var(--color-neutral-400);padding-left:var(--space-4)">
      <div style="font-family:var(--font-display);font-size:var(--text-2xl)${accent ? ';color:var(--color-accent-text)' : ''}">${value}</div>
      <div style="font:var(--text-xs)/1.3 var(--font-ui);letter-spacing:.06em;text-transform:uppercase;color:var(--color-muted);margin-top:2px">${label}</div>
    </div>`;

  const pendingCallout =
    result.pendingAttributionSenders.length > 0
      ? `
      <div class="notice notice-sepia" style="margin:var(--space-4) 4px">
        <div class="notice-text">
          <div class="kicker kicker-sepia">Byline notice</div>
          <div class="notice-body">${result.pendingAttributionSenders.length} sender${result.pendingAttributionSenders.length === 1 ? '' : 's'} couldn't be matched to a member. Their shares are counted and show the raw WhatsApp name until matched.</div>
        </div>
        <a class="btn" href="/review">Open the byline desk</a>
      </div>`
      : '';

  const duplicateWarning = result.duplicateFileWarning
    ? `<div class="notice notice-sepia" data-testid="duplicate-warning" style="margin:var(--space-4) 4px"><div class="notice-text"><div class="notice-body">This file's contents are byte-identical to a previously imported export. It was safely re-processed with no duplicate records created.</div></div></div>`
    : '';

  return `
    ${duplicateWarning}
    <div data-testid="import-result" style="border-top:var(--rule-heavy) double var(--color-text);padding-top:var(--space-4);margin:var(--space-6) 0">
      <div class="kicker kicker-sepia">✓ Press run complete</div>
      <h2 class="headline headline-lg" style="margin:4px 0 var(--space-4)">Import finished</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));border-top:1px solid var(--color-text);border-bottom:1px solid var(--color-text)">
        ${stat(result.messagesRead, 'messages read')}
        ${stat(result.linksFound, 'LinkedIn links found')}
        ${stat(result.newPosts, 'new posts', true)}
        ${stat(result.alreadyOnBoard, 'already on the board')}
      </div>
      ${pendingCallout}
      <div style="display:flex;gap:var(--space-2);flex-wrap:wrap;margin-top:var(--space-4)">
        <a class="btn btn-ink" href="/">Read the new edition</a>
      </div>
    </div>
  `;
}
