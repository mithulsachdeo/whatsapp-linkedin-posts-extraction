import React from 'react';
export function Toast({ label = 'Correction', children, actionLabel, onAction }) {
  return (
    <div className="toast" role="status">
      <span className="toast-text">{label && <b className="toast-label">{label}</b>}{children}</span>
      {actionLabel && <button className="btn" onClick={onAction}>{actionLabel}</button>}
    </div>
  );
}
