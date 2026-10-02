// Admin login (ticket #10): a single shared password, no accounts. Styled
// to match the other narrow single-purpose forms (src/views/import.js).
import { esc } from './layout.js';

export function renderLoginPage({ error, next } = {}) {
  const nextField = next ? `<input type="hidden" name="next" value="${esc(next)}" />` : '';
  return `
    <h1 style="font-size:36px;margin-bottom:var(--space-2)">Admin login</h1>
    <p style="color:var(--color-neutral-700);max-width:54ch;margin-bottom:var(--space-4)">Enter the shared admin password to import exports and work the review queue. The dashboard itself never requires this.</p>
    ${error ? renderError(error) : ''}
    <form method="post" action="/login" style="display:flex;flex-direction:column;gap:var(--space-3);max-width:320px">
      ${nextField}
      <label style="display:flex;flex-direction:column;gap:4px;font-size:13px">
        Password
        <input type="password" name="password" required autofocus style="padding:8px;border-radius:var(--radius-md);border:1px solid var(--color-neutral-300)" />
      </label>
      <button type="submit" class="btn btn-primary" style="padding:10px 20px;align-self:flex-start">Log in</button>
    </form>
  `;
}

function renderError(message) {
  return `
    <div data-testid="login-error" style="background:var(--color-accent-2-100);color:var(--color-accent-2-900);border-radius:var(--radius-lg);padding:var(--space-3) var(--space-4);margin-bottom:var(--space-4)">
      ${esc(message)}
    </div>`;
}
