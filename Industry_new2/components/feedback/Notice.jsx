import React from 'react';
export function Notice({ tone = 'ink', label, children, action }) {
  return (
    <div className={'notice' + (tone !== 'ink' ? ' notice-' + tone : '')} role="note">
      <div className="notice-text">
        {label && <div className="kicker kicker-ink">{label}</div>}
        <div className="notice-body">{children}</div>
      </div>
      {action}
    </div>
  );
}
