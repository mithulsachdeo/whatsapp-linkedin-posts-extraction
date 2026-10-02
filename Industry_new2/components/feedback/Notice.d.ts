import * as React from 'react';
/** Double-ruled box for announcements, corrections and warnings. */
export interface NoticeProps {
  /** ink (info), red (problem), sepia (pending / needs attention). */
  tone?: 'ink' | 'red' | 'sepia';
  /** Small uppercase heading, e.g. "Byline notice". */
  label?: string;
  children: React.ReactNode;
  /** Right-aligned action, usually a <Button>. */
  action?: React.ReactNode;
}
export declare function Notice(props: NoticeProps): JSX.Element;
