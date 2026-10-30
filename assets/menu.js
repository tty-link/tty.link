/* The home's menu and the controls around LOL (styles in menu.css).
 *   1. The contents in the rail, every piece drawn; a chapter opens its poster in the stage's place
 *      and LOL steps into a mini player at the top of the rail, still playing.
 *   2. When to tempt the visitor to ask "Why is this funny?" (TTYNudge).
 *   3. The remote under the stage (◁ ⏸ ▷, all pages), and "Why is this funny?": a "?" that follows
 *      the joke's title and seems alive, with a speech bubble.
 *   4. The Han/Eng key at the rail's foot. */

/* ---- 1. The contents and the poster ---- */
(() => {
  const { C, H, el, hub, allHref, tocList, clickRoom, sorted, catOf, fitStage, baseRect, phone } = window.TTYHub;
  const L = window.TTYLetter;
  const body = document.body;
  const drawn = (node) => node.childNodes.length === 1 && node.firstChild.classList && node.firstChild.classList.contains('lt');

  // Sizes go through CSS variables so a tall screen can set the contents larger (see menu.css).
  const SIZES = [['.toc-label', 'var(--toc-s, 14px)'], ['.toc-sum', 'var(--toc-xs, 12px)'], ['.toc-no', 'var(--toc-s, 14px)'], ['.toc-nm', 'var(--toc-nm, 20px)'], ['.toc-pg', 'var(--toc-s, 14px)'],
    ['.toc-sno', 'var(--toc-xs, 12px)'], ['.toc-snm', 'var(--toc-sn, 15px)'], ['.toc-spg', 'var(--toc-xs, 13px)'], ['.toc-all', 'var(--toc-s, 14px)']];
  // Drawing is lazy, for speed: every font-kku word re-lays the page, so nothing is drawn before the
  // rail has settled (the intro stays light), each word is drawn once with its motion (no drawing
  // then replaying), and a closed chapter's sections wait until it is first opened.
  let ready = false;
  const SIZE_OF = new Map(SIZES);
  const ALL = SIZES.map(([sel]) => sel).join(', ');
  const draw = (root = hub, start = 150) => {
    if (!ready) return;
    let k = 0;
    root.querySelectorAll(ALL).forEach((node) => {
      if (node.closest('.toc-ch:not(.open) .toc-secs')) return;
      const text = node.textContent.trim();
      if (!text || drawn(node)) return;
      const size = SIZE_OF.get(SIZES.find(([sel]) => node.matches(sel))[0]);
      L.set(node, text, { size, animate: 'random', delay: start + k * 28 });
      k += 1;
    });
    // A section name that does not fit fades at its end (only then).
    requestAnimationFrame(() => root.querySelectorAll('.toc-snm').forEach((node) => node.classList.toggle('cut', node.scrollWidth > node.clientWidth + 1)));
    // Pointing at a row shakes its letters loose for a moment, like the home's sentence (nothing opens).
    hub.querySelectorAll('.toc-row, .toc-sec, .toc-all, .toc-head').forEach((node) => { node.dataset.ltShake = 'kku'; });
  };
  // The right column counts the tools in each chapter (page numbers read as counts and confused).
  const triggers = tocList();
  triggers.forEach((row) => {
    const x = L.render('+', { size: '15px' });
    x.classList.add('toc-x');
    row.append(x);
  });

  /* The mini player at the top of the rail, above the contents. When a chapter opens, LOL shrinks
     into a small place there, and its own controls (what is on, ◁ ⏸ ▷ ?, all pages) move beside it
     instead of staying under the stage. Everything about LOL sits together, and the contents get
     the height that is left, so opening a chapter never runs the menu past the rail. */
  const mini = el('div', 'mini');
  const dock = el('div', 'mini-dock');
  const cap = Object.assign(el('button', 'mini-back'), { type: 'button' });
  mini.append(dock, cap);
  hub.prepend(mini);
  const nowEl = document.querySelector('.now');
  const toolsEl = document.querySelector('.tools');
  const homes = [nowEl, toolsEl].map((node) => [node, node.parentNode, node.nextSibling]);
  const mount = (on) => {
    if (on && nowEl.parentNode !== mini) { mini.insertBefore(toolsEl, cap); mini.insertBefore(nowEl, cap); }
    if (!on && nowEl.parentNode === mini) homes.forEach(([node, parent, next]) => parent.insertBefore(node, next));
  };
  const placeAt = () => {
    if (phone()) return false;
    body.classList.add('docked');
    mount(true);
    const d = dock.getBoundingClientRect();
    if (d.height < 60) { mount(false); body.classList.remove('docked'); return false; }
    // Shape the place to LOL's own proportions, so the dashed outline hugs it; at most half the rail.
    const r = baseRect();
    dock.style.width = `${Math.round(Math.min(mini.clientWidth * .5, d.height * (r.width / r.height)))}px`;
    const box = dock.getBoundingClientRect();
    fitStage({ left: box.left + 4, top: box.top + 4, width: box.width - 8, height: box.height - 8 });
    return true;
  };

  // The poster: standing title | number, a line, a bar and a ruled table; it turns in.
  let api = null;
  // The room's size, measured once and again only after it changes (a ResizeObserver below says
  // so). Measuring makes the browser lay the page out first, and on a change of language, when the
  // poster is drawn again, that is every element of it.
  let size = null;
  const measure = () => size || (api ? (size = { w: api.room.body.clientWidth, h: api.room.node.clientHeight }) : { w: 900, h: 640 });
  const render = (id) => {
    const lang = H.lang;
    const ui = C.UI[lang];
    const cat = catOf(id);
    const items = sorted(cat);
    const room = measure();
    // On a large screen the poster is wider than the 980px it was set for: its type grows with it (up to 1.3x).
    const k = Math.min(1.3, Math.max(1, room.w / 980));
    const px = (v) => `${Math.round(v * k)}px`;
    const num = String(C.CATS.findIndex((c) => c.id === id) + 1).padStart(2, '0');
    const name = C.t(cat, lang);
    const roomH = room.h;
    const poster = el('div', 'poster');
    const big = L.render(num, { size: `${Math.round(roomH * 1.05)}px`, animate: 'random', step: 160 });
    big.classList.add('poster-big');
    // Hangul stands upright, one syllable under another; Latin runs up the edge on its side.
    const side = el('div', 'poster-side');
    side.dataset.ltShake = 'kku';
    let tw;
    if (phone()) {
      // A phone has no width to spare for a standing title: it lies across the top instead.
      side.classList.add('poster-flat');
      side.append(L.render(name, { size: '44px', animate: 'random', delay: 120 }));
      tw = 0;
    } else if (/[가-힣]/.test(name)) {
      const chars = [...name.replace(/\s+/g, '')];
      const px = Math.round(Math.min(room.w * (room.w < 820 ? .12 : .15), 170, (roomH - 70) / (chars.length * 1.3)));
      side.classList.add('poster-stack');
      chars.forEach((ch, i) => side.append(L.render(ch, { size: `${px}px`, animate: 'random', delay: 120 + i * 140 })));
      tw = px * 1.32 + 26;
    } else {
      const lt = Math.round(Math.min(230, (roomH * .84) / (name.length * .53)));
      const rot = L.render(name, { size: `${lt}px`, animate: 'random', delay: 120 });
      rot.classList.add('poster-rot');
      side.append(rot);
      tw = lt * 1.08 + 30;
    }
    poster.style.setProperty('--tw', `${Math.round(tw)}px`);
    const main = el('div', 'poster-main');
    const head = el('div', 'poster-head');
    head.dataset.ltShake = 'kku';
    // The count keeps to the blurb's last word, so it never drops onto a line of its own.
    const blurb = C.t(cat.blurb, lang).replace(/ (\S+)$/, ' $1');
    const kick = L.render(`${blurb} · ${(items.length ? ui.items(items.length) : ui.soon).replace(/ /g, ' ')}`, { size: px(16), animate: 'random', delay: 320 });
    kick.style.maxWidth = '60%';
    head.append(L.render(num, { size: phone() ? '64px' : px(120), animate: 'random', delay: 160, step: 120 }), kick);
    const th = el('div', 'poster-t poster-th');
    (lang === 'ko' ? ['번호', '이름', '하는 일', '상태'] : ['No.', 'Name', 'What it does', 'Status']).forEach((t, i) => {
      const cell = L.render(t, { size: px(13), animate: 'random', delay: 380 + i * 60 });
      if (i === 2) cell.classList.add('poster-ds');
      if (i === 3) cell.classList.add('poster-st');
      th.append(cell);
    });
    // Fewer things, larger rows and names; the rest of the table stays ruled (see fillBlanks).
    const n = items.length;
    // A narrow poster (a small window) takes a size down so names keep to one line where they can.
    const narrow = room.w < 820;
    const nameSize = phone() ? (n <= 2 ? 30 : 22) : ((n <= 1 ? 44 : n <= 2 ? 36 : n <= 4 ? 28 : 24) - (narrow ? 4 : 0)) * k;
    poster.style.setProperty('--row', `${n && n <= 2 ? 92 : n <= 4 ? 70 : 58}px`);
    const rows = items.map((item, i) => {
      const tr = el('div', `poster-t poster-tr${item.soon ? ' soon' : ''}`);
      tr.dataset.id = item.id;
      tr.dataset.ltShake = 'kku';
      const at = 450 + i * 140;
      const nm = L.render(C.t(item, lang), { size: `${Math.round(nameSize)}px`, animate: 'random', delay: at });
      nm.classList.add('poster-nm');
      const ds = L.render(C.t(item.d, lang), { size: px(15), animate: 'random', delay: at + 120, step: 12 });
      ds.classList.add('poster-ds');
      const st = el('span', 'poster-st');
      if (item.soon) st.append(L.render(ui.soon, { size: '13px', animate: 'random', delay: at + 200 }));
      else {
        const a = Object.assign(el('a'), { href: item.url });
        a.append(L.render(`${ui.open} →`, { size: '13px', animate: 'random', delay: at + 200 }));
        st.append(a);
      }
      tr.append(L.render(`${num}.${i + 1}`, { size: px(16), animate: 'random', delay: at }), nm, ds, st);
      return tr;
    });
    const foot = el('div', 'poster-foot');
    foot.dataset.ltShake = 'kku';
    const last = 450 + items.length * 140 + 200;
    const all = Object.assign(el('a'), { href: allHref(lang, id) });
    all.append(L.render(`${ui.all} →`, { size: '14px', animate: 'random', delay: last }));
    foot.append(L.render('tty.link :)', { size: '15px', animate: 'random', delay: last }), all);
    const table = el('div', 'poster-rows');
    table.append(...rows);
    main.append(head, el('div', 'poster-bar'), th, table, foot);
    poster.append(big, side, main);
    poster.dataset.num = num;
    poster.dataset.n = n;
    requestAnimationFrame(() => requestAnimationFrame(() => { fitTitle(poster); fillBlanks(poster); }));
    // Again whenever a row changes height: font-kku drawing a name or a line can take it to two lines.
    const grow = new ResizeObserver(() => fillBlanks(poster));
    rows.forEach((tr) => grow.observe(tr));
    return poster;
  };
  // A Latin title standing on its side is measured once drawn and fitted to the column's height
  // (letter widths vary too much to size it from its length), and the column fits the word.
  function fitTitle(poster) {
    const rot = poster.querySelector('.poster-rot');
    if (!rot || !poster.isConnected) return;
    // Within the column's height, and no wider a column than a fifth of the poster (short words).
    const max = poster.querySelector('.poster-side').clientHeight * .9;
    const maxCol = poster.clientWidth * .2 - 34;
    const scale = Math.min(1, max / rot.offsetWidth, maxCol / rot.offsetHeight);
    if (scale < 1) rot.style.setProperty('--lt', `${parseFloat(rot.style.getPropertyValue('--lt')) * scale}px`);
    poster.style.setProperty('--tw', `${Math.round(rot.offsetHeight + 34)}px`);
  }

  // The table keeps its rules down to the foot: blank rows numbered on from the last tool, the first
  // one saying it is kept free for what comes next (for the first thing, in an empty chapter). A
  // short chapter reads as a page with room.
  // Only the difference is added or taken away, so blank rows already showing do not fade in again.
  function fillBlanks(poster) {
    if (!poster.isConnected) return;
    const ui = C.UI[H.lang];
    const table = poster.querySelector('.poster-rows');
    const foot = poster.querySelector('.poster-foot');
    const rows = [...table.querySelectorAll('.poster-tr:not(.blank)')];
    const blanks = [...table.querySelectorAll('.blank')];
    // Layout boxes, not screen boxes: the poster may still be turning in (rotated) when this runs.
    // With no tools, a blank row is as tall as the poster set rows to be.
    const pitch = Math.max(48, rows.length ? rows[0].offsetHeight : parseFloat(poster.style.getPropertyValue('--row')) || 58);
    const used = rows.reduce((sum, row) => sum + row.offsetHeight, 0);
    const free = foot.offsetTop - (table.offsetTop + used) - 22;
    const count = Math.max(0, Math.min(10, Math.floor(free / pitch)));
    blanks.slice(count).forEach((row) => row.remove());
    const n = Number(poster.dataset.n);
    for (let k = blanks.length; k < count; k += 1) {
      const row = el('div', 'poster-t poster-tr blank');
      row.setAttribute('aria-hidden', 'true');
      row.style.setProperty('--k', k);
      row.append(L.render(`${poster.dataset.num}.${n + k + 1}`, { size: '16px' }));
      // Its words are drawn through the drawing queue (they fade in late anyway), not in this callback.
      if (k === 0) row.append(L.render(n ? ui.free : ui.first, { size: '15px', wait: 200 }));
      table.append(row);
    }
  }
  addEventListener('resize', () => { const poster = document.querySelector('.room.open .poster'); if (poster) { fitTitle(poster); fillBlanks(poster); } });
  const more = () => hub.classList.toggle('more', hub.scrollHeight - hub.clientHeight - hub.scrollTop > 4);
  hub.addEventListener('scroll', more, { passive: true });
  addEventListener('resize', more);
  new ResizeObserver(more).observe(hub);

  api = clickRoom({
    className: 'poster-room', triggers, render, placeAt, onClosed: () => { mount(false); body.classList.remove('docked'); },
    onChange: (key) => {
      if (!key) return;
      const secs = hub.querySelector(`.toc-ch[data-cat="${key}"] .toc-secs`);
      // First opening draws the sections (with their motion); later openings replay them.
      if (secs.querySelector('.lt')) L.assemble(secs, { delay: 120 }); else draw(secs, 120);
    },
  });
  new ResizeObserver(() => { size = null; }).observe(api.room.node);
  cap.dataset.ltShake = 'kku';
  cap.addEventListener('click', (event) => { event.stopPropagation(); api.close(); });

  // The home's own controls, drawn as well. Their Hangul plays a random font-kku motion when
  // pointed at, as their Latin shakes.
  document.querySelectorAll('.btn, .now-title').forEach((node) => { node.dataset.ltShake = 'kku'; });
  const drawCap = () => L.set(cap, H.lang === 'ko' ? 'LOL 다시 크게 ↗' : 'Back to LOL ↗', { size: '13px', animate: 'random' });

  // When the rail has settled (a beat after, so it does not share a frame with the home's own
  // settling), the contents and the controls are drawn and put together, top to bottom.
  H.settled.then(() => setTimeout(() => {
    ready = true;
    draw();
    drawCap();
    // LOL's line on its poster says how many jokes there are; LOL's list is asked now, after the stage.
    C.count(H.host.origin);
    let k = 0;
    [['.now-title', '16px'], ['.next', '14px'], ['.pause-label', '14px'], ['.ask-label', '14px'], ['.btn.all', '14px'], ['.ask-q', '15px']]
      .forEach(([sel, size]) => document.querySelectorAll(sel).forEach((node) => { L.watch(node, { size, animate: 'random', delay: 260 + k * 40 }); k += 1; }));
  }, 120));

  // A change of language rebuilds the contents in the new words; they are drawn and fly in again.
  H.onLang(() => {
    if (!ready) return;
    draw();
    drawCap();
  });
})();

/* ---- 2. When to tempt the visitor to ask "Why is this funny?" ----
   Once per joke, a little after its punchline (55% of the way through, never before 4.5 s), and
   only while the joke is actually playing: not paused, not hovered, not while an explanation is
   open, not in a hidden tab. A joke whose explanation was already opened is left alone, and after
   three explanations the visitor clearly knows the button, so this stops. ?nudge=fast nudges 1.5 s
   in, for checking the motion. */
window.TTYNudge = (() => {
  const host = window.TTYHome.host;
  const fast = new URLSearchParams(location.search).get('nudge') === 'fast';
  const listeners = [];
  const done = new Set();
  const asked = new Set();
  let opened = 0;
  let timer = 0;
  let current = null;
  const at = (state) => (fast ? 1500 : Math.max(4500, state.duration * .55));
  const onState = host.onState;
  host.onState = (state) => {
    onState.call(host, state);
    current = state;
    listeners.forEach((l) => l.state && l.state(state));
    clearTimeout(timer);
    if (!state.id || !state.running || done.has(state.id) || opened >= 3 || host.modal) return;
    const wait = at(state) - state.elapsed;
    if (wait < -3000) return;
    timer = setTimeout(() => {
      if (host.modal || document.hidden || done.has(state.id)) return;
      done.add(state.id);
      listeners.forEach((l) => l.nudge && l.nudge(state));
    }, Math.max(0, wait));
  };
  const open = host.openExplanation;
  host.openExplanation = function (...args) {
    if (this.page) { done.add(this.page); asked.add(this.page); }
    if (!this.modal) opened += 1;
    clearTimeout(timer);
    return open.apply(this, args);
  };
  return {
    // listener: { nudge(state), state(state) }
    on(listener) { listeners.push(listener); if (current && listener.state) listener.state(current); },
    at,
    get state() { return current; },
    get opened() { return opened; },
    asked: (id) => asked.has(id),
  };
})();

/* ---- 3. The remote under the stage, and "Why is this funny?" ---- */
(() => {
  const L = window.TTYLetter;
  const { H, phone } = window.TTYHub;
  const host = H.host;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // The rail's foot, level with the remote: the language key lives there on a large screen.
  const foot = document.createElement('div');
  foot.className = 'rail-foot';
  document.querySelector('.rail').append(foot);

  const ask = document.querySelector('.ask');
  const pause = document.querySelector('.pause');
  const next = document.querySelector('.next');
  const all = document.querySelector('.btn.all');
  const row = document.querySelector('.tools-row');
  const now = document.querySelector('.now');
  // The question is about the joke on stage, so its "?" follows the joke's title. Its bubble opens
  // into the room after the title: it never covers a control or the joke.
  const line = document.createElement('div');
  line.className = 'now-line';
  const title = document.querySelector('.now-title');
  title.before(line);
  const wrap = document.createElement('span');
  wrap.className = 'ask-wrap';
  wrap.append(ask);
  line.append(title, wrap);
  // A title too long for its line (the mini player) fades at its end; one that fits stays whole.
  const fit = () => title.classList.toggle('cut', title.scrollWidth > title.clientWidth + 1);
  new MutationObserver(() => requestAnimationFrame(fit)).observe(title, { childList: true, subtree: true });
  new ResizeObserver(fit).observe(line);
  const shine = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  shine.setAttribute('class', 'ask-shine');
  shine.setAttribute('viewBox', '0 0 22 22');
  shine.setAttribute('aria-hidden', 'true');
  shine.innerHTML = '<path d="M11 2v5"/><path d="M2.5 8.5l4.2 2.6"/><path d="M4 18l4.4-2.2"/>';
  wrap.append(shine);
  // The bubble repeats the button's question for the eye; the button stays the accessible one.
  const pop = document.createElement('span');
  pop.className = 'ask-pop';
  pop.dataset.side = 'right';
  const bubble = Object.assign(document.createElement('button'), { type: 'button', className: 'ask-bubble', tabIndex: -1 });
  bubble.setAttribute('aria-hidden', 'true');
  bubble.addEventListener('click', () => ask.click());
  pop.append(bubble);
  wrap.append(pop);
  const prev = Object.assign(document.createElement('button'), { type: 'button', className: 'btn prev' });
  // ◁ ⏸ ▷ and all pages, side by side; the last group keeps the home's (hidden) language buttons.
  const langGroup = row.querySelector('.tools-group:last-child');
  row.prepend(prev, pause, next, all);
  row.querySelectorAll('.tools-group').forEach((g) => { if (g !== langGroup && !g.children.length) g.remove(); });
  H.onLang((lang) => {
    L.set(bubble, lang === 'ko' ? '이게 왜 웃겨요?' : 'Why is this funny?', { size: '16px' });
    prev.setAttribute('aria-label', lang === 'ko' ? '이전' : 'Previous');
    prev.title = prev.getAttribute('aria-label');
    next.title = lang === 'ko' ? '다음' : 'Next';
  });

  // Previous: the home remembers what it has shown and asks LOL for the one before.
  let seen = [];
  let at = -1;
  let jumping = null;
  const mark = () => prev.setAttribute('aria-disabled', String(at <= 0));
  mark();
  TTYNudge.on({
    state(s) {
      if (!s.id || s.id === seen[at]) return;
      if (s.id === jumping) jumping = null;
      else { seen = seen.slice(0, at + 1); seen.push(s.id); at = seen.length - 1; }
      mark();
    },
  });
  const back = () => {
    if (at <= 0 || !host.ready) return;
    H.resume();
    at -= 1;
    jumping = seen[at];
    host.goto(jumping);
    mark();
  };
  prev.addEventListener('click', back);
  addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' || event.ctrlKey || event.metaKey || event.altKey || host.modal || event.target.closest('input, textarea, select, [contenteditable]')) return;
    back();
  });

  // The bubble. It opens after the "?" when the line has room for it, else under it (a phone, or a
  // page with room below). With no room at all it waits, unless the visitor points at the "?": then
  // it opens back over the title, which they are not reading just then.
  const side = (pointing) => {
    const need = bubble.offsetWidth + 12;
    const at = wrap.getBoundingClientRect();
    // The room runs to the end of the title's block, or up to the remote when it is on the same line.
    let end = now.getBoundingClientRect().right;
    const r = row.getBoundingClientRect();
    if (r.left > at.right && r.top < at.bottom && r.bottom > at.top) end = r.left - 8;
    if (end - at.right >= need) return 'right';
    if (phone() || at.bottom + bubble.offsetHeight + 14 <= innerHeight) return 'below';
    return pointing ? 'left' : null;
  };
  let shownAt = 0;
  let hideTimer = 0;
  const sparkle = () => { if (reduce) return; shine.classList.remove('on'); void shine.getBoundingClientRect(); shine.classList.add('on'); };
  const show = (how, stay) => {
    if (!bubble.classList.contains('show')) {
      const where = side(how === 'hover');
      if (!where) return;
      pop.dataset.side = where;
    }
    clearTimeout(hideTimer);
    shownAt = Date.now();
    bubble.classList.remove('hide');
    const fresh = !bubble.classList.contains('show');
    bubble.classList.add('show');
    bubble.classList.toggle('big', how === 'punch');
    if (fresh && !reduce) {
      L.assemble(bubble);
      bubble.querySelectorAll('font-kku').forEach((k) => L.play(k, how === 'punch' ? ['wave', 'bounce'] : undefined));
      if (how !== 'hover') sparkle();
    }
    ask.classList.toggle('lit', how === 'punch');
    if (stay) hide(stay);
  };
  const hide = (after) => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (bubble.matches(':hover') || ask.matches(':hover')) return hide(1200);
      bubble.classList.remove('show', 'big');
      bubble.classList.add('hide');
      ask.classList.remove('lit');
    }, after);
  };
  ask.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') show('hover'); });
  ask.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(700); });
  bubble.addEventListener('pointerleave', () => hide(700));
  ask.addEventListener('click', () => hide(0));

  /* On its own: soon after the first joke is on stage, once more a little later, at each punchline,
     and every so often after that. Pointing at the stage (which holds the joke) does not silence it;
     only an open explanation, a hidden tab, an open chapter (the visitor is reading the menu), or a
     visitor who has clearly found the button (this joke already explained, or three explanations
     opened) does. */
  let id = null;
  let periodic = 0;
  const quiet = () => host.modal || document.hidden || H.paused || document.body.classList.contains('docked') || TTYNudge.opened >= 3 || (id && TTYNudge.asked(id));
  const plan = () => {
    clearTimeout(periodic);
    periodic = setTimeout(() => {
      if (!quiet() && Date.now() - shownAt > 12000) show('again', 3800);
      plan();
    }, 13000 + Math.random() * 7000);
  };
  H.settled.then(() => {
    // The first joke opens about a second after the rail settles.
    setTimeout(() => { if (!quiet()) show('punch', 4800); plan(); }, 3200);
    setTimeout(() => { if (!quiet() && Date.now() - shownAt > 9000) show('again', 4000); }, 15500);
  });
  TTYNudge.on({
    state(s) { id = s.id; },
    // The punchline pops it, unless a bubble has just gone (then the "?" only lights up and rings).
    nudge() {
      if (quiet()) return;
      if (Date.now() - shownAt > 8000) show('punch', 5000);
      else { ask.classList.add('lit'); MOVES[3](); setTimeout(() => ask.classList.remove('lit'), 2400); }
    },
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) plan(); });
  // Opening a chapter puts away a bubble that is out: the controls move beside the small LOL.
  new MutationObserver(() => { if (document.body.classList.contains('docked') && bubble.classList.contains('show')) hide(0); })
    .observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // The "?" seems alive: now and then one small move, never the same twice in a row. Big enough to
  // catch the eye from across the page, short enough not to annoy.
  const glyph = () => ask.querySelector('.ask-q .lt') || ask.querySelector('.ask-q');
  const ring = () => { wrap.classList.remove('ring'); void wrap.offsetWidth; wrap.classList.add('ring'); };
  const MOVES = [
    // Jump, squash on landing, a small rebound.
    () => ask.animate([{ transform: 'none' }, { transform: 'translateY(-18px) rotate(-14deg)', offset: .3 }, { transform: 'translateY(0) scale(1.25, .75)', offset: .55 },
      { transform: 'translateY(-6px) scale(.95, 1.08)', offset: .72 }, { transform: 'none' }], { duration: 820, easing: 'cubic-bezier(.3, .7, .3, 1)' }),
    // A whole turn of the "?" while the circle swells.
    () => { ask.animate([{ transform: 'none' }, { transform: 'scale(1.22)', offset: .5 }, { transform: 'none' }], { duration: 760, easing: 'ease-in-out' });
      (glyph() || ask).animate([{ transform: 'none' }, { transform: 'rotate(360deg)' }], { duration: 760, easing: 'cubic-bezier(.5, 0, .2, 1.3)' }); },
    // Rung like a bell.
    () => ask.animate([{ transform: 'none' }, { transform: 'rotate(-22deg)' }, { transform: 'rotate(18deg)' }, { transform: 'rotate(-14deg)' }, { transform: 'rotate(9deg)' }, { transform: 'rotate(-4deg)' }, { transform: 'none' }],
      { duration: 820, easing: 'ease-in-out' }),
    // A heartbeat, with two rings spreading.
    () => { ring(); ask.animate([{ transform: 'none' }, { transform: 'scale(1.38)', offset: .18 }, { transform: 'scale(1)', offset: .38 }, { transform: 'scale(1.26)', offset: .56 }, { transform: 'none' }], { duration: 760, easing: 'ease-out' }); },
    // The dot leaps high, twice, and the hook bows after it.
    () => { ask.querySelectorAll('.ask-q .dot').forEach((dot) => dot.animate([{ transform: 'none' }, { transform: 'translateY(-1.1px)', offset: .3 }, { transform: 'none', offset: .5 }, { transform: 'translateY(-.6px)', offset: .75 }, { transform: 'none' }], { duration: 900, easing: 'ease-out' }));
      (glyph() || ask).animate([{ transform: 'none' }, { transform: 'scaleY(.82) rotate(8deg)', offset: .3 }, { transform: 'none', offset: .5 }, { transform: 'scaleY(.9)', offset: .75 }, { transform: 'none' }], { duration: 900 }); },
  ];
  let last = -1;
  const alive = () => {
    setTimeout(() => {
      if (!reduce && !document.hidden && !host.modal && !H.paused && !bubble.classList.contains('show') && document.body.classList.contains('settled')) {
        let k = Math.floor(Math.random() * MOVES.length);
        if (k === last) k = (k + 1) % MOVES.length;
        last = k;
        MOVES[k]();
      }
      alive();
    }, 3000 + Math.random() * 2200);
  };
  alive();
})();

/* ---- 4. The Han/Eng key (hankey.js) ----
   It presses the home's own (hidden) language buttons, so storage and every label follow as before.
   On a large screen it sits at the rail's foot; on a phone it joins the controls at the top. */
(() => {
  const { H } = window.TTYHub;
  const buttons = [...document.querySelectorAll('.langs button')];
  const key = TTYHanKey.make((lang) => { const b = buttons.find((x) => x.dataset.lang === lang); if (b) b.click(); });
  const foot = document.querySelector('.rail-foot');
  const row = document.querySelector('.tools-row');
  const place = () => {
    const target = matchMedia('(max-width: 760px)').matches ? row : foot;
    if (key.button.parentNode !== target) target.append(key.button);
  };
  place();
  addEventListener('resize', place);
  H.onLang(key.update);
})();
