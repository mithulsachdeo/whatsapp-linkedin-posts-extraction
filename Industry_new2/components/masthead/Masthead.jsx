import React from 'react';
export function Masthead({ title = 'The Postboard', motto, volume, date, note, animate = true, children }) {
  const strip = [volume, date, note].filter(Boolean);
  return (
    <header className="masthead">
      {strip.length > 0 && <div className="edition-strip">{strip.map((s, i) => <span key={i}>{s}</span>)}</div>}
      <div className={'masthead-block' + (animate ? ' anim-ink' : '')}>
        <h1 className="masthead-title">{title}</h1>
        {motto && <p className="masthead-motto">{motto}</p>}
      </div>
      {children}
    </header>
  );
}
