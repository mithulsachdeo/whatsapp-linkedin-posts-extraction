The page nameplate: edition strip, blackletter title, motto. Use once at the top of every front page; inner pages may use a smaller title.
```jsx
<Masthead title="The Postboard" volume="Vol. II · No. 40" date="Thursday, 1 October 2026" note="Free to members" motto="Every post the groups shared, printed once.">
  <SectionNav items={[{ label: 'Front page', current: true }, { label: 'Wire room' }]} />
</Masthead>
```
- `animate={false}` for static contexts (print, email screenshots).
