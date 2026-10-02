import * as React from 'react';
/** Inverted ink strip confirming an action, with optional undo. Position it yourself (fixed bottom-left). */
export interface ToastProps {
  label?: string;
  children: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}
export declare function Toast(props: ToastProps): JSX.Element;
