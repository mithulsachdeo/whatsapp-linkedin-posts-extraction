import * as React from 'react';
/** Small uppercase boxed label. */
export interface TagProps {
  /** ink (default), red, sepia, dashed (pending/unknown), solid (inverted). */
  tone?: 'ink' | 'red' | 'sepia' | 'dashed' | 'solid';
  children: React.ReactNode;
}
export declare function Tag(props: TagProps): JSX.Element;
