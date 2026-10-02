Section links under the masthead; the current section gets a red underline. Badges carry small counts (e.g. pending items).
```jsx
<SectionNav onSelect={setTab} items={[{ id: 'front', label: 'Front page', current: tab === 'front' }, { id: 'desk', label: 'Byline desk', badge: 3 }]} />
```
