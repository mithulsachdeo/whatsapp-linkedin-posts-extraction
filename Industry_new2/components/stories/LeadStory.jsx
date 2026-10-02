import React from 'react';
import { HalftonePhoto } from './HalftonePhoto.jsx';
import { ShareStamp } from './ShareStamp.jsx';
export function LeadStory({ kicker, pending, pendingLabel = 'Byline pending', headline, standfirst, byline, meta, image, imageAlt, media, caption, count, href, onOpen }) {
  const openProps = onOpen && !href ? { role: 'button', tabIndex: 0, onClick: onOpen, onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(e); } } } : {};
  const Tag = href ? 'a' : 'div';
  return (
    <article className="story-lead anim-press">
      <Tag className="story-link" href={href} {...openProps}>
        {(kicker || pending) && <div className="kicker-row">{kicker && <span className="kicker">{kicker}</span>}{pending && <span className="kicker kicker-sepia">{pendingLabel}</span>}</div>}
        <h2 className="headline headline-xl">{headline}</h2>
        {standfirst && <p className="standfirst">{standfirst}</p>}
        {byline && <div className="byline">{byline}</div>}
        {meta && <div className="meta">{meta}</div>}
      </Tag>
      {(image || media) && (
        <div className="story-lead-media">
          <HalftonePhoto src={image} alt={imageAlt} caption={caption}>{media}</HalftonePhoto>
          {count > 1 && <ShareStamp count={count} delay=".75s" />}
        </div>
      )}
    </article>
  );
}
