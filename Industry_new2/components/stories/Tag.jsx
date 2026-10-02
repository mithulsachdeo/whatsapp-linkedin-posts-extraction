import React from 'react';
export function Tag({ tone = 'ink', children }) {
  return <span className={'tag' + (tone !== 'ink' ? ' tag-' + tone : '')}>{children}</span>;
}
