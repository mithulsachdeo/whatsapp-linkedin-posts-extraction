import * as React from 'react';
/** A story set in a newspaper column: optional photo, kicker, headline, justified body, byline. Place inside a .columns container. */
export interface ColumnStoryProps {
  kicker?: string;
  pending?: boolean;
  pendingLabel?: string;
  headline: string;
  body?: string;
  byline?: string;
  meta?: React.ReactNode;
  date?: string;
  image?: string;
  imageAlt?: string;
  media?: React.ReactNode;
  count?: number;
  /** Body line clamp. Default 5. */
  lines?: number;
  href?: string;
  onOpen?: (e: React.SyntheticEvent) => void;
}
export declare function ColumnStory(props: ColumnStoryProps): JSX.Element;
