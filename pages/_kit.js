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

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-lang]').forEach((el) => {
      if (el.getAttribute('data-lang') !== lang) el.remove();
    });

    // Opened on its own (a shared link, or from the all-pages list), a page gets a quiet
    // way back to the home page and to the list.
    if (!embedded) {
      const bar = document.createElement('nav');
      bar.setAttribute('aria-label', 'tty.link');
      bar.setAttribute('style', 'position:fixed;right:12px;bottom:12px;z-index:2147483647;display:flex;gap:6px');
      const pill = (href, text) => {
        const a = document.createElement('a');
        a.href = href;
        a.textContent = text;
        a.setAttribute('style', [
          'padding:6px 10px', 'border-radius:999px', 'background:#ffd84a', 'color:#1b2b7a',
          'font:600 13px/1 ui-monospace,Menlo,Consolas,monospace', 'text-decoration:none',
          'box-shadow:0 0 0 1px rgba(27,43,122,.25)',
        ].join(';'));
        return a;
      };
      bar.append(pill('/all/?lang=' + lang, lang === 'ko' ? '전체 보기' : 'All pages'), pill('/', 'tty.link :)'));
      document.body.append(bar);
    }
  });
})();
