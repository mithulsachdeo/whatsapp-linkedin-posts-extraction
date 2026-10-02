/** Inline uppercase choices with a red underline on the selected one: sort, layout, group. */
export interface OptionRuleProps {
  label?: string;
  options: (string | { value: string; label: string })[];
  value: string;
  onChange?: (value: string) => void;
}
export declare function OptionRule(props: OptionRuleProps): JSX.Element;
