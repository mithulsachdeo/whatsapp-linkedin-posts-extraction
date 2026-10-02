import React from 'react';
export function TextField({ label, hint, error, boxed = false, id, className = '', ...rest }) {
  const auto = React.useId();
  const fid = id || auto;
  return (
    <div className={'field' + (error ? ' field-error' : '')}>
      {label && <label htmlFor={fid}>{label}</label>}
      <input id={fid} className={('input ' + (boxed ? 'input-boxed ' : '') + className).trim()} placeholder={rest.placeholder || ' '} aria-invalid={error ? 'true' : undefined} {...rest} />
      {(error || hint) && <span className="field-hint">{error || hint}</span>}
    </div>
  );
}
