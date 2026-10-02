import React from 'react';
export function Table({ caption, columns = [], rows = [], rowKey = 'id' }) {
  return (
    <table className="table">
      {caption && <caption>{caption}</caption>}
      <thead><tr>{columns.map(c => <th key={c.key} className={c.numeric ? 'num' : undefined}>{c.label}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={r[rowKey] ?? i}>{columns.map(c => <td key={c.key} className={c.numeric ? 'num' : undefined}>{c.render ? c.render(r) : r[c.key]}</td>)}</tr>)}</tbody>
    </table>
  );
}
