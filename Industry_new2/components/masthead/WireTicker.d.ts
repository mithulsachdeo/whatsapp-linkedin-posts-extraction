import * as React from 'react';
/** Scrolling news ticker in typewriter type; pauses on hover; stops under reduced motion. */
export interface WireTickerProps {
  /** Red label block on the left. */
  label?: string;
  /** Ticker entries; strings or inline nodes (use <b> for names). */
  items: React.ReactNode[];
  /** Seconds for one full loop. Default 60. */
  seconds?: number;
}
export declare function WireTicker(props: WireTickerProps): JSX.Element | null;
