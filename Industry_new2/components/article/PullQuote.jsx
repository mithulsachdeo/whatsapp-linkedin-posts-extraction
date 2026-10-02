import React from 'react';
export function PullQuote({ children, cite }) {
  return (
    <blockquote className="pullquote">
      <p>{children}</p>
      {cite && <cite>{cite}</cite>}
    </blockquote>
  );
}
