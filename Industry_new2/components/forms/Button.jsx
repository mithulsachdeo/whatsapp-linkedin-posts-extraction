import React from 'react';
export function Button({ variant = 'outline', size = 'md', block = false, className = '', href, children, ...rest }) {
  const cls = ['btn', variant !== 'outline' && 'btn-' + variant, size === 'sm' && 'btn-sm', block && 'btn-block', className].filter(Boolean).join(' ');
  if (href) return <a className={cls} href={href} {...rest}>{children}</a>;
  return <button className={cls} type={rest.type || 'button'} {...rest}>{children}</button>;
}
