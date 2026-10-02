import React from 'react';
export function Dialog({ open = true, kicker, title, children, actions, onClose }) {
  React.useEffect(() => {
    if (!open || !onClose) return;
    const k = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="dialog-backdrop" onClick={e => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        {kicker && <div className="kicker">{kicker}</div>}
        <h2 className="dialog-title">{title}</h2>
        <div className="dialog-body">{children}</div>
        {actions && <div className="dialog-actions">{actions}</div>}
      </div>
    </div>
  );
}
