import * as React from 'react';
/**
 * A full article page: kicker, headline, standfirst, ruled byline, halftone hero, body with an automatic drop cap, optional side column.
 */
export interface ArticleProps {
  kicker?: string;
  headline: string;
  standfirst?: string;
  byline?: string;
  /** Typewriter dateline, e.g. "MUMBAI, 30 SEP". */
  dateline?: string;
  image?: string;
  imageAlt?: string;
  media?: React.ReactNode;
  caption?: React.ReactNode;
  /** Side column (circulation record, related stories). */
  aside?: React.ReactNode;
  /** Body paragraphs; the first <p> gets the drop cap. */
  children?: React.ReactNode;
}
export declare function Article(props: ArticleProps): JSX.Element;
