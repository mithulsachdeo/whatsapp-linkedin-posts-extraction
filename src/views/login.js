// Admin login (ticket #10): a single shared password, no accounts. Styled in
// the Industry_new2 form idiom to match the other narrow single-purpose forms.
import { esc } from './layout.js';

export function renderLoginPage({ error, next } = {}) {
  const nextField = next ? `<input type="hidden" name="next" value="${esc(next)}" />` : '';
  return `
    <div style="max-width:420px">
      <div class="kicker">The newsroom door</div>
      <h1 class="headline headline-xl" style="margin:var(--space-2) 0 var(--space-3)">Admin login</h1>
      <p class="standfirst" style="max-width:54ch">Enter the shared admin password to import exports and work the byline desk. The front page itself never requires this.</p>
      ${error ? renderError(error) : ''}
      <form method="post" action="/login" style="display:flex;flex-direction:column;gap:var(--space-4);margin-top:var(--space-4)">
        ${nextField}
        <label class="field">
          <span class="field-label">Password</span>
          <input class="input input-boxed" type="password" name="password" required autofocus />
        </label>
        <button type="submit" class="btn btn-ink" style="align-self:flex-start">Log in</button>
      </form>
    </div>
  `;
}

function renderError(message) {
  return `
    <div class="notice notice-red" data-testid="login-error" style="margin:var(--space-4) 4px">
      <div class="notice-text"><div class="notice-body">${esc(message)}</div></div>
    </div>`;
}
