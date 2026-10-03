// The review screen ("byline desk") in the Industry_new2 idiom. Two queues:
// UNKNOWN_SENDER (assign a byline) and OTHER_LINKEDIN (confirm/promote a
// non-post link). A lnkd.in short link is no longer a review-queue concern
// (ticket #11): it is a Post from the moment it's ingested, so it never
// appears here. Every action retroactively flows through the shared
// pipeline; each toast's Undo reverses exactly the action it is showing. All
// copy and form actions are preserved verbatim from the pre-reskin version --
// the route tests assert on them.
import { esc } from './layout.js';

/**
 * @param {{ items: Array<object>, members: Array<object>, otherLinkedInItems: Array<object> }} data
 * @param {{
 *   toast?: { rawSender: string, memberName: string, createdMemberId: number|null } | null,
 *   otherLinkedInToast?: { action: 'dismissed'|'promoted', id: number, url: string } | null,
 * }} [params]
 */
export function renderReviewPage(
  { items, members, otherLinkedInItems = [] },
  { toast, otherLinkedInToast } = {}
) {
  return `
    <div style="max-width:860px">
      <div class="kicker kicker-sepia">The byline desk</div>
      <h1 class="headline headline-xl" style="margin:var(--space-2) 0 var(--space-4)">Review queue</h1>

      <h2 class="headline headline-md" style="margin:0 0 var(--space-2)">Pending attribution</h2>
      <p class="standfirst" style="max-width:60ch">These senders appear in a chat export but don't match anyone on the member list. Their shares already count on the board and show the raw sender name until you match them.</p>
      ${toast ? renderToast(toast) : ''}
      ${items.length === 0 ? renderEmpty() : renderItems(items, members)}

      <h2 class="headline headline-md" style="margin:var(--space-8) 0 var(--space-2)">Non-post LinkedIn links</h2>
      <p class="standfirst" style="max-width:60ch">Profile, company, and job links the classifier flagged as not a post. They are never shown on the board. Dismiss to confirm, or promote if the classifier got it wrong.</p>
      ${otherLinkedInToast ? renderOtherLinkedInToast(otherLinkedInToast) : ''}
      ${otherLinkedInItems.length === 0 ? renderOtherLinkedInEmpty() : renderOtherLinkedInItems(otherLinkedInItems)}
    </div>
  `;
}

function noticeCard(inner, testid) {
  return `<div class="notice notice-sepia" data-testid="${testid}" style="flex-direction:column;align-items:stretch;gap:var(--space-3)">${inner}</div>`;
}

function queueWrap(cards) {
  return `<div style="display:flex;flex-direction:column;gap:var(--space-6);margin:var(--space-6) 4px 0">${cards}</div>`;
}

function renderItems(items, members) {
  const memberOptions = members
    .map((m) => `<option value="${m.id}">${esc(m.displayName)}</option>`)
    .join('');

  const cards = items
    .map((item) => {
      const shareLabel = item.shareCount === 1 ? '1 share' : `${item.shareCount} shares`;
      const inner = `
        <div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:var(--space-2);font:700 var(--text-xs)/1.3 var(--font-ui);letter-spacing:.14em;text-transform:uppercase">
          <span style="color:var(--color-accent-2-text)">Notice · Byline wanted</span>
          <span>${shareLabel}</span>
        </div>
        <div>
          <div class="headline headline-sm">${esc(item.rawSender)}</div>
          ${item.firstSeen ? `<div class="meta">First seen ${esc(formatDate(item.firstSeen))}</div>` : ''}
        </div>
        <form method="post" action="/review/${item.id}/match" style="display:flex;gap:var(--space-2);flex-wrap:wrap;align-items:center">
          <span class="field-label" style="color:var(--color-muted)">Assign byline</span>
          <select class="input" name="memberId" aria-label="Match ${esc(item.rawSender)} to an existing member" style="flex:1 1 200px;max-width:280px">
            <option value="">Choose a member…</option>
            ${memberOptions}
          </select>
          <span class="field-label" style="color:var(--color-muted)">or create new</span>
          <input class="input" type="text" name="newMemberName" placeholder="New member's display name" style="flex:1 1 200px;max-width:240px" />
          <button type="submit" class="btn btn-ink btn-sm">Print correction</button>
        </form>`;
      return noticeCard(inner, 'review-item');
    })
    .join('');

  return queueWrap(cards);
}

function renderEmpty() {
  return `
    <div data-testid="review-empty" class="empty">
      <div class="kicker">No corrections today</div>
      <h3 class="headline headline-md" style="margin:var(--space-2) 0">Everyone's accounted for</h3>
      <p class="standfirst" style="max-width:52ch">Every share on the board is attributed to a member. Unmatched senders from future imports will appear here.</p>
    </div>`;
}

function renderToast({ rawSender, memberName, createdMemberId }) {
  return `
    <div role="status" class="toast" data-testid="review-toast" style="margin-top:var(--space-4)">
      <span class="toast-text"><span class="toast-label">Correction</span>${esc(rawSender)} is now ${esc(memberName)}. Their shares show this name everywhere.</span>
      <form method="post" action="/review/undo" style="margin:0">
        <input type="hidden" name="rawSender" value="${esc(rawSender)}" />
        ${createdMemberId ? `<input type="hidden" name="createdMemberId" value="${esc(createdMemberId)}" />` : ''}
        <button type="submit" class="btn">Undo</button>
      </form>
    </div>`;
}

function renderOtherLinkedInItems(items) {
  const cards = items
    .map((item) => {
      const inner = `
        <div style="display:flex;gap:var(--space-3);align-items:center;flex-wrap:wrap">
          <span class="tag tag-sepia">Not a post</span>
          <div style="flex:1 1 260px;min-width:0">
            <div class="headline headline-sm" style="word-break:break-all">${esc(item.url)}</div>
            <div class="meta">Passed along by ${esc(item.rawSender)}</div>
          </div>
        </div>
        <div style="display:flex;gap:var(--space-2);flex-wrap:wrap">
          <form method="post" action="/review/other/${item.id}/dismiss" style="margin:0">
            <button type="submit" class="btn btn-sm">Dismiss</button>
          </form>
          <form method="post" action="/review/other/${item.id}/promote" style="margin:0">
            <button type="submit" class="btn btn-ink btn-sm">Promote to post</button>
          </form>
        </div>`;
      return noticeCard(inner, 'other-linkedin-item');
    })
    .join('');

  return queueWrap(cards);
}

function renderOtherLinkedInEmpty() {
  return `
    <div data-testid="other-linkedin-empty" class="empty">
      <div class="kicker">All clear</div>
      <h3 class="headline headline-md" style="margin:var(--space-2) 0">No non-post links to review</h3>
      <p class="standfirst" style="max-width:52ch">Profile, company, and job links from future imports will appear here.</p>
    </div>`;
}

function renderOtherLinkedInToast({ action, id, url }) {
  const message =
    action === 'promoted'
      ? `${esc(url)} is now on the board as a post.`
      : `${esc(url)} dismissed as not a post.`;
  return `
    <div role="status" class="toast" data-testid="other-linkedin-toast" style="margin-top:var(--space-4)">
      <span class="toast-text"><span class="toast-label">Correction</span>${message}</span>
      <form method="post" action="/review/other/${id}/undo" style="margin:0">
        <button type="submit" class="btn">Undo</button>
      </form>
    </div>`;
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}
