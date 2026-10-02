// templates/postboard/ds-base.js — Postboard uses the attached Organic system
(() => {
  const base = '../../_ds/organic-7ec134c2-fd0e-45c9-8226-750ce60ae957';
  for (const p of ['styles.css']) {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = base + '/' + p;
    document.head.appendChild(l);
  }
  const s = document.createElement('script');
  s.src = base + '/_ds_bundle.js';
  s.onerror = () => console.error('ds-base.js: failed to load ' + s.src + ' — point the base line at the bound _ds/<folder> tree relative to this page');
  document.head.appendChild(s);
})();
