// Review screen for UNKNOWN_SENDER items, adapted from the "Pending
// attribution" screen in Industry/templates/postboard/Postboard.dc.html.
// Map-to-existing-member or create-new-member both retroactively re-attribute
// every past (and future) sharing event from that raw sender; the toast's
// Undo reverses whichever one just happened.
import { esc } from './layout.js';

/**
 * @param {{ items: Array<object>, members: Array<object> }} data
 * @param {{ toast?: { rawSender: string, memberName: string, createdMemberId: number|null } | null }} [params]
 */
export function renderReviewPage({ items, members }, { toast } = {}) {
  return `
    <h1 style="font-size:36px;margin-bottom:var(--space-2)">Review queue</h1>
    <h2 style="font-size:20px;font-weight:600;color:var(--color-neutral-700);margin:0 0 var(--space-2)">Pending attribution</h2>
    <p style="color:var(--color-neutral-700);max-width:58ch">These senders appear in a chat export but don't match anyone on the member list. Their shares already count on the board and show the raw sender name until you match them.</p>
    ${toast ? renderToast(toast) : ''}
    ${items.length === 0 ? renderEmpty() : renderItems(items, members)}
  `;
}

function renderItems(items, members) {
  const memberOptions = members
    .map((m) => `<option value="${m.id}">${esc(m.displayName)}</option>`)
    .join('');

  const cards = items
    .map((item) => {
      const shareLabel = item.shareCount === 1 ? '1 share' : `${item.shareCount} shares`;
      return `
      <div class="card" data-testid="review-item" style="padding:var(--space-4) var(--space-6);gap:var(--space-3)">
        <div style="display:flex;gap:var(--space-3);align-items:center;flex-wrap:wrap">
          <span style="width:44px;height:44px;flex:none;border-radius:50%;display:grid;place-items:center;border:1.5px dashed var(--color-neutral-600);color:var(--color-neutral-700);font-size:15px;font-weight:700">?</span>
          <div style="flex:1 1 200px;min-width:0">
            <div style="font-weight:700;font-size:16px">${esc(item.rawSender)}</div>
            ${item.firstSeen ? `<div style="font-size:13px;color:var(--color-neutral-700)">First seen ${esc(formatDate(item.firstSeen))}</div>` : ''}
          </div>
          <span class="tag tag-accent-2">${shareLabel}</span>
        </div>
        <form method="post" action="/review/${item.id}/match" style="display:flex;gap:var(--space-2);flex-wrap:wrap;align-items:center">
          <span style="font-size:13px;color:var(--color-neutral-700)">Match to</span>
          <select class="input" name="memberId" aria-label="Match ${esc(item.rawSender)} to an existing member" style="width:auto;flex:1 1 200px;max-width:280px">
            <option value="">Choose a member…</option>
            ${memberOptions}
          </select>
          <span style="font-size:13px;color:var(--color-neutral-700)">or create new</span>
          <input class="input" type="text" name="newMemberName" placeholder="New member's display name" style="width:auto;flex:1 1 200px;max-width:240px" />
          <button type="submit" class="btn btn-primary">Match</button>
        </form>
      </div>`;
    })
    .join('');

  return `<div style="display:flex;flex-direction:column;gap:var(--space-4);margin-top:var(--space-6)">${cards}</div>`;
}

function renderEmpty() {
  return `
    <div data-testid="review-empty" style="display:flex;flex-direction:column;align-items:flex-start;gap:var(--space-2);padding:var(--space-8) 0">
      <span style="width:64px;height:64px;border-radius:50%;display:grid;place-items:center;background:var(--color-accent-2-200);color:var(--color-accent-2-800);margin-bottom:var(--space-2)">&#10003;</span>
      <h3 style="margin:0">Everyone's accounted for</h3>
      <p style="margin:0;color:var(--color-neutral-700);max-width:50ch">Every share on the board is attributed to a member. Unmatched senders from future imports will appear here.</p>
    </div>`;
}

function renderToast({ rawSender, memberName, createdMemberId }) {
  return `
    <div role="status" data-testid="review-toast" style="display:flex;gap:var(--space-3);align-items:center;background:var(--color-neutral-900);color:var(--color-neutral-100);border-radius:var(--radius-lg);padding:var(--space-3) var(--space-3) var(--space-3) var(--space-4);margin-top:var(--space-4);font-size:14px">
      <span style="flex:1">${esc(rawSender)} is now ${esc(memberName)}. Their shares show this name everywhere.</span>
      <form method="post" action="/review/undo" style="margin:0">
        <input type="hidden" name="rawSender" value="${esc(rawSender)}" />
        ${createdMemberId ? `<input type="hidden" name="createdMemberId" value="${esc(createdMemberId)}" />` : ''}
        <button type="submit" class="btn" style="color:var(--color-accent-300)">Undo</button>
      </form>
    </div>`;
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}
