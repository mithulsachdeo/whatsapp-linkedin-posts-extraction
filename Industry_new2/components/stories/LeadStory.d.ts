import * as React from 'react';
/**
 * The front page's top story: big headline, italic standfirst, byline, halftone photo and share stamp.
 */
export interface LeadStoryProps {
  kicker?: string;
  /** Adds a sepia "Byline pending" kicker. */
  pending?: boolean;
  pendingLabel?: string;
  headline: string;
  standfirst?: string;
  byline?: string;
  meta?: React.ReactNode;
  image?: string;
  imageAlt?: string;
  /** Alternative to image, e.g. an <image-slot>. */
  media?: React.ReactNode;
  caption?: React.ReactNode;
  /** Share count; stamp shows when > 1. */
  count?: number;
  href?: string;
  onOpen?: (e: React.SyntheticEvent) => void;
}
export declare function LeadStory(props: LeadStoryProps): JSX.Element;
