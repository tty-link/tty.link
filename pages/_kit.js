/* tty.link page kit. Every page under /pages/ loads this first in <head>, before font-kku.
 *
 *   TTY.lang       'en' | 'ko' — from ?lang=, then the visitor's pick, then the browser
 *   TTY.t({en, ko}) the value for the current language
 *   TTY.reduce     true when the visitor asked for less motion
 *   TTY.embedded   true inside the home page's stage
 *   TTY.onShow(fn) run fn when the page is actually on screen. On the home page a page is
 *                  loaded hidden a few seconds early; start timelines here, not on load.
 *   TTY.ready()    tell the home page this page has drawn and can be shown
 *   TTY.hold(ms)   ask the home page to keep this page up a little longer (someone is playing)
 *
 * Markup for one language only goes in an element with data-lang="en" or data-lang="ko";
 * the other language's elements are removed before the page draws.
 */
(() => {
  const params = new URLSearchParams(location.search);
  const embedded = window.parent !== window;

  let lang = params.get('lang');
  if (lang !== 'en' && lang !== 'ko') {
    let picked = null;
    try { picked = localStorage.getItem('tty.lang'); } catch (e) { /* storage blocked */ }
    const langs = navigator.languages || [navigator.language || 'en'];
    lang = picked === 'en' || picked === 'ko' ? picked : langs.some((l) => /^ko\b/i.test(l)) ? 'ko' : 'en';
  }

  const root = document.documentElement;
  root.lang = lang;

  // font-kku spaces words and lines with margins inside its own cascade layers. A page reset
  // like `* { margin: 0 }` sits outside any layer and would win; hand those boxes back.
  const guard = document.createElement('style');
  guard.textContent = 'font-kku *, .font-kku * { margin: revert-layer; padding: revert-layer; box-sizing: revert-layer; }';
  document.head.append(guard);
  root.classList.add('lang-' + lang);
  if (embedded) root.classList.add('embedded');

  const post = (message) => {
    if (embedded) parent.postMessage(Object.assign({ source: 'tty-page' }, message), location.origin);
  };

  let shown = !embedded;
  const showQueue = [];
  const TTY = {
    lang,
    embedded,
    reduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
    t: (pair) => (pair[lang] !== undefined ? pair[lang] : pair.en),
    onShow(fn) {
      if (shown) setTimeout(fn, 0);
      else showQueue.push(fn);
    },
    ready: () => post({ type: 'ready' }),
    hold: (ms) => post({ type: 'hold', ms: ms || 12000 }),
  };
  window.TTY = TTY;

  addEventListener('message', (event) => {
    if (event.origin !== location.origin || !event.data || event.data.source !== 'tty-home') return;
    if (event.data.type === 'show' && !shown) {
      shown = true;
      showQueue.splice(0).forEach((fn) => fn());
    }
  });

  // Someone touching or typing in a page wants it to stay.
  ['pointerdown', 'keydown'].forEach((type) => addEventListener(type, () => TTY.hold(), { passive: true }));

  // Elements for the other language are removed as the parser inserts them, so a page's
  // own script (which runs before DOMContentLoaded) only ever sees the current language.
  const dropOtherLanguage = (root) => {
    if (root.nodeType !== 1) return;
    if (root.hasAttribute('data-lang') && root.getAttribute('data-lang') !== lang) { root.remove(); return; }
    root.querySelectorAll('[data-lang]').forEach((el) => { if (el.getAttribute('data-lang') !== lang) el.remove(); });
  };
  const parsing = new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach(dropOtherLanguage)));
  parsing.observe(root, { childList: true, subtree: true });

  document.addEventListener('DOMContentLoaded', () => {
    parsing.disconnect();
    document.querySelectorAll('[data-lang]').forEach((el) => {
      if (el.getAttribute('data-lang') !== lang) el.remove();
    });

    // Visits are counted (Cloudflare Web Analytics) only when a page is opened on its own;
    // inside the home stage or the all-pages previews the host page has already been counted.
    if (!embedded) {
      const beacon = document.createElement('script');
      beacon.type = 'module';
      beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
      beacon.setAttribute('data-cf-beacon', JSON.stringify({ token: '838288248cb7432382fa48f87d722c3f' }));
      document.head.append(beacon);
    }

    // Opened on its own (a shared link, or from the all-pages list), a page gets a quiet
    // way back to the home page and to the list. On narrow screens it folds into a small
    // ":)" button so it does not cover the page; tapping it shows the two links.
    if (!embedded) {
      const style = document.createElement('style');
      style.textContent = [
        '.tty-nav{position:fixed;right:12px;bottom:12px;z-index:2147483647;display:flex;gap:6px;align-items:center}',
        '.tty-nav a,.tty-nav button{display:inline-flex;align-items:center;box-sizing:border-box;min-height:30px;padding:4px 10px;border:0;border-radius:999px;background:#ffd84a;color:#1b2b7a;',
        'font:600 13px/1 ui-monospace,Menlo,Consolas,monospace;text-decoration:none;cursor:pointer;',
        'box-shadow:0 0 0 1px rgba(27,43,122,.25),0 2px 8px rgba(0,0,0,.15)}',
        '.tty-nav button{display:none;width:34px;height:34px;padding:0}',
        '@media (max-width:600px){.tty-nav{right:8px;bottom:8px}.tty-nav button{display:block}',
        '.tty-nav:not(.open) a{display:none}}',
      ].join('');
      document.head.append(style);
      const bar = document.createElement('nav');
      bar.className = 'tty-nav';
      bar.setAttribute('aria-label', 'tty.link');
      const link = (href, text) => Object.assign(document.createElement('a'), { href, textContent: text });
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.textContent = ':)';
      toggle.setAttribute('aria-label', lang === 'ko' ? 'tty.link 메뉴' : 'tty.link menu');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.addEventListener('click', () => {
        const open = bar.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(open));
      });
      const home = link('/', 'tty.link :)');
      home.setAttribute('aria-label', 'tty.link');
      bar.append(link('/all/?lang=' + lang, lang === 'ko' ? '전체 보기' : 'All pages'), home, toggle);
      document.body.append(bar);
      // Same wordmark as the home page; the text stays if the alphabet cannot load.
      const glyphs = document.createElement('script');
      glyphs.src = '/assets/tty-glyphs.js';
      glyphs.onload = () => window.TTYGlyphs && window.TTYGlyphs.wordmark(home, 11);
      document.head.append(glyphs);
    }
  });
})();
