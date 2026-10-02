/* @ds-bundle: {"format":4,"namespace":"Industry_indust","components":[{"name":"Article","sourcePath":"components/article/Article.jsx"},{"name":"PullQuote","sourcePath":"components/article/PullQuote.jsx"},{"name":"Table","sourcePath":"components/data/Table.jsx"},{"name":"Dialog","sourcePath":"components/feedback/Dialog.jsx"},{"name":"EmptyState","sourcePath":"components/feedback/EmptyState.jsx"},{"name":"Notice","sourcePath":"components/feedback/Notice.jsx"},{"name":"PressProgress","sourcePath":"components/feedback/PressProgress.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Button","sourcePath":"components/forms/Button.jsx"},{"name":"OptionRule","sourcePath":"components/forms/OptionRule.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"TextField","sourcePath":"components/forms/TextField.jsx"},{"name":"Masthead","sourcePath":"components/masthead/Masthead.jsx"},{"name":"SectionNav","sourcePath":"components/masthead/SectionNav.jsx"},{"name":"WireTicker","sourcePath":"components/masthead/WireTicker.jsx"},{"name":"ColumnStory","sourcePath":"components/stories/ColumnStory.jsx"},{"name":"HalftonePhoto","sourcePath":"components/stories/HalftonePhoto.jsx"},{"name":"IndexRow","sourcePath":"components/stories/IndexRow.jsx"},{"name":"LeadStory","sourcePath":"components/stories/LeadStory.jsx"},{"name":"ShareStamp","sourcePath":"components/stories/ShareStamp.jsx"},{"name":"Tag","sourcePath":"components/stories/Tag.jsx"}],"sourceHashes":{"components/article/Article.jsx":"42c5fd98a31f","components/article/PullQuote.jsx":"7756130496da","components/data/Table.jsx":"e807ddcb1008","components/feedback/Dialog.jsx":"2b4f2124a0ca","components/feedback/EmptyState.jsx":"6d31fd08c92f","components/feedback/Notice.jsx":"fb1ae429cccd","components/feedback/PressProgress.jsx":"b57cca72bf71","components/feedback/Toast.jsx":"032c99037564","components/forms/Button.jsx":"d4e11990eefe","components/forms/OptionRule.jsx":"d6117a7f1914","components/forms/Select.jsx":"620fc9a7ea08","components/forms/TextField.jsx":"78034c6a2806","components/masthead/Masthead.jsx":"002a60822c15","components/masthead/SectionNav.jsx":"8980a41940ed","components/masthead/WireTicker.jsx":"f45ba0e013f0","components/stories/ColumnStory.jsx":"b2016a7796a3","components/stories/HalftonePhoto.jsx":"8caf86e43bd9","components/stories/IndexRow.jsx":"022afd0a0f5e","components/stories/LeadStory.jsx":"c7e275f8ef1b","components/stories/ShareStamp.jsx":"51b17c629cc0","components/stories/Tag.jsx":"ff6668663e56"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.Industry_indust = window.Industry_indust || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/article/PullQuote.jsx
try { (() => {
function PullQuote({
  children,
  cite
}) {
  return /*#__PURE__*/React.createElement("blockquote", {
    className: "pullquote"
  }, /*#__PURE__*/React.createElement("p", null, children), cite && /*#__PURE__*/React.createElement("cite", null, cite));
}
Object.assign(__ds_scope, { PullQuote });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/article/PullQuote.jsx", error: String((e && e.message) || e) }); }

// components/data/Table.jsx
try { (() => {
function Table({
  caption,
  columns = [],
  rows = [],
  rowKey = 'id'
}) {
  return /*#__PURE__*/React.createElement("table", {
    className: "table"
  }, caption && /*#__PURE__*/React.createElement("caption", null, caption), /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, columns.map(c => /*#__PURE__*/React.createElement("th", {
    key: c.key,
    className: c.numeric ? 'num' : undefined
  }, c.label)))), /*#__PURE__*/React.createElement("tbody", null, rows.map((r, i) => /*#__PURE__*/React.createElement("tr", {
    key: r[rowKey] ?? i
  }, columns.map(c => /*#__PURE__*/React.createElement("td", {
    key: c.key,
    className: c.numeric ? 'num' : undefined
  }, c.render ? c.render(r) : r[c.key]))))));
}
Object.assign(__ds_scope, { Table });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Table.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Dialog.jsx
try { (() => {
function Dialog({
  open = true,
  kicker,
  title,
  children,
  actions,
  onClose
}) {
  React.useEffect(() => {
    if (!open || !onClose) return;
    const k = e => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "dialog-backdrop",
    onClick: e => {
      if (e.target === e.currentTarget && onClose) onClose();
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "dialog",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": title
  }, kicker && /*#__PURE__*/React.createElement("div", {
    className: "kicker"
  }, kicker), /*#__PURE__*/React.createElement("h2", {
    className: "dialog-title"
  }, title), /*#__PURE__*/React.createElement("div", {
    className: "dialog-body"
  }, children), actions && /*#__PURE__*/React.createElement("div", {
    className: "dialog-actions"
  }, actions)));
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Dialog.jsx", error: String((e && e.message) || e) }); }

// components/feedback/EmptyState.jsx
try { (() => {
function EmptyState({
  kicker,
  title,
  children,
  action
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "empty anim-rise"
  }, kicker && /*#__PURE__*/React.createElement("div", {
    className: "kicker"
  }, kicker), /*#__PURE__*/React.createElement("h2", {
    className: "headline headline-lg"
  }, title), children && /*#__PURE__*/React.createElement("p", {
    className: "standfirst"
  }, children), action);
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Notice.jsx
try { (() => {
function Notice({
  tone = 'ink',
  label,
  children,
  action
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: 'notice' + (tone !== 'ink' ? ' notice-' + tone : ''),
    role: "note"
  }, /*#__PURE__*/React.createElement("div", {
    className: "notice-text"
  }, label && /*#__PURE__*/React.createElement("div", {
    className: "kicker kicker-ink"
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "notice-body"
  }, children)), action);
}
Object.assign(__ds_scope, { Notice });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Notice.jsx", error: String((e && e.message) || e) }); }

// components/feedback/PressProgress.jsx
try { (() => {
function PressProgress({
  title,
  steps = [],
  current = 0,
  percent,
  note = 'You can leave this page. The press keeps running.'
}) {
  const pct = percent != null ? percent : Math.round(current / Math.max(steps.length, 1) * 100);
  return /*#__PURE__*/React.createElement("div", {
    className: "press"
  }, title && /*#__PURE__*/React.createElement("div", {
    className: "kicker"
  }, title), /*#__PURE__*/React.createElement("ul", {
    className: "press-steps"
  }, steps.map((s, i) => {
    const st = i < current ? 'is-done' : i === current ? 'is-active' : 'is-waiting';
    return /*#__PURE__*/React.createElement("li", {
      key: i,
      className: st
    }, st === 'is-active' ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
      className: "anim-type",
      key: 't' + i
    }, s), /*#__PURE__*/React.createElement("span", {
      className: "caret"
    }, "\u258C")) : s);
  })), /*#__PURE__*/React.createElement("div", {
    className: "press-bar",
    role: "progressbar",
    "aria-valuemin": 0,
    "aria-valuemax": 100,
    "aria-valuenow": pct
  }, /*#__PURE__*/React.createElement("div", {
    className: "press-bar-fill",
    style: {
      width: pct + '%'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "press-foot"
  }, /*#__PURE__*/React.createElement("span", null, note), /*#__PURE__*/React.createElement("span", null, pct, "%")));
}
Object.assign(__ds_scope, { PressProgress });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/PressProgress.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
function Toast({
  label = 'Correction',
  children,
  actionLabel,
  onAction
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "toast",
    role: "status"
  }, /*#__PURE__*/React.createElement("span", {
    className: "toast-text"
  }, label && /*#__PURE__*/React.createElement("b", {
    className: "toast-label"
  }, label), children), actionLabel && /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: onAction
  }, actionLabel));
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/forms/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Button({
  variant = 'outline',
  size = 'md',
  block = false,
  className = '',
  href,
  children,
  ...rest
}) {
  const cls = ['btn', variant !== 'outline' && 'btn-' + variant, size === 'sm' && 'btn-sm', block && 'btn-block', className].filter(Boolean).join(' ');
  if (href) return /*#__PURE__*/React.createElement("a", _extends({
    className: cls,
    href: href
  }, rest), children);
  return /*#__PURE__*/React.createElement("button", _extends({
    className: cls,
    type: rest.type || 'button'
  }, rest), children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Button.jsx", error: String((e && e.message) || e) }); }

// components/forms/OptionRule.jsx
try { (() => {
function OptionRule({
  label,
  options = [],
  value,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "options",
    role: "radiogroup",
    "aria-label": label
  }, label && /*#__PURE__*/React.createElement("span", {
    className: "options-label"
  }, label), options.map(o => {
    const v = typeof o === 'string' ? o : o.value;
    const l = typeof o === 'string' ? o : o.label;
    return /*#__PURE__*/React.createElement("button", {
      key: v,
      type: "button",
      role: "radio",
      "aria-checked": v === value,
      className: "option",
      onClick: () => onChange && onChange(v)
    }, l);
  }));
}
Object.assign(__ds_scope, { OptionRule });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/OptionRule.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Select({
  label,
  hint,
  options = [],
  boxed = true,
  id,
  ...rest
}) {
  const auto = React.useId();
  const fid = id || auto;
  return /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: fid
  }, label), /*#__PURE__*/React.createElement("select", _extends({
    id: fid,
    className: 'input' + (boxed ? ' input-boxed' : '')
  }, rest), options.map(o => typeof o === 'string' ? /*#__PURE__*/React.createElement("option", {
    key: o,
    value: o
  }, o) : /*#__PURE__*/React.createElement("option", {
    key: o.value,
    value: o.value
  }, o.label))), hint && /*#__PURE__*/React.createElement("span", {
    className: "field-hint"
  }, hint));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/TextField.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function TextField({
  label,
  hint,
  error,
  boxed = false,
  id,
  className = '',
  ...rest
}) {
  const auto = React.useId();
  const fid = id || auto;
  return /*#__PURE__*/React.createElement("div", {
    className: 'field' + (error ? ' field-error' : '')
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: fid
  }, label), /*#__PURE__*/React.createElement("input", _extends({
    id: fid,
    className: ('input ' + (boxed ? 'input-boxed ' : '') + className).trim(),
    placeholder: rest.placeholder || ' ',
    "aria-invalid": error ? 'true' : undefined
  }, rest)), (error || hint) && /*#__PURE__*/React.createElement("span", {
    className: "field-hint"
  }, error || hint));
}
Object.assign(__ds_scope, { TextField });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/TextField.jsx", error: String((e && e.message) || e) }); }

// components/masthead/Masthead.jsx
try { (() => {
function Masthead({
  title = 'The Postboard',
  motto,
  volume,
  date,
  note,
  animate = true,
  children
}) {
  const strip = [volume, date, note].filter(Boolean);
  return /*#__PURE__*/React.createElement("header", {
    className: "masthead"
  }, strip.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "edition-strip"
  }, strip.map((s, i) => /*#__PURE__*/React.createElement("span", {
    key: i
  }, s))), /*#__PURE__*/React.createElement("div", {
    className: 'masthead-block' + (animate ? ' anim-ink' : '')
  }, /*#__PURE__*/React.createElement("h1", {
    className: "masthead-title"
  }, title), motto && /*#__PURE__*/React.createElement("p", {
    className: "masthead-motto"
  }, motto)), children);
}
Object.assign(__ds_scope, { Masthead });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/masthead/Masthead.jsx", error: String((e && e.message) || e) }); }

// components/masthead/SectionNav.jsx
try { (() => {
function SectionNav({
  items = [],
  onSelect,
  label = 'Sections'
}) {
  return /*#__PURE__*/React.createElement("nav", {
    className: "section-nav",
    "aria-label": label
  }, items.map((it, i) => /*#__PURE__*/React.createElement("a", {
    key: it.id ?? i,
    href: it.href || '#',
    "aria-current": it.current ? 'page' : undefined,
    onClick: e => {
      if (onSelect) {
        e.preventDefault();
        onSelect(it.id ?? i);
      }
    }
  }, it.label, it.badge != null && it.badge !== 0 && /*#__PURE__*/React.createElement("span", {
    className: "section-badge"
  }, it.badge))));
}
Object.assign(__ds_scope, { SectionNav });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/masthead/SectionNav.jsx", error: String((e && e.message) || e) }); }

// components/masthead/WireTicker.jsx
try { (() => {
function WireTicker({
  label = 'The wire',
  items = [],
  seconds = 60
}) {
  if (!items.length) return null;
  const all = items.concat(items);
  return /*#__PURE__*/React.createElement("div", {
    className: "wire",
    "aria-label": label
  }, /*#__PURE__*/React.createElement("span", {
    className: "wire-label"
  }, /*#__PURE__*/React.createElement("span", {
    className: "wire-dot"
  }), label), /*#__PURE__*/React.createElement("div", {
    className: "wire-window"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wire-track",
    style: {
      animationDuration: seconds + 's'
    }
  }, all.map((it, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    "aria-hidden": i >= items.length ? 'true' : undefined
  }, it)))));
}
Object.assign(__ds_scope, { WireTicker });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/masthead/WireTicker.jsx", error: String((e && e.message) || e) }); }

// components/stories/HalftonePhoto.jsx
try { (() => {
function HalftonePhoto({
  src,
  alt = '',
  ratio = '4/3',
  caption,
  children,
  className = ''
}) {
  return /*#__PURE__*/React.createElement("figure", {
    className: ('figure ' + className).trim()
  }, /*#__PURE__*/React.createElement("div", {
    className: "halftone",
    style: {
      aspectRatio: ratio
    }
  }, src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: alt
  }) : children), caption && /*#__PURE__*/React.createElement("figcaption", {
    className: "caption"
  }, caption));
}
Object.assign(__ds_scope, { HalftonePhoto });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/stories/HalftonePhoto.jsx", error: String((e && e.message) || e) }); }

// components/article/Article.jsx
try { (() => {
function Article({
  kicker,
  headline,
  standfirst,
  byline,
  dateline,
  image,
  imageAlt,
  media,
  caption,
  aside,
  children
}) {
  return /*#__PURE__*/React.createElement("article", {
    className: "article anim-rise"
  }, /*#__PURE__*/React.createElement("div", {
    className: "article-main"
  }, kicker && /*#__PURE__*/React.createElement("div", {
    className: "kicker"
  }, kicker), /*#__PURE__*/React.createElement("h1", {
    className: "headline headline-xxl"
  }, headline), standfirst && /*#__PURE__*/React.createElement("p", {
    className: "standfirst"
  }, standfirst), (byline || dateline) && /*#__PURE__*/React.createElement("div", {
    className: "article-byline"
  }, byline && /*#__PURE__*/React.createElement("span", {
    className: "byline"
  }, byline), dateline && /*#__PURE__*/React.createElement("span", {
    className: "dateline"
  }, dateline)), (image || media) && /*#__PURE__*/React.createElement(__ds_scope.HalftonePhoto, {
    src: image,
    alt: imageAlt,
    ratio: "16/9",
    caption: caption
  }, media), /*#__PURE__*/React.createElement("div", {
    className: "article-body"
  }, children)), aside && /*#__PURE__*/React.createElement("aside", {
    className: "article-aside"
  }, aside));
}
Object.assign(__ds_scope, { Article });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/article/Article.jsx", error: String((e && e.message) || e) }); }

// components/stories/ColumnStory.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function ColumnStory({
  kicker,
  pending,
  pendingLabel = 'Byline pending',
  headline,
  body,
  byline,
  meta,
  date,
  image,
  imageAlt,
  media,
  count,
  lines = 5,
  href,
  onOpen
}) {
  const openProps = onOpen && !href ? {
    role: 'button',
    tabIndex: 0,
    onClick: onOpen,
    onKeyDown: e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onOpen(e);
      }
    }
  } : {};
  const Tag = href ? 'a' : 'article';
  return /*#__PURE__*/React.createElement(Tag, _extends({
    className: "story story-link",
    href: href
  }, openProps), (image || media) && /*#__PURE__*/React.createElement(__ds_scope.HalftonePhoto, {
    src: image,
    alt: imageAlt,
    ratio: "3/2"
  }, media), (kicker || pending) && /*#__PURE__*/React.createElement("div", {
    className: "kicker-row"
  }, kicker && /*#__PURE__*/React.createElement("span", {
    className: "kicker"
  }, kicker), pending && /*#__PURE__*/React.createElement("span", {
    className: "kicker kicker-sepia"
  }, pendingLabel)), /*#__PURE__*/React.createElement("h3", {
    className: "headline headline-md"
  }, headline), body && /*#__PURE__*/React.createElement("p", {
    className: "story-body",
    style: {
      '--clamp': lines
    }
  }, body), byline && /*#__PURE__*/React.createElement("div", {
    className: "byline",
    style: {
      fontSize: 14
    }
  }, byline), (meta || date) && /*#__PURE__*/React.createElement("div", {
    className: "story-foot meta"
  }, /*#__PURE__*/React.createElement("span", null, meta), /*#__PURE__*/React.createElement("span", null, date)), count > 1 && /*#__PURE__*/React.createElement("div", {
    className: "story-count"
  }, "Shared ", count, "\xD7"));
}
Object.assign(__ds_scope, { ColumnStory });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/stories/ColumnStory.jsx", error: String((e && e.message) || e) }); }

// components/stories/IndexRow.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function IndexRow({
  no,
  headline,
  byline,
  meta,
  pending,
  pendingLabel = 'Byline pending',
  count = 1,
  href,
  onOpen
}) {
  const openProps = onOpen && !href ? {
    role: 'button',
    tabIndex: 0,
    onClick: onOpen,
    onKeyDown: e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onOpen(e);
      }
    }
  } : {};
  const Tag = href ? 'a' : 'div';
  return /*#__PURE__*/React.createElement(Tag, _extends({
    className: "index-row",
    href: href
  }, openProps), /*#__PURE__*/React.createElement("span", {
    className: "index-no"
  }, "No. ", no), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "headline headline-sm"
  }, headline), byline && /*#__PURE__*/React.createElement("div", {
    className: "byline",
    style: {
      fontSize: 14.5,
      marginTop: 2
    }
  }, byline), (meta || pending) && /*#__PURE__*/React.createElement("div", {
    className: "meta",
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '2px 10px',
      marginTop: 2
    }
  }, meta, pending && /*#__PURE__*/React.createElement("span", {
    className: "tag tag-dashed"
  }, pendingLabel))), /*#__PURE__*/React.createElement("span", {
    className: 'index-count' + (count > 1 ? '' : ' is-single')
  }, count, "\xD7"));
}
Object.assign(__ds_scope, { IndexRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/stories/IndexRow.jsx", error: String((e && e.message) || e) }); }

// components/stories/ShareStamp.jsx
try { (() => {
function ShareStamp({
  count,
  label = 'Shared',
  suffix = 'times',
  animate = true,
  delay
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: 'stamp' + (animate ? ' anim-stamp' : ''),
    style: delay != null ? {
      '--delay': delay
    } : undefined,
    role: "img",
    "aria-label": label + ' ' + count + ' ' + suffix
  }, /*#__PURE__*/React.createElement("span", {
    className: "stamp-label"
  }, label), /*#__PURE__*/React.createElement("span", {
    className: "stamp-count"
  }, count, "\xD7"), /*#__PURE__*/React.createElement("span", {
    className: "stamp-label"
  }, suffix));
}
Object.assign(__ds_scope, { ShareStamp });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/stories/ShareStamp.jsx", error: String((e && e.message) || e) }); }

// components/stories/LeadStory.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function LeadStory({
  kicker,
  pending,
  pendingLabel = 'Byline pending',
  headline,
  standfirst,
  byline,
  meta,
  image,
  imageAlt,
  media,
  caption,
  count,
  href,
  onOpen
}) {
  const openProps = onOpen && !href ? {
    role: 'button',
    tabIndex: 0,
    onClick: onOpen,
    onKeyDown: e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onOpen(e);
      }
    }
  } : {};
  const Tag = href ? 'a' : 'div';
  return /*#__PURE__*/React.createElement("article", {
    className: "story-lead anim-press"
  }, /*#__PURE__*/React.createElement(Tag, _extends({
    className: "story-link",
    href: href
  }, openProps), (kicker || pending) && /*#__PURE__*/React.createElement("div", {
    className: "kicker-row"
  }, kicker && /*#__PURE__*/React.createElement("span", {
    className: "kicker"
  }, kicker), pending && /*#__PURE__*/React.createElement("span", {
    className: "kicker kicker-sepia"
  }, pendingLabel)), /*#__PURE__*/React.createElement("h2", {
    className: "headline headline-xl"
  }, headline), standfirst && /*#__PURE__*/React.createElement("p", {
    className: "standfirst"
  }, standfirst), byline && /*#__PURE__*/React.createElement("div", {
    className: "byline"
  }, byline), meta && /*#__PURE__*/React.createElement("div", {
    className: "meta"
  }, meta)), (image || media) && /*#__PURE__*/React.createElement("div", {
    className: "story-lead-media"
  }, /*#__PURE__*/React.createElement(__ds_scope.HalftonePhoto, {
    src: image,
    alt: imageAlt,
    caption: caption
  }, media), count > 1 && /*#__PURE__*/React.createElement(__ds_scope.ShareStamp, {
    count: count,
    delay: ".75s"
  })));
}
Object.assign(__ds_scope, { LeadStory });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/stories/LeadStory.jsx", error: String((e && e.message) || e) }); }

// components/stories/Tag.jsx
try { (() => {
function Tag({
  tone = 'ink',
  children
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: 'tag' + (tone !== 'ink' ? ' tag-' + tone : '')
  }, children);
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/stories/Tag.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Article = __ds_scope.Article;

__ds_ns.PullQuote = __ds_scope.PullQuote;

__ds_ns.Table = __ds_scope.Table;

__ds_ns.Dialog = __ds_scope.Dialog;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.Notice = __ds_scope.Notice;

__ds_ns.PressProgress = __ds_scope.PressProgress;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.OptionRule = __ds_scope.OptionRule;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.TextField = __ds_scope.TextField;

__ds_ns.Masthead = __ds_scope.Masthead;

__ds_ns.SectionNav = __ds_scope.SectionNav;

__ds_ns.WireTicker = __ds_scope.WireTicker;

__ds_ns.ColumnStory = __ds_scope.ColumnStory;

__ds_ns.HalftonePhoto = __ds_scope.HalftonePhoto;

__ds_ns.IndexRow = __ds_scope.IndexRow;

__ds_ns.LeadStory = __ds_scope.LeadStory;

__ds_ns.ShareStamp = __ds_scope.ShareStamp;

__ds_ns.Tag = __ds_scope.Tag;

})();
