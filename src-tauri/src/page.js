/**
 * Flobro page-side script for the reserved-band build.
 *
 * The toolbar lives in its own webview above this one, so everything about
 * drawing it is gone from here. What is left is the work that can only be
 * done from inside the page: routing new-window requests, and telling the
 * band what page this is, since the band has no DOM of its own to read.
 *
 * Note what is absent: the capturing keydown shield the injected toolbar
 * needed (#8). The address bar is in another webview now, so a page that
 * claims every keystroke cannot reach it.
 */
(function flobroPage() {
  'use strict';

  if (window.top !== window.self) return;
  if (window.__FLOBRO_PAGE__) return;
  window.__FLOBRO_PAGE__ = true;

  function invoke(cmd, args) {
    try {
      var fn =
        window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke
          ? window.__TAURI__.core.invoke
          : window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke;
      if (!fn) return Promise.reject(new Error('Flobro: Tauri IPC unavailable'));
      return Promise.resolve(fn(cmd, args || {})).catch(function (e) {
        console.error('Flobro page:', cmd, e);
        throw e;
      });
    } catch (e) {
      console.error('Flobro page:', cmd, e);
      return Promise.reject(e);
    }
  }

  /* Tauri webviews ignore target="_blank" and window.open(); route both to
   * a new float window (covers OAuth popups too). */
  function openInNewFloat(url) {
    if (!url) return;
    invoke('open_float', { url: String(url) });
  }

  window.open = function (url) {
    if (url) openInNewFloat(url);
    return null;
  };

  document.addEventListener(
    'click',
    function (e) {
      if (e.defaultPrevented || e.button !== 0) return;
      var el = e.target;
      while (el && el !== document) {
        if (el.tagName === 'A' && el.target === '_blank' && el.href) {
          e.preventDefault();
          openInNewFloat(el.href);
          return;
        }
        el = el.parentNode;
      }
    },
    true,
  );

  /* Feed the band. In the single-webview design the toolbar just read
   * document.title next to it; now it takes a round trip through Rust. */
  var lastReported = '';

  function reportMeta() {
    var link = document.querySelector('link[rel~="icon"]');
    var meta = {
      title: document.title || location.hostname,
      icon: link ? link.href : location.origin + '/favicon.ico',
      url: location.href,
    };
    var key = meta.title + '|' + meta.icon + '|' + meta.url;
    if (key === lastReported) return;
    lastReported = key;
    invoke('report_page_meta', meta);
  }

  function watchHead() {
    reportMeta();
    if (!document.head) return;
    /* The head only: a subtree observer on documentElement wakes up for
     * every DOM change a busy page makes. */
    new MutationObserver(reportMeta).observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchHead);
  } else {
    watchHead();
  }
  window.addEventListener('load', reportMeta);
})();
