import * as React from 'react';
/**
 * Blackletter nameplate with an edition strip above and an italic motto below. Put a SectionNav as children.
 */
export interface MastheadProps {
  /** Nameplate text, set in the blackletter masthead face. */
  title?: string;
  /** One-line italic motto under the nameplate. */
  motto?: string;
  /** Edition strip, left: e.g. "Vol. II · No. 40". */
  volume?: string;
  /** Edition strip, centre: the date. */
  date?: string;
  /** Edition strip, right: price line or note. */
  note?: string;
  /** Ink-in animation on mount. Default true. */
  animate?: boolean;
  /** Usually a <SectionNav>. */
  children?: React.ReactNode;
}
export declare function Masthead(props: MastheadProps): JSX.Element;
