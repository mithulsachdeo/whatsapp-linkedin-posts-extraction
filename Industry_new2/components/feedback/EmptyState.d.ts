import * as React from 'react';
/** Editorial empty / no-results state: kicker, headline, italic explanation, one action. */
export interface EmptyStateProps {
  kicker?: string;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}
export declare function EmptyState(props: EmptyStateProps): JSX.Element;
