import React from 'react';
import { HalftonePhoto } from './HalftonePhoto.jsx';
export function ColumnStory({ kicker, pending, pendingLabel = 'Byline pending', headline, body, byline, meta, date, image, imageAlt, media, count, lines = 5, href, onOpen }) {
  const openProps = onOpen && !href ? { role: 'button', tabIndex: 0, onClick: onOpen, onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(e); } } } : {};
  const Tag = href ? 'a' : 'article';
  return (
    <Tag className="story story-link" href={href} {...openProps}>
      {(image || media) && <HalftonePhoto src={image} alt={imageAlt} ratio="3/2">{media}</HalftonePhoto>}
      {(kicker || pending) && <div className="kicker-row">{kicker && <span className="kicker">{kicker}</span>}{pending && <span className="kicker kicker-sepia">{pendingLabel}</span>}</div>}
      <h3 className="headline headline-md">{headline}</h3>
      {body && <p className="story-body" style={{ '--clamp': lines }}>{body}</p>}
      {byline && <div className="byline" style={{ fontSize: 14 }}>{byline}</div>}
      {(meta || date) && <div className="story-foot meta"><span>{meta}</span><span>{date}</span></div>}
      {count > 1 && <div className="story-count">Shared {count}×</div>}
    </Tag>
  );
}
