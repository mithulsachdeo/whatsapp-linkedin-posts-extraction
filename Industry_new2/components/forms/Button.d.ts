import * as React from 'react';
/** Square-cornered uppercase button. */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** outline (default), ink (primary), red (destructive or single strong CTA), link. */
  variant?: 'outline' | 'ink' | 'red' | 'link';
  size?: 'md' | 'sm';
  block?: boolean;
  /** Renders an <a>. */
  href?: string;
  target?: string;
  rel?: string;
}
export declare function Button(props: ButtonProps): JSX.Element;
