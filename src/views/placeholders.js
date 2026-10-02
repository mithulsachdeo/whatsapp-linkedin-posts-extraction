// Import/Review placeholders for the walking skeleton. Real behaviour
// (upload flow, review queue actions) lands with the ingestion and
// review-queue tickets.

export function renderImportPlaceholder() {
  return `
    <h1 style="font-size:36px;margin-bottom:var(--space-2)">Import a chat export</h1>
    <p style="color:var(--color-neutral-700);max-width:54ch">Coming soon: upload a WhatsApp "Without Media" export here.</p>
  `;
}

export function renderReviewPlaceholder() {
  return `
    <h1 style="font-size:36px;margin-bottom:var(--space-2)">Review queue</h1>
    <p style="color:var(--color-neutral-700);max-width:54ch">Coming soon: unknown senders, non-post links, and unresolved short links will be resolved here.</p>
  `;
}
