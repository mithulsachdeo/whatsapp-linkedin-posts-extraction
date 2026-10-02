import React from 'react';
export function OptionRule({ label, options = [], value, onChange }) {
  return (
    <div className="options" role="radiogroup" aria-label={label}>
      {label && <span className="options-label">{label}</span>}
      {options.map(o => {
        const v = typeof o === 'string' ? o : o.value;
        const l = typeof o === 'string' ? o : o.label;
        return <button key={v} type="button" role="radio" aria-checked={v === value} className="option" onClick={() => onChange && onChange(v)}>{l}</button>;
      })}
    </div>
  );
}
