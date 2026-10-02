For long choice lists (members, groups). Use OptionRule for 2–4 options.
```jsx
<Select label="Assign byline" value={pick} onChange={e => setPick(e.target.value)} options={[{ value: '', label: 'Choose a member…' }, ...members]} />
```
