import * as React from 'react';
export interface TableColumn { key: string; label: string; numeric?: boolean; render?: (row: any) => React.ReactNode; }
/** Ledger table: double rule over uppercase headers, dotted row rules, typewriter numerals. */
export interface TableProps {
  caption?: string;
  columns: TableColumn[];
  rows: Record<string, any>[];
  rowKey?: string;
}
export declare function Table(props: TableProps): JSX.Element;
