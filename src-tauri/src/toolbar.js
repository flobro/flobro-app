/**
 * Flobro hover toolbar — injected into every floating browser window.
 * Invisible until the mouse reaches the top edge; the page itself is
 * completely interface-free otherwise.
 */
(function flobroToolbar() {
  'use strict';

  // Top frame only, once only, and only inside Tauri.
  if (window.top !== window.self) return;
  if (window.__FLOBRO_TOOLBAR__) return;
  window.__FLOBRO_TOOLBAR__ = true;

  var HIDE_DELAY = 1200; // ms after the mouse leaves before fading out
  var HOT_ZONE = 46; // px from the top edge that reveals the toolbar
  var DRAG_THRESHOLD = 4; // px of movement before a titlebar press becomes a drag
  var zoom = 1;
  var pinned = true;
  var hideTimer = null;

  var I18N = {
    en: {
      zoom: 'Zoom',
      zoomOut: 'Zoom out',
      zoomIn: 'Zoom in',
      zoomReset: 'Reset zoom',
      refresh: 'Refresh',
      aspect: 'Snap to 16:9',
      pin: 'Toggle stay-on-top',
      newWindow: 'New window',
      menu: 'Menu',
      minimize: 'Minimize',
      settings: 'Settings',
      close: 'Close',
      drag: 'Drag to move, double-click to edit the URL',
      dragOnly: 'Drag to move',
    },
    nl: {
      zoom: 'Zoom',
      zoomOut: 'Uitzoomen',
      zoomIn: 'Inzoomen',
      zoomReset: 'Zoom herstellen',
      refresh: 'Vernieuwen',
      aspect: 'Naar 16:9',
      pin: 'Bovenaan blijven aan/uit',
      newWindow: 'Nieuw venster',
      menu: 'Menu',
      minimize: 'Minimaliseren',
      settings: 'Instellingen',
      close: 'Sluiten',
      drag: 'Sleep om te verplaatsen, dubbelklik om de URL te wijzigen',
      dragOnly: 'Sleep om te verplaatsen',
    },
  };
  // The app replaces __FLOBRO_LANG__ with the language from settings; if the
  // token survives (dev builds), fall back to the system language.
  var langPref = '__FLOBRO_LANG__';
  if (langPref.indexOf('__') === 0 || !I18N[langPref]) {
    langPref = (navigator.language || 'en').toLowerCase().indexOf('nl') === 0 ? 'nl' : 'en';
  }
  var L = I18N[langPref];

  /* The local new-tab page has its own hero address bar, so the titlebar's
   * double-click URL editor is disabled there to avoid two competing inputs. */
  var isNewTabPage =
    (location.protocol === 'tauri:' || location.hostname === 'tauri.localhost') &&
    /\/new\.html$/.test(location.pathname);

  function invoke(cmd, args) {
    /* Remote pages don't always get the __TAURI__ global bundle; the
     * internals object is injected whenever IPC is enabled, so fall back
     * to it. Failures are logged so a misconfigured capability is visible
     * in the webview console instead of a silently dead button. */
    try {
      var fn =
        window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke
          ? window.__TAURI__.core.invoke
          : window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke;
      if (!fn) return Promise.reject(new Error('Flobro: Tauri IPC unavailable'));
      return Promise.resolve(fn(cmd, args || {})).catch(function (e) {
        console.error('Flobro toolbar:', cmd, e);
        throw e;
      });
    } catch (e) {
      console.error('Flobro toolbar:', cmd, e);
      return Promise.reject(e);
    }
  }

  function startDrag() {
    try {
      if (window.__TAURI__ && window.__TAURI__.window) {
        window.__TAURI__.window.getCurrentWindow().startDragging();
      } else {
        invoke('plugin:window|start_dragging');
      }
    } catch {
      /* dragging unavailable */
    }
  }

  var ICONS = {
    zoomOut:
      '<svg viewBox="0 0 16 16"><path d="M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>',
    zoomIn:
      '<svg viewBox="0 0 16 16"><path d="M3 8h10M8 3v10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>',
    zoomReset:
      '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.2" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/></svg>',
    refresh:
      '<svg viewBox="0 0 16 16"><path d="M13 8a5 5 0 1 1-1.5-3.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" fill="none"/><path d="M13 1.8v3h-3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    aspect:
      '<svg viewBox="0 0 16 16"><rect x="2" y="4" width="12" height="8" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>',
    pin: '<svg viewBox="0 0 16 16"><path d="M9.5 2.5l4 4-2.2.6-2.6 2.6.3 3.3-2-2L4 14l-1-1 3-3-2-2 3.3.3L9 5.7l-.6-2.2z" fill="currentColor" stroke="none" transform="translate(-.7 -.6)"/></svg>',
    plus: '<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>',
    dots: '<svg viewBox="0 0 16 16"><circle cx="8" cy="3.2" r="1.5" fill="currentColor"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="8" cy="12.8" r="1.5" fill="currentColor"/></svg>',
    minimize:
      '<svg viewBox="0 0 16 16"><path d="M3 12h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>',
    settings:
      /* The gear path's own bounding box is centered on (7, 8.2), so the
       * transform recenters it on (8, 8) to line up with the inner circle. */
      '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M8 1.6l.9 1.9 2-.6 1.4 1.4-.6 2 1.9.9v2l-1.9.9.6 2-1.4 1.4-2-.6-.9 1.9h-2l-.9-1.9-2 .6-1.4-1.4.6-2-1.9-.9v-2l1.9-.9-.6-2 1.4-1.4 2 .6.9-1.9z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" fill="none" transform="translate(8 8) scale(.92) translate(-7 -8.2)"/></svg>',
    close:
      '<svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>',
  };

  function build() {
    if (!document.documentElement) return;
    var host = document.createElement('flobro-toolbar');
    host.style.cssText = 'all:initial;position:fixed;top:0;left:0;right:0;z-index:2147483647;';
    var shadow = host.attachShadow({ mode: 'closed' });

    shadow.innerHTML =
      '<style>' +
      ':host{all:initial}' +
      '.bar{position:fixed;top:0;left:0;right:0;height:38px;display:flex;align-items:center;gap:2px;' +
      'padding:0 6px;box-sizing:border-box;background:rgba(22,30,38,.92);backdrop-filter:blur(10px);' +
      'font:12px/1 -apple-system,"Segoe UI",system-ui,sans-serif;color:#dfe9f2;' +
      'opacity:0;transform:translateY(-100%);transition:opacity .18s ease-out,transform .18s ease-out;pointer-events:none}' +
      '.bar.visible{opacity:1;transform:translateY(0);pointer-events:auto}' +
      /* The title + spacer pair and the urlbox are two faces of the same
       * flex:1 slot, so toggling them never moves the buttons around it. */
      '.mid{flex:1 1 auto;min-width:0;display:flex;align-items:center;align-self:stretch}' +
      '.title{flex:0 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
      'display:flex;align-items:center;gap:6px;padding:0 6px;border-radius:7px;height:28px;' +
      'color:#aebfcd;user-select:none;-webkit-user-select:none;cursor:grab}' +
      '.title:hover{background:rgba(255,255,255,.1)}' +
      '.title img{width:14px;height:14px;border-radius:3px}' +
      '.spacer{flex:1 1 auto;align-self:stretch;cursor:grab;min-width:24px}' +
      '.urlbox{display:none;flex:1 1 auto;min-width:0;height:26px;margin:0 2px;padding:0 10px;' +
      'border:1px solid rgba(255,255,255,.25);border-radius:7px;background:rgba(0,0,0,.35);' +
      'color:#eef5fb;font:12px -apple-system,"Segoe UI",system-ui,sans-serif;outline:none;' +
      'box-sizing:border-box;user-select:text;-webkit-user-select:text}' +
      '.urlbox:focus{border-color:#3fa9f5}' +
      '.bar.editing .urlbox{display:block}' +
      '.bar.editing .title,.bar.editing .spacer{display:none}' +
      'button{all:initial;cursor:pointer;width:28px;height:28px;border-radius:7px;display:inline-flex;' +
      'align-items:center;justify-content:center;color:#dfe9f2;flex:0 0 auto}' +
      'button:hover{background:rgba(255,255,255,.14)}' +
      'button.close:hover{background:#d64545;color:#fff}' +
      'button.pin.off{color:#7a8a98}' +
      'button.mn.open{background:rgba(255,255,255,.14)}' +
      'button svg{width:15px;height:15px;display:block}' +
      /* Chromium-style dropdown menu */
      /* The menu is a sibling of .bar, so it needs its own font: with
       * :host{all:initial} it would otherwise fall back to serif. */
      '.menu{position:fixed;top:40px;min-width:200px;padding:6px;border-radius:12px;display:none;' +
      'font:12px/1 -apple-system,"Segoe UI",system-ui,sans-serif;color:#dfe9f2;' +
      'background:rgba(30,39,48,.98);backdrop-filter:blur(14px);box-shadow:0 10px 34px rgba(0,0,0,.45);' +
      'border:1px solid rgba(255,255,255,.09)}' +
      '.menu.open{display:block}' +
      '.mi{display:flex;align-items:center;gap:10px;width:100%;height:32px;padding:0 10px;' +
      'border-radius:8px;box-sizing:border-box;cursor:pointer;color:#dfe9f2}' +
      '.mi:hover{background:rgba(255,255,255,.12)}' +
      '.mi svg{width:15px;height:15px;flex:0 0 auto}' +
      '.mi .lbl{flex:1 1 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.zrow{display:flex;align-items:center;gap:2px;height:32px;padding:0 4px}' +
      '.zrow .zlbl{flex:1 1 auto;text-align:center;color:#aebfcd;font-size:12px;' +
      'font-variant-numeric:tabular-nums}' +
      '.msep{border:0;border-top:1px solid rgba(255,255,255,.12);margin:6px 4px}' +
      '</style>' +
      buildBarHtml() +
      buildMenuHtml();

    var isMac = /mac/i.test(navigator.platform || '') || /mac os/i.test(navigator.userAgent || '');

    function buildBarHtml() {
      // macOS users expect window controls on the left (traffic-light side);
      // everyone else gets them on the right.
      var windowControlsLeft =
        '<button class="close" title="' +
        L.close +
        '">' +
        ICONS.close +
        '</button>' +
        '<button class="min" title="' +
        L.minimize +
        '">' +
        ICONS.minimize +
        '</button>';
      var windowControlsRight =
        '<button class="min" title="' +
        L.minimize +
        '">' +
        ICONS.minimize +
        '</button>' +
        '<button class="close" title="' +
        L.close +
        '">' +
        ICONS.close +
        '</button>';
      var actions =
        '<button class="rf" title="' +
        L.refresh +
        '">' +
        ICONS.refresh +
        '</button>' +
        '<button class="pin" title="' +
        L.pin +
        '">' +
        ICONS.pin +
        '</button>' +
        '<button class="mn" title="' +
        L.menu +
        '">' +
        ICONS.dots +
        '</button>';
      var mid =
        '<span class="mid">' +
        '<span class="title" title="' +
        (isNewTabPage ? L.dragOnly : L.drag) +
        '"><img alt="" hidden><span class="text"></span></span>' +
        '<span class="spacer"></span>' +
        '<input class="urlbox" type="text" spellcheck="false">' +
        '</span>';
      return (
        '<div class="bar" part="bar">' +
        (isMac ? windowControlsLeft + mid + actions : mid + actions + windowControlsRight) +
        '</div>'
      );
    }

    function buildMenuHtml() {
      return (
        '<div class="menu">' +
        '<div class="zrow">' +
        '<button class="zo" title="' +
        L.zoomOut +
        '">' +
        ICONS.zoomOut +
        '</button>' +
        '<span class="zlbl">100%</span>' +
        '<button class="zi" title="' +
        L.zoomIn +
        '">' +
        ICONS.zoomIn +
        '</button>' +
        '<button class="zr" title="' +
        L.zoomReset +
        '">' +
        ICONS.zoomReset +
        '</button>' +
        '</div>' +
        '<hr class="msep">' +
        '<div class="mi ar">' +
        ICONS.aspect +
        '<span class="lbl">' +
        L.aspect +
        '</span></div>' +
        '<div class="mi nw">' +
        ICONS.plus +
        '<span class="lbl">' +
        L.newWindow +
        '</span></div>' +
        '<hr class="msep">' +
        '<div class="mi cfg">' +
        ICONS.settings +
        '<span class="lbl">' +
        L.settings +
        '</span></div>' +
        '</div>'
      );
    }

    var bar = shadow.querySelector('.bar');
    var menu = shadow.querySelector('.menu');
    var $ = function (sel) {
      return shadow.querySelector(sel);
    };

    /* title + favicon */
    function refreshTitle() {
      $('.title .text').textContent = document.title || location.hostname;
      var link = document.querySelector('link[rel~="icon"]');
      var img = $('.title img');
      var href = link ? link.href : location.origin + '/favicon.ico';
      img.onerror = function () {
        img.hidden = true;
      };
      img.onload = function () {
        img.hidden = false;
      };
      img.src = href;
    }
    refreshTitle();
    new MutationObserver(refreshTitle).observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: false,
    });

    /* show / hide */
    function show() {
      clearTimeout(hideTimer);
      bar.classList.add('visible');
    }
    function scheduleHide() {
      /* never hide mid-edit or with the menu open */
      if (bar.classList.contains('editing') || menu.classList.contains('open')) return;
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function () {
        bar.classList.remove('visible');
      }, HIDE_DELAY);
    }
    document.addEventListener(
      'mousemove',
      function (e) {
        if (e.clientY <= HOT_ZONE) show();
        else if (bar.classList.contains('visible')) scheduleHide();
      },
      { passive: true },
    );
    document.addEventListener('mouseleave', scheduleHide, { passive: true });
    bar.addEventListener('mouseenter', show);
    bar.addEventListener('mouseleave', scheduleHide);

    /* dropdown menu */
    function closeMenu() {
      menu.classList.remove('open');
      $('.mn').classList.remove('open');
      scheduleHide();
    }
    function toggleMenu() {
      if (menu.classList.contains('open')) return closeMenu();
      var btn = $('.mn').getBoundingClientRect();
      /* right-align the panel with the menu button */
      menu.style.right = Math.max(6, window.innerWidth - btn.right) + 'px';
      menu.style.left = 'auto';
      menu.classList.add('open');
      $('.mn').classList.add('open');
      show();
    }
    $('.mn').addEventListener('click', function (e) {
      e.stopPropagation();
      toggleMenu();
    });
    document.addEventListener('click', function () {
      if (menu.classList.contains('open')) closeMenu();
    });
    menu.addEventListener('click', function (e) {
      e.stopPropagation();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('open')) closeMenu();
    });

    /* URL editing: double-click the title, Enter navigates, Esc cancels */
    var urlbox = $('.urlbox');
    function openUrlEdit() {
      bar.classList.add('editing');
      urlbox.value = location.href === 'about:blank' ? '' : location.href;
      urlbox.focus();
      urlbox.select();
    }
    function closeUrlEdit() {
      bar.classList.remove('editing');
      scheduleHide();
    }
    urlbox.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') return closeUrlEdit();
      if (e.key !== 'Enter') return;
      var v = urlbox.value.trim();
      if (!v) return closeUrlEdit();
      if (v.indexOf('://') === -1) v = 'https://' + v;
      /* Only http(s) may navigate, mirroring the Rust normalize_url;
       * javascript:, data: and other schemes must never run from here.
       * The editor stays open so the user can correct the input. */
      var url = null;
      try {
        url = new URL(v);
      } catch {
        /* not a URL */
      }
      if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) return;
      closeUrlEdit();
      if (url.href !== location.href) location.href = url.href;
    });
    urlbox.addEventListener('blur', closeUrlEdit);

    /* titlebar: press-and-move drags, double-click edits the URL */
    var press = null;
    function onPress(e) {
      if (e.button !== 0) return;
      press = { x: e.clientX, y: e.clientY };
    }
    function onMove(e) {
      if (!press) return;
      if (
        Math.abs(e.clientX - press.x) > DRAG_THRESHOLD ||
        Math.abs(e.clientY - press.y) > DRAG_THRESHOLD
      ) {
        press = null;
        startDrag();
      }
    }
    function onRelease() {
      press = null;
    }
    var title = $('.title');
    title.addEventListener('mousedown', onPress);
    title.addEventListener('mousemove', onMove);
    title.addEventListener('mouseup', onRelease);
    if (!isNewTabPage) title.addEventListener('dblclick', openUrlEdit);
    /* the empty spacer is a pure drag surface, like before */
    $('.spacer').addEventListener('mousedown', function (e) {
      if (e.button === 0) startDrag();
    });

    /* actions */
    function setZoom(z) {
      zoom = Math.min(5, Math.max(0.25, z));
      $('.zlbl').textContent = Math.round(zoom * 100) + '%';
      invoke('float_zoom', { factor: zoom });
    }
    /* The native View menu drives zoom through this hook, so the menu, the
     * toolbar buttons and the zoom label stay in sync. Delta 0 resets. */
    window.__FLOBRO_ZOOM_BY__ = function (delta) {
      setZoom(delta === 0 ? 1 : zoom + delta);
    };
    $('.zo').addEventListener('click', function () {
      setZoom(zoom - 0.1);
    });
    $('.zi').addEventListener('click', function () {
      setZoom(zoom + 0.1);
    });
    $('.zr').addEventListener('click', function () {
      setZoom(1);
    });
    $('.rf').addEventListener('click', function () {
      location.reload();
    });
    $('.ar').addEventListener('click', function () {
      closeMenu();
      invoke('float_aspect');
    });
    $('.pin').addEventListener('click', function () {
      pinned = !pinned;
      this.classList.toggle('off', !pinned);
      invoke('float_pin', { pinned: pinned });
    });
    $('.nw').addEventListener('click', function () {
      closeMenu();
      invoke('float_new');
    });
    $('.min').addEventListener('click', function () {
      invoke('float_minimize');
    });
    $('.cfg').addEventListener('click', function () {
      closeMenu();
      invoke('open_settings');
    });
    $('.close').addEventListener('click', function () {
      invoke('float_close');
    });

    document.documentElement.appendChild(host);

    /* Some single-page apps (YouTube, and typical local dev servers with
     * hot-reload) wholesale-replace document.documentElement's children on
     * route changes or reloads-in-place, which silently detaches the
     * toolbar host with nothing to bring it back. Since float windows have
     * no OS titlebar, losing the host also means losing the only way to
     * drag or close the window. Watch for that and re-attach immediately
     * rather than only guarding against double-injection. */
    new MutationObserver(function () {
      if (!host.isConnected && document.documentElement) {
        document.documentElement.appendChild(host);
      }
    }).observe(document.documentElement, { childList: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
