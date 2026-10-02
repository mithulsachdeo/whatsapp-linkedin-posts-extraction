// Import flow views: the upload form and the "done" stats readout, adapted
// from Industry/components/postboard-import-status.html's "Finished" card.
import { esc } from './layout.js';
import { GROUPS } from '../ingest/groups.js';

export function renderImportPage({ result, error } = {}) {
  return `
    <h1 style="font-size:36px;margin-bottom:var(--space-2)">Import a chat export</h1>
    <p style="color:var(--color-neutral-700);max-width:54ch;margin-bottom:var(--space-4)">Upload a WhatsApp "Without Media" export (.txt, or the .zip WhatsApp produces) to pull in every LinkedIn post it contains.</p>
    ${error ? renderError(error) : ''}
    ${result ? renderResult(result) : ''}
    ${renderForm()}
  `;
}

function renderForm() {
  const options = GROUPS.map((g) => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');
  return `
    <form method="post" action="/import" enctype="multipart/form-data" style="display:flex;flex-direction:column;gap:var(--space-3);max-width:420px;margin-top:var(--space-4)">
      <label style="display:flex;flex-direction:column;gap:4px;font-size:13px">
        Group
        <select name="groupId" required style="padding:8px;border-radius:var(--radius-md);border:1px solid var(--color-neutral-300)">${options}</select>
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:13px">
        Chat export (.txt or .zip)
        <input type="file" name="file" accept=".txt,.zip" required />
      </label>
      <button type="submit" class="btn btn-primary" style="padding:10px 20px;align-self:flex-start">Import</button>
    </form>
  `;
}

function renderError(message) {
  return `
    <div data-testid="import-error" style="background:var(--color-accent-2-100);color:var(--color-accent-2-900);border-radius:var(--radius-lg);padding:var(--space-3) var(--space-4);margin-bottom:var(--space-4)">
      ${esc(message)}
    </div>`;
}

function renderResult(result) {
  const stat = (value, label, accent = false) => `
    <div style="background:var(--color-bg);border-radius:var(--radius-md);padding:var(--space-3) var(--space-4)">
      <div style="font-family:var(--font-heading);font-size:26px${accent ? ';color:var(--color-accent-700)' : ''}">${value}</div>
      <div style="color:var(--color-neutral-700);font-size:13px">${label}</div>
    </div>`;

  const pendingCallout =
    result.pendingAttributionSenders.length > 0
      ? `
      <div style="display:flex;gap:var(--space-3);align-items:center;background:var(--color-accent-2-100);color:var(--color-accent-2-900);border-radius:var(--radius-lg);padding:var(--space-3) var(--space-4);margin-top:var(--space-3)">
        <span style="flex:1;font-size:14px">${result.pendingAttributionSenders.length} sender${result.pendingAttributionSenders.length === 1 ? '' : 's'} couldn't be matched to a member. Their shares are counted and show the raw WhatsApp name until matched.</span>
        <a class="btn btn-secondary" href="/review" style="background:var(--color-bg)">Review senders</a>
      </div>`
      : '';

  const duplicateWarning = result.duplicateFileWarning
    ? `<div data-testid="duplicate-warning" style="background:var(--color-accent-2-100);color:var(--color-accent-2-900);border-radius:var(--radius-lg);padding:var(--space-3) var(--space-4);margin-bottom:var(--space-3)">This file's contents are byte-identical to a previously imported export. It was safely re-processed with no duplicate records created.</div>`
    : '';

  return `
    ${duplicateWarning}
    <div class="card" data-testid="import-result" style="padding:var(--space-6);gap:var(--space-4);margin-bottom:var(--space-4)">
      <div style="display:flex;gap:var(--space-3);align-items:center">
        <span style="width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:var(--color-accent-2-200);color:var(--color-accent-2-800)">&#10003;</span>
        <div><h3 style="margin:0">Import finished</h3></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-3)">
        ${stat(result.messagesRead, 'messages read')}
        ${stat(result.linksFound, 'LinkedIn links found')}
        ${stat(result.newPosts, 'new posts', true)}
        ${stat(result.alreadyOnBoard, 'already on the board')}
      </div>
      ${pendingCallout}
    </div>
  `;
}
