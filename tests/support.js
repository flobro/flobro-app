/**
 * Test-only shims and the tiny spec runner, injected into every fixture
 * before toolbar.js so the toolbar sees them the way it sees a real page.
 *
 * Nothing here is shipped: the harness injects it, the app never does.
 */
(() => {
  'use strict';

  const invokes = [];
  const specs = [];

  /* Stand in for Tauri's IPC so button presses are observable. The toolbar
   * prefers window.__TAURI__ and falls back to this, which is what a remote
   * page without the Tauri bundle gets. */
  window.__TAURI_INTERNALS__ = {
    invoke(cmd, args) {
      invokes.push({ cmd, args: args || {} });
      return Promise.resolve();
    },
  };

  /* The toolbar's shadow root is closed by design. Open it for tests only. */
  let root = null;
  const attachShadow = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (init) {
    const opened = attachShadow.call(this, { ...init, mode: 'open' });
    if (this.tagName === 'FLOBRO-TOOLBAR') root = opened;
    return opened;
  };

  const api = {
    /* queries */
    host: () => document.querySelector('flobro-toolbar'),
    q: (sel) => root && root.querySelector(sel),
    root: () => root,

    /* recorded IPC */
    invokes: () => invokes.slice(),
    invoked: (cmd) => invokes.find((call) => call.cmd === cmd) || null,

    /* events */
    mouse(target, type, init) {
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, composed: true, ...init }));
    },
    key(target, key) {
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true }));
    },
    /* Reveals the bar the way moving the pointer to the top edge does. */
    hover(y) {
      api.mouse(document, 'mousemove', { clientX: Math.round(innerWidth / 2), clientY: y ?? 5 });
    },

    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    async waitFor(predicate, timeout = 2000) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (predicate()) return true;
        await api.sleep(20);
      }
      return false;
    },

    assert(condition, message) {
      if (!condition) throw new Error(message);
    },
    assertIs(actual, expected, message) {
      if (actual !== expected) throw new Error(`${message} (got ${actual}, want ${expected})`);
    },

    /* Registration. `fixture` is a fixture name, or 'common' to run
     * everywhere. `gate` marks a spec for behaviour that is still broken:
     * it names the issue that has to land before it can pass. */
    spec(fixture, name, fn) {
      specs.push({ fixture, name, fn, gate: 0 });
    },
    gated(issue, fixture, name, fn) {
      specs.push({ fixture, name, fn, gate: issue });
    },

    async run() {
      const meta = document.querySelector('meta[name="flobro-fixture"]');
      const fixture = meta ? meta.content : 'live';
      const selected = specs.filter(
        (s) => s.fixture === fixture || (s.fixture === 'common' && fixture !== 'live'),
      );
      const results = [];
      for (const s of selected) {
        api.resetToolbar();
        try {
          await s.fn();
          results.push({ fixture, name: s.name, ok: true, gate: s.gate, error: '' });
        } catch (e) {
          results.push({
            fixture,
            name: s.name,
            ok: false,
            gate: s.gate,
            error: (e && e.message) || String(e),
          });
        }
      }
      return JSON.stringify(results);
    },

    /* Specs share one page, so undo the visible state each one may leave.
     * The reveal transition is pinned off here rather than through a
     * stylesheet the toolbar could replace: a spec has to be able to assert
     * the revealed state on the next line, and the animation only advances
     * while the window is on screen, which is not a thing to depend on. */
    resetToolbar() {
      invokes.length = 0;
      const bar = api.q('.bar');
      const menu = api.q('.menu');
      if (bar) bar.style.transition = 'none';
      if (bar && bar.classList.contains('editing')) api.q('.urlbox').blur();
      if (menu && menu.classList.contains('open')) {
        document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
    },
  };

  window.__flobroTest = api;
})();
