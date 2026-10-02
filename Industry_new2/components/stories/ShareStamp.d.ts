/** Rubber-stamp roundel for a count; thumps in on mount. */
export interface ShareStampProps {
  count: number | string;
  /** Top line. Default "Shared". */
  label?: string;
  /** Bottom line. Default "times". */
  suffix?: string;
  /** Stamp-in animation. Default true. */
  animate?: boolean;
  /** CSS time before the stamp lands, e.g. ".75s". */
  delay?: string;
}
export declare function ShareStamp(props: ShareStampProps): JSX.Element;
