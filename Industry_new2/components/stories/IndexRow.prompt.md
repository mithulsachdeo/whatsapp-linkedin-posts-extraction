The compact list view for scanning hundreds of items. Counts above 1 print in red, single counts in grey.
```jsx
<div className="index">{rows.map((r, i) => <IndexRow key={r.id} no={String(i + 1).padStart(2, '0')} headline={r.headline} byline={r.byline} meta={r.meta} count={r.count} onOpen={() => open(r.id)} />)}</div>
```
