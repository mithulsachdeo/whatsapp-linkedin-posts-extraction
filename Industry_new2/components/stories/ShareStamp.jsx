import React from 'react';
export function ShareStamp({ count, label = 'Shared', suffix = 'times', animate = true, delay }) {
  return (
    <div className={'stamp' + (animate ? ' anim-stamp' : '')} style={delay != null ? { '--delay': delay } : undefined} role="img" aria-label={label + ' ' + count + ' ' + suffix}>
      <span className="stamp-label">{label}</span>
      <span className="stamp-count">{count}×</span>
      <span className="stamp-label">{suffix}</span>
    </div>
  );
}
