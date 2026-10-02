// Review placeholder for the walking skeleton. Real behaviour (review queue
// actions) lands with the review-queue ticket. The import placeholder was
// replaced by src/views/import.js once ingestion shipped.

export function renderReviewPlaceholder() {
  return `
    <h1 style="font-size:36px;margin-bottom:var(--space-2)">Review queue</h1>
    <p style="color:var(--color-neutral-700);max-width:54ch">Coming soon: unknown senders, non-post links, and unresolved short links will be resolved here.</p>
  `;
}
