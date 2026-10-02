// The two WhatsApp groups this admin curates (per spec: one is a ~70%
// overlapping subset of the other). Group is selected by the admin at
// upload time and stored on every sharing event, but never surfaced in the
// v1 UI (group-hidden decision) -- this list only backs the upload form's
// picker. Promoting this to an admin-managed table is a reasonable future
// step but is out of this ticket's scope for two fixed, known groups.
export const GROUPS = [
  { id: 'product-chai', name: 'Product Chai' },
  { id: 'pm-collective', name: 'PM Collective' },
];

export function groupName(groupId) {
  return GROUPS.find((g) => g.id === groupId)?.name ?? groupId;
}
