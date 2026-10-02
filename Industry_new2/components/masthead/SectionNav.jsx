import React from 'react';
export function SectionNav({ items = [], onSelect, label = 'Sections' }) {
  return (
    <nav className="section-nav" aria-label={label}>
      {items.map((it, i) => (
        <a key={it.id ?? i} href={it.href || '#'} aria-current={it.current ? 'page' : undefined}
          onClick={e => { if (onSelect) { e.preventDefault(); onSelect(it.id ?? i); } }}>
          {it.label}{it.badge != null && it.badge !== 0 && <span className="section-badge">{it.badge}</span>}
        </a>
      ))}
    </nav>
  );
}
