import React from 'react';
import { HalftonePhoto } from '../stories/HalftonePhoto.jsx';
export function Article({ kicker, headline, standfirst, byline, dateline, image, imageAlt, media, caption, aside, children }) {
  return (
    <article className="article anim-rise">
      <div className="article-main">
        {kicker && <div className="kicker">{kicker}</div>}
        <h1 className="headline headline-xxl">{headline}</h1>
        {standfirst && <p className="standfirst">{standfirst}</p>}
        {(byline || dateline) && <div className="article-byline">{byline && <span className="byline">{byline}</span>}{dateline && <span className="dateline">{dateline}</span>}</div>}
        {(image || media) && <HalftonePhoto src={image} alt={imageAlt} ratio="16/9" caption={caption}>{media}</HalftonePhoto>}
        <div className="article-body">{children}</div>
      </div>
      {aside && <aside className="article-aside">{aside}</aside>}
    </article>
  );
}
