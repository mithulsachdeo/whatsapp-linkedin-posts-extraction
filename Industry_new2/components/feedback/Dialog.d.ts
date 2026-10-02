import * as React from 'react';
/** Modal sheet with a hard offset shadow, over a dimmed page. Escape and backdrop click call onClose. */
export interface DialogProps {
  open?: boolean;
  kicker?: string;
  title: string;
  children?: React.ReactNode;
  /** Buttons, right-aligned under a hairline. */
  actions?: React.ReactNode;
  onClose?: () => void;
}
export declare function Dialog(props: DialogProps): JSX.Element | null;
