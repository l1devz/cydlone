(() => {
  const LANGS = {
    tr: { name: 'Türkçe', locale: 'tr-TR' },
    en: { name: 'English', locale: 'en-US' },
    fr: { name: 'Français', locale: 'fr-FR' },
    de: { name: 'Deutsch', locale: 'de-DE' },
  };
  const KEY = 'cydlone:lang';

  function detect() {
    try {
      const saved = localStorage.getItem(KEY);
      if (LANGS[saved]) return saved;
    } catch {  }
    const prefs = navigator.languages?.length ? navigator.languages : [navigator.language || 'tr'];
    for (const p of prefs) {
      const code = String(p).slice(0, 2).toLowerCase();
      if (LANGS[code]) return code;
    }
    return 'tr';
  }

  const lang = detect();
  const exact = new Map();
  const patterns = [];
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function add(code, dict) {
    if (code !== lang) return;
    for (const [src, dst] of Object.entries(dict)) {
      const key = norm(src);
      if (!/\{\d+\}/.test(key)) { exact.set(key, dst); continue; }
      const order = [];
      const re = new RegExp(`^${escape(key).replace(/\\\{(\d+)\\\}/g, (_, n) => { order.push(Number(n)); return '(.+?)'; })}$`, 's');
      patterns.push({ re, order, dst, weight: key.replace(/\{\d+\}/g, '').length });
    }
    patterns.sort((a, b) => b.weight - a.weight);
  }

  const fill = (s, args) => s.replace(/\{(\d+)\}/g, (m, n) => (args[n] !== undefined ? args[n] : m));

  function lookup(text) {
    const key = norm(text);
    if (!key) return null;
    if (exact.has(key)) return exact.get(key);
    for (const p of patterns) {
      const m = p.re.exec(key);
      if (!m) continue;
      const args = [];
      p.order.forEach((n, i) => { args[n] = m[i + 1]; });
      return fill(p.dst, args);
    }
    return null;
  }

  function translate(text) {
    if (lang === 'tr' || typeof text !== 'string') return text;
    const hit = lookup(text);
    if (hit == null) return text;
    const lead = text.match(/^\s*/)[0];
    const trail = text.match(/\s*$/)[0];
    return lead + hit + trail;
  }

  function t(src, ...args) {
    return fill(translate(src), args);
  }

  function setLang(code) {
    if (!LANGS[code]) return;
    try { localStorage.setItem(KEY, code); } catch {  }
    document.cookie = `lang=${code}; path=/; max-age=31536000; samesite=lax`;
    location.reload();
  }

  window.I18N = { lang, locale: LANGS[lang].locale, languages: LANGS, add, t, translate, setLang };
  window.t = t;
  document.documentElement.lang = lang;
  document.cookie = `lang=${lang}; path=/; max-age=31536000; samesite=lax`;

  document.addEventListener('DOMContentLoaded', () => {
    const slot = document.getElementById('lang-picker');
    if (!slot) return;
    const select = document.createElement('select');
    select.className = 'lang-select';
    select.setAttribute('aria-label', 'Dil');
    for (const [code, { name }] of Object.entries(LANGS)) select.add(new Option(name, code, false, code === lang));
    select.addEventListener('change', () => setLang(select.value));
    slot.setAttribute('translate', 'no');
    slot.append(select);
  });

  if (lang === 'tr') return;

  document.write(`<script src="/js/locales/${lang}.js"><\/script>`);

  const SKIP = [
    '[translate="no"]', 'script', 'style', 'pre', 'code', 'textarea', 'svg',
    '.msg-content', '.msg-author', '.reply-author', '.reply-text', '.rich-embeds', '.link-embeds', '.invite-embeds',
    '.profile-bio', '.profile-name', '.profile-username', '.ch-name', '.role-name', '.role-chip', '.member-name',
    '.dm-name', '.mi-name', '.mi-server', '.server-header-name', '#channel-title', '.user-name', '.um-name', '.um-username',
    '.ic-name', '.ic-title', '.iv-name', '.vu-name', '.vp-name', '.ut-name', '.ssm-name', '.nt-name', '.fr-name',
    '.rp-name', '.bc-name', '.ban-name', '.app-hero-name', '.ac-name', '.af-name', '.em-name-wrap', '.ep-preview-name',
    '.mention', '.mp-label', '.le-title', '.le-desc', '.re-desc', '.re-author', '.re-field-name', '.sb-cmd',
    '.em-group-title.server', '#ss-server-name', '.server-name', '.cat-name',
  ].join(',');
  const ATTRS = ['placeholder', 'title', 'aria-label', 'data-tip'];

  function translateAttrs(node) {
    for (const a of ATTRS) {
      const v = node.getAttribute(a);
      if (!v) continue;
      const out = translate(v);
      if (out !== v) node.setAttribute(a, out);
    }
    if (node.tagName === 'INPUT' && (node.type === 'button' || node.type === 'submit') && node.value) {
      const out = translate(node.value);
      if (out !== node.value) node.value = out;
    }
  }

  function translateText(node) {
    const v = node.nodeValue;
    if (!v || !/\S/.test(v)) return;
    const out = translate(v);
    if (out !== v) node.nodeValue = out;
  }

  function walk(root) {
    if (root.nodeType === 3) {
      if (!root.parentElement?.closest(SKIP)) translateText(root);
      return;
    }
    if (root.nodeType !== 1) return;
    const stack = [[root, !!root.closest(SKIP)]];
    while (stack.length) {
      const [el, skipped] = stack.pop();
      translateAttrs(el);
      for (let c = el.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) { if (!skipped) translateText(c); }
        else if (c.nodeType === 1) stack.push([c, skipped || c.matches(SKIP)]);
      }
    }
  }

  const titleFix = () => {
    const out = translate(document.title);
    if (out !== document.title) document.title = out;
  };

  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'childList') r.addedNodes.forEach(walk);
      else if (r.type === 'characterData') {
        if (r.target.parentElement?.closest('title')) titleFix();
        else if (!r.target.parentElement?.closest(SKIP)) translateText(r.target);
      } else if (r.type === 'attributes') {
        translateAttrs(r.target);
      }
    }
    if (records.some((r) => r.target.nodeName === 'TITLE' || r.target.parentNode?.nodeName === 'TITLE')) titleFix();
  });
  observer.observe(document.documentElement, {
    childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...ATTRS, 'value'],
  });

  document.addEventListener('DOMContentLoaded', () => { walk(document.body); titleFix(); });

  const nativeConfirm = window.confirm.bind(window);
  const nativeAlert = window.alert.bind(window);
  window.confirm = (msg) => nativeConfirm(translate(String(msg)));
  window.alert = (msg) => nativeAlert(translate(String(msg)));
})();
