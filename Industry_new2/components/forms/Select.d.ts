import * as React from 'react';
/** Native select styled as a ruled box with a drawn caret. */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  options: (string | { value: string; label: string })[];
  boxed?: boolean;
}
export declare function Select(props: SelectProps): JSX.Element;
