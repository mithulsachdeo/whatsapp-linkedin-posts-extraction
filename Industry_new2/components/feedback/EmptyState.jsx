import React from 'react';
export function EmptyState({ kicker, title, children, action }) {
  return (
    <div className="empty anim-rise">
      {kicker && <div className="kicker">{kicker}</div>}
      <h2 className="headline headline-lg">{title}</h2>
      {children && <p className="standfirst">{children}</p>}
      {action}
    </div>
  );
}
