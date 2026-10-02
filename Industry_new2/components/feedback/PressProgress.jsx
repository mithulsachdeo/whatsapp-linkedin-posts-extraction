import React from 'react';
export function PressProgress({ title, steps = [], current = 0, percent, note = 'You can leave this page. The press keeps running.' }) {
  const pct = percent != null ? percent : Math.round((current / Math.max(steps.length, 1)) * 100);
  return (
    <div className="press">
      {title && <div className="kicker">{title}</div>}
      <ul className="press-steps">
        {steps.map((s, i) => {
          const st = i < current ? 'is-done' : i === current ? 'is-active' : 'is-waiting';
          return <li key={i} className={st}>{st === 'is-active' ? <><span className="anim-type" key={'t' + i}>{s}</span><span className="caret">▌</span></> : s}</li>;
        })}
      </ul>
      <div className="press-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><div className="press-bar-fill" style={{ width: pct + '%' }} /></div>
      <div className="press-foot"><span>{note}</span><span>{pct}%</span></div>
    </div>
  );
}
