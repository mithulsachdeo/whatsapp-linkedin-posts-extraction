export interface SectionNavItem { id?: string; label: string; href?: string; current?: boolean; badge?: number | string; }
/** Centred uppercase section links between a double rule and a hairline. */
export interface SectionNavProps {
  items: SectionNavItem[];
  /** Called with the item id (or index); prevents default navigation when provided. */
  onSelect?: (id: string | number) => void;
  /** aria-label for the nav landmark. */
  label?: string;
}
export declare function SectionNav(props: SectionNavProps): JSX.Element;
