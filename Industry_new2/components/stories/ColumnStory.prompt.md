The front page's repeating unit. Wrap a list in `<div className="columns">` so stories flow into ruled columns.
```jsx
<div className="columns">{posts.map(p => <ColumnStory key={p.id} kicker={p.group} headline={p.headline} body={p.text} byline={'By ' + p.author} meta={p.sharedBy} date={p.date} count={p.count} onOpen={() => open(p.id)} />)}</div>
```
