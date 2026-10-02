import React from 'react';
export function HalftonePhoto({ src, alt = '', ratio = '4/3', caption, children, className = '' }) {
  return (
    <figure className={('figure ' + className).trim()}>
      <div className="halftone" style={{ aspectRatio: ratio }}>{src ? <img src={src} alt={alt} /> : children}</div>
      {caption && <figcaption className="caption">{caption}</figcaption>}
    </figure>
  );
}
