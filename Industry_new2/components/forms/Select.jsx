import React from 'react';
export function Select({ label, hint, options = [], boxed = true, id, ...rest }) {
  const auto = React.useId();
  const fid = id || auto;
  return (
    <div className="field">
      {label && <label htmlFor={fid}>{label}</label>}
      <select id={fid} className={'input' + (boxed ? ' input-boxed' : '')} {...rest}>
        {options.map(o => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}
