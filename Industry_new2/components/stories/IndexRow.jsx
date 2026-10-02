import React from 'react';
export function IndexRow({ no, headline, byline, meta, pending, pendingLabel = 'Byline pending', count = 1, href, onOpen }) {
  const openProps = onOpen && !href ? { role: 'button', tabIndex: 0, onClick: onOpen, onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(e); } } } : {};
  const Tag = href ? 'a' : 'div';
  return (
    <Tag className="index-row" href={href} {...openProps}>
      <span className="index-no">No. {no}</span>
      <div style={{ minWidth: 0 }}>
        <div className="headline headline-sm">{headline}</div>
        {byline && <div className="byline" style={{ fontSize: 14.5, marginTop: 2 }}>{byline}</div>}
        {(meta || pending) && <div className="meta" style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', marginTop: 2 }}>{meta}{pending && <span className="tag tag-dashed">{pendingLabel}</span>}</div>}
      </div>
      <span className={'index-count' + (count > 1 ? '' : ' is-single')}>{count}×</span>
    </Tag>
  );
}
