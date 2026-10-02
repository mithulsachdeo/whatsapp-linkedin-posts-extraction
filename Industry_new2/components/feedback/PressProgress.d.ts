/** Multi-step job progress: done / typing / waiting steps above a ruled bar. */
export interface PressProgressProps {
  /** Kicker line, e.g. "Setting type · chat.zip". */
  title?: string;
  steps: string[];
  /** Index of the active step. */
  current?: number;
  /** 0–100; defaults to current / steps. */
  percent?: number;
  note?: string;
}
export declare function PressProgress(props: PressProgressProps): JSX.Element;
