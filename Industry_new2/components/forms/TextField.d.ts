import * as React from 'react';
/** Underlined italic-serif text input (or boxed). */
export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  /** Error text; replaces hint and turns the rule red. */
  error?: string;
  /** Full box instead of a bottom rule. */
  boxed?: boolean;
}
export declare function TextField(props: TextFieldProps): JSX.Element;
