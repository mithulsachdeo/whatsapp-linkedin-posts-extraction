import React from 'react';
export function WireTicker({ label = 'The wire', items = [], seconds = 60 }) {
  if (!items.length) return null;
  const all = items.concat(items);
  return (
    <div className="wire" aria-label={label}>
      <span className="wire-label"><span className="wire-dot" />{label}</span>
      <div className="wire-window">
        <div className="wire-track" style={{ animationDuration: seconds + 's' }}>
          {all.map((it, i) => <span key={i} aria-hidden={i >= items.length ? 'true' : undefined}>{it}</span>)}
        </div>
      </div>
    </div>
  );
}
