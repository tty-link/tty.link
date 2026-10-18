/* Parts for the home's menu of everything made at tty.link: the contents in the rail, a room in the
 * stage's place for a chapter's poster, and moving LOL out of the way (still playing) and back. */
(() => {
  const C = window.TTYCatalog;
  const H = window.TTYHome;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  const allHref = (lang, cat) => `/tools/?lang=${lang}${cat ? '#' + cat : ''}`;
  const hub = document.querySelector('.hub');
  const phone = () => matchMedia('(max-width: 760px)').matches;

  // Things in a kind, open ones first, then each kind's lead.
  const sorted = (cat) => [...cat.items].sort((a, b) => (a.soon - b.soon) || (b.star - a.star));
  const catOf = (id) => C.cats().find((c) => c.id === id);
  const chapterNo = (i) => String(i + 1).padStart(2, '0');

  /* ---- Moving LOL: shrink the stage into a box elsewhere, still playing, and back ---- */
  // The stage's own box, as if it had not been moved.
  function baseRect() {
    const stage = H.stage;
    const transform = stage.style.transform;
    const transition = stage.style.transition;
    stage.style.transition = 'none';
    stage.style.transform = 'none';
    const rect = stage.getBoundingClientRect();
    stage.style.transform = transform;
    void stage.offsetWidth;
    stage.style.transition = transition;
    return rect;
  }
  // A box given as fractions of the stage's own box.
  function region(fx, fy, fw, fh) {
    const r = baseRect();
    return { left: r.left + r.width * fx, top: r.top + r.height * fy, width: r.width * fw, height: r.height * fh };
  }
  // Fit the stage into box (page coordinates), keeping its shape; align is where it sits in the
  // box (0..1 across, 0..1 down). Pass null to put it back.
  function fitStage(box, { align = [.5, .5] } = {}) {
    const stage = H.stage;
    if (!box) {
      stage.style.transform = '';
      stage.classList.remove('fitted');
      return;
    }
    const r = baseRect();
    const scale = Math.min(box.width / r.width, box.height / r.height);
    const dx = box.left - r.left + (box.width - r.width * scale) * align[0];
    const dy = box.top - r.top + (box.height - r.height * scale) * align[1];
    stage.style.transformOrigin = '0 0';
    stage.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    stage.classList.add('fitted');
  }

  // A room in the stage's cell: what shows where LOL was.
  class Room {
    constructor({ className = '', parent = document.querySelector('.work') } = {}) {
      this.node = el('section', `room ${className}`.trim());
      this.body = el('div', 'room-body');
      this.node.append(this.body);
      parent.append(this.node);
      this.isOpen = false;
      addEventListener('keydown', (event) => { if (event.key === 'Escape' && this.isOpen) this.hide(true); });
    }

    show(render) {
      this.body.replaceChildren(...[].concat(render()));
      if (this.isOpen) return;
      this.isOpen = true;
      this.node.classList.add('open');
      if (this.onopen) this.onopen();
      // On phones the menu sits below the stage; bring the room into view when it is above.
      if (phone() && this.node.getBoundingClientRect().top < 0) {
        this.node.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      }
    }

    hide(returnFocus = false) {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.node.classList.remove('open');
      if (this.onclose) this.onclose();
      if (this.onhide) this.onhide(returnFocus);
    }
  }

  // In the rail, as a book's contents: a head (the word and how much there is), chapter numbers,
  // names, dotted leaders and how many things each holds. A chapter opens to its tools, one section each.
  function tocList() {
    const head = el('div', 'toc-head');
    const label = el('p', 'toc-label');
    const sum = el('p', 'toc-sum');
    head.append(label, sum);
    const list = el('ol', 'toc');
    const all = el('a', 'toc-all');
    const rows = C.cats().map((cat, i) => {
      const li = el('li', 'toc-ch');
      li.dataset.cat = cat.id;
      const row = Object.assign(el('button', 'toc-row'), { type: 'button' });
      row.dataset.cat = cat.id;
      const name = el('span', 'toc-nm');
      row.append(el('span', 'toc-no', chapterNo(i)), name, el('span', 'toc-lead'), el('span', 'toc-pg', String(cat.items.length)));
      li.append(row);
      const secs = el('ol', 'toc-secs');
      li.append(secs);
      list.append(li);
      return { cat, row, name, secs, n: i + 1 };
    });
    hub.append(head, list, all);
    H.onLang((lang) => {
      const ui = C.UI[lang];
      label.textContent = lang === 'ko' ? '차례' : 'CONTENTS';
      sum.textContent = lang === 'ko' ? `${rows.length}장 · ${ui.items(C.ITEMS.length)}` : `${rows.length} chapters · ${ui.items(C.ITEMS.length)}`;
      all.textContent = `${ui.all} →`;
      all.href = allHref(lang);
      rows.forEach(({ cat, name, secs, n }) => {
        name.textContent = C.t(cat, lang);
        secs.replaceChildren(...sorted(cat).map((item, j) => {
          const li = el('li');
          // A section picks its tool on the poster; the poster carries the link.
          const sec = Object.assign(el('button', `toc-sec${item.soon ? ' soon' : ''}`), { type: 'button' });
          sec.dataset.id = item.id;
          sec.append(el('span', 'toc-sno', `${chapterNo(n - 1)}.${j + 1}`), el('span', 'toc-snm', C.t(item, lang)), el('span', 'toc-lead'),
            el('span', 'toc-spg', item.soon ? ui.soon : (lang === 'ko' ? '열림' : 'Open')));
          li.append(sec);
          return li;
        }));
      });
    });
    return rows.map((r) => r.row);
  }

  // Click, not hover: clicking a chapter opens it (LOL steps aside, still playing) and its poster;
  // clicking it again, LOL or Esc closes. Clicking a section picks that tool on the poster.
  // placeAt may put LOL somewhere of its own (and return true); otherwise it goes to a corner.
  function clickRoom({ className = '', triggers, render, onChange, placeAt, onClosed }) {
    const room = new Room({ className: `corner-room ${className}`.trim() });
    let current = null;
    let selected = null;
    const place = () => {
      if (placeAt && placeAt()) return;
      if (phone()) fitStage(region(.64, 0, .36, .36), { align: [1, 0] });
      else fitStage(region(.7, .7, .3, .3), { align: [1, 1] });
    };
    const mark = () => triggers.forEach((t) => {
      const on = t.dataset.cat === current;
      t.setAttribute('aria-expanded', String(on));
      const li = t.closest('li');
      if (li) li.classList.toggle('open', on);
    });
    const select = (id) => {
      selected = id;
      document.querySelectorAll('.toc-sec').forEach((s) => s.classList.toggle('on', s.dataset.id === id));
      room.body.querySelectorAll('[data-id]').forEach((c) => c.classList.toggle('on', c.dataset.id === id));
      const cell = room.body.querySelector(`[data-id="${id}"]`);
      if (cell) cell.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    };
    const open = (key) => {
      current = key;
      selected = null;
      document.querySelectorAll('.toc-sec.on').forEach((s) => s.classList.remove('on'));
      room.show(() => render(key));
      mark();
      if (onChange) onChange(key);
    };
    const close = () => room.hide(true);
    room.onopen = place;
    room.onclose = () => { fitStage(null); if (onClosed) onClosed(); };
    room.onhide = (returnFocus) => {
      const last = triggers.find((t) => t.dataset.cat === current);
      current = null;
      selected = null;
      document.querySelectorAll('.toc-sec.on').forEach((s) => s.classList.remove('on'));
      mark();
      if (onChange) onChange(null);
      if (returnFocus && last) last.focus({ preventScroll: true });
    };
    triggers.forEach((t) => {
      t.setAttribute('aria-expanded', 'false');
      t.addEventListener('click', () => (current === t.dataset.cat ? close() : open(t.dataset.cat)));
    });
    hub.addEventListener('click', (event) => {
      const sec = event.target.closest('.toc-sec');
      if (sec && sec.dataset.id) select(sec.dataset.id);
    });
    H.stage.addEventListener('click', () => { if (room.isOpen) close(); });
    addEventListener('resize', () => { if (room.isOpen) place(); });
    H.onLang(() => {
      if (current) { const keep = selected; room.show(() => render(current)); if (keep) select(keep); }
    });
    return { room, open, close, select, place, get current() { return current; }, get selected() { return selected; } };
  }

  H.onLang((lang) => hub.setAttribute('aria-label', C.UI[lang].made));

  window.TTYHub = { C, H, hub, el, allHref, phone, sorted, catOf, baseRect, fitStage, tocList, clickRoom };
})();
