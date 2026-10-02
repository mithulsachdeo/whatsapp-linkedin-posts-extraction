import * as React from 'react';
/** Dense numbered archive row with a share count. Wrap rows in <div className="index">. */
export interface IndexRowProps {
  no: string | number;
  headline: string;
  byline?: string;
  meta?: React.ReactNode;
  pending?: boolean;
  pendingLabel?: string;
  count?: number;
  href?: string;
  onOpen?: (e: React.SyntheticEvent) => void;
}
export declare function IndexRow(props: IndexRowProps): JSX.Element;
