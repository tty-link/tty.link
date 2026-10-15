// The home owns its layout; LOL owns the player and all joke content.
(() => {
  const VERSION = 1;
  const local = (host) => ['localhost', '127.0.0.1', '[::1]'].includes(host);
  function serviceOrigin() {
    const override = new URLSearchParams(location.search).get('lolOrigin');
    if (override && local(location.hostname)) {
      try {
        const url = new URL(override);
        if (url.origin === override && url.protocol === 'http:' && local(url.hostname)) return url.origin;
      } catch (error) { /* use the public service */ }
    }
    return 'https://lol.tty.link';
  }

  class LOLHost {
    constructor(stage, { lang, page = '', onState, onExplain, onError }) {
      this.stage = stage;
      this.origin = serviceOrigin();
      this.values = { lang, paused: false, visible: !document.hidden, hovering: false, explaining: false };
      this.page = page;
      this.onState = onState;
      this.onExplain = onExplain;
      this.onError = onError;
      this.started = false;
      this.ready = false;
      this.modal = null;
      this.receive = this.receive.bind(this);
      addEventListener('message', this.receive);
      this.observer = new IntersectionObserver(([entry]) => this.configure({ visible: entry.isIntersecting && !document.hidden }));
      this.observer.observe(stage);
      document.addEventListener('visibilitychange', () => {
        const r = stage.getBoundingClientRect();
        this.configure({ visible: !document.hidden && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth });
      });
      this.reload();
    }

    url(path, params = {}) {
      const url = new URL(path, this.origin);
      url.search = new URLSearchParams({ v: VERSION, parentOrigin: location.origin, lang: this.values.lang, ...params });
      return url.href;
    }

    send(type, payload = {}, frame = this.frame) {
      if (frame && frame.contentWindow) frame.contentWindow.postMessage({ source: 'tty-lol-host', version: VERSION, type, ...payload }, this.origin);
    }

    reload() {
      this.closeExplanation();
      this.ready = false;
      this.failed = false;
      clearTimeout(this.timer);
      if (this.frame) this.frame.remove();
      this.frame = document.createElement('iframe');
      this.frame.className = 'lol-embed';
      this.frame.title = 'LOL';
      this.frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      this.frame.src = this.url('/embed/', { page: this.page });
      this.stage.append(this.frame);
      this.timer = setTimeout(() => this.fail(), 15000);
    }

    configure(values) {
      Object.assign(this.values, values);
      if (this.ready) this.send('configure', { values: this.values });
      if (this.modal && values.lang) this.send('explain', { id: this.page, lang: this.values.lang }, this.modal);
    }

    start() { this.started = true; if (this.ready) this.send('show'); }
    next() { if (this.ready && !this.failed) this.send('next'); }

    receive(event) {
      const data = event.data;
      if (event.origin !== this.origin || !data || data.source !== 'lol-player' || data.version !== VERSION) return;
      if (this.modal && event.source === this.modal.contentWindow) {
        if (data.type === 'ready') { clearTimeout(this.modalTimer); this.send('explain', { id: this.page, lang: this.values.lang }, this.modal); }
        if (data.type === 'close') this.closeExplanation();
        return;
      }
      if (event.source !== this.frame.contentWindow || this.failed) return;
      if (data.type === 'ready') {
        clearTimeout(this.timer);
        this.ready = true;
        this.configure(this.values);
        if (this.started) this.send('show');
      }
      if (data.type === 'state') {
        const state = data.state;
        if (!state || state.lang !== this.values.lang || typeof state.id !== 'string' || typeof state.title !== 'string'
          || !Number.isFinite(state.elapsed) || !Number.isFinite(state.duration)) return;
        if (state.status === 'error') { this.fail(); return; }
        if (state.id) {
          if (!/^[a-z0-9-]+$/.test(state.id)) return;
          this.page = state.id;
          this.frame.title = state.title;
        }
        this.onState(state);
      }
      if (data.type === 'ask') this.openExplanation(this.frame, true);
    }

    openExplanation(returnFocus, fromStage = false) {
      if (!this.page || !this.ready || this.modal || this.failed) return;
      this.returnFocus = returnFocus;
      this.fromStage = fromStage;
      this.modal = document.createElement('iframe');
      this.modal.className = 'lol-explanation';
      this.modal.title = this.values.lang === 'ko' ? '이게 왜 웃겨요?' : 'Why is this funny?';
      this.modal.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox');
      this.modal.src = this.url('/explain/', { id: this.page });
      this.savedOverflow = document.documentElement.style.overflow;
      this.inert = [...document.body.children].filter((el) => el.tagName !== 'SCRIPT').map((el) => [el, el.inert]);
      this.inert.forEach(([el]) => { el.inert = true; });
      document.documentElement.style.overflow = 'hidden';
      document.body.append(this.modal);
      this.configure({ explaining: true });
      this.onExplain(true);
      this.modal.focus({ preventScroll: true });
      this.modalTimer = setTimeout(() => { this.closeExplanation(); this.onError('explain'); }, 15000);
    }

    closeExplanation() {
      if (!this.modal) return;
      clearTimeout(this.modalTimer);
      this.modal.remove();
      this.modal = null;
      this.inert.forEach(([el, wasInert]) => { el.inert = wasInert; });
      document.documentElement.style.overflow = this.savedOverflow;
      this.configure({ explaining: false });
      this.onExplain(false);
      if (this.returnFocus && this.returnFocus.isConnected) this.returnFocus.focus({ preventScroll: true });
      if (this.fromStage) this.send('focus');
    }

    fail() {
      clearTimeout(this.timer);
      this.failed = true;
      this.closeExplanation();
      this.onError('player');
    }
  }
  window.LOLHost = LOLHost;
})();
