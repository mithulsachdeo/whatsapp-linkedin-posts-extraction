Logs and listings: import history, member roster. Numeric columns right-align in mono.
```jsx
<Table caption="Press log" columns={[{ key: 'when', label: 'Filed' }, { key: 'group', label: 'Group' }, { key: 'fresh', label: 'New', numeric: true }]} rows={imports} />
```
