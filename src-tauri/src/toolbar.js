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
  var zoom = 1;
  var pinned = true;
  var hideTimer = null;

  var I18N = {
    en: {
      zoomOut: 'Zoom out',
      zoomIn: 'Zoom in',
      zoomReset: 'Reset zoom',
      aspect: 'Snap to 16:9',
      pin: 'Toggle stay-on-top',
      minimize: 'Minimize',
      settings: 'Settings',
      close: 'Close',
      drag: 'Drag to move',
    },
    nl: {
      zoomOut: 'Uitzoomen',
      zoomIn: 'Inzoomen',
      zoomReset: 'Zoom herstellen',
      aspect: 'Naar 16:9',
      pin: 'Bovenaan blijven aan/uit',
      minimize: 'Minimaliseren',
      settings: 'Instellingen',
      close: 'Sluiten',
      drag: 'Sleep om te verplaatsen',
    },
  };
  var L = (navigator.language || 'en').toLowerCase().indexOf('nl') === 0 ? I18N.nl : I18N.en;

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
    aspect:
      '<svg viewBox="0 0 16 16"><rect x="2" y="4" width="12" height="8" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>',
    pin: '<svg viewBox="0 0 16 16"><path d="M9.5 2.5l4 4-2.2.6-2.6 2.6.3 3.3-2-2L4 14l-1-1 3-3-2-2 3.3.3L9 5.7l-.6-2.2z" fill="currentColor" stroke="none"/></svg>',
    minimize:
      '<svg viewBox="0 0 16 16"><path d="M3 12h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>',
    settings:
      '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="2.2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M12.4 3.6L11 5M5 11l-1.4 1.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
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
      '.title{flex:0 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
      'display:flex;align-items:center;gap:6px;padding:0' +
      ' 6px;color:#aebfcd;user-select:none;-webkit-user-select:none}' +
      '.title img{width:14px;height:14px;border-radius:3px}' +
      '.drag{flex:1 1 auto;align-self:stretch;cursor:grab;min-width:24px}' +
      'button{all:initial;cursor:pointer;width:28px;height:28px;border-radius:7px;display:inline-flex;' +
      'align-items:center;justify-content:center;color:#dfe9f2}' +
      'button:hover{background:rgba(255,255,255,.14)}' +
      'button.close:hover{background:#d64545;color:#fff}' +
      'button.pin.off{color:#7a8a98}' +
      'button svg{width:15px;height:15px;display:block}' +
      '.zoomlabel{min-width:34px;text-align:center;color:#aebfcd;font-size:11px}' +
      '</style>' +
      buildBarHtml();

    function buildBarHtml() {
      // macOS users expect window controls on the left (traffic-light side);
      // everyone else gets them on the right.
      var isMac =
        /mac/i.test(navigator.platform || '') || /mac os/i.test(navigator.userAgent || '');
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
        '<button class="zo" title="' +
        L.zoomOut +
        '">' +
        ICONS.zoomOut +
        '</button>' +
        '<span class="zoomlabel">100%</span>' +
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
        '<button class="ar" title="' +
        L.aspect +
        '">' +
        ICONS.aspect +
        '</button>' +
        '<button class="pin" title="' +
        L.pin +
        '">' +
        ICONS.pin +
        '</button>' +
        '<button class="cfg" title="' +
        L.settings +
        '">' +
        ICONS.settings +
        '</button>';
      var title =
        '<span class="title drag"><img alt="" hidden><span' + ' class="text"></span></span>';
      var drag = '<div class="drag" title="' + L.drag + '"></div>';
      return (
        '<div class="bar" part="bar">' +
        (isMac
          ? windowControlsLeft + title + drag + actions
          : title + drag + actions + windowControlsRight) +
        '</div>'
      );
    }

    var bar = shadow.querySelector('.bar');
    var $ = function (sel) {
      return shadow.querySelector(sel);
    };
    var $$ = function (sel) {
      return shadow.querySelectorAll(sel);
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

    /* actions */
    function setZoom(z) {
      zoom = Math.min(5, Math.max(0.25, z));
      $('.zoomlabel').textContent = Math.round(zoom * 100) + '%';
      invoke('float_zoom', { factor: zoom });
    }
    $('.zo').addEventListener('click', function () {
      setZoom(zoom - 0.1);
    });
    $('.zi').addEventListener('click', function () {
      setZoom(zoom + 0.1);
    });
    $('.zr').addEventListener('click', function () {
      setZoom(1);
    });
    $('.ar').addEventListener('click', function () {
      invoke('float_aspect');
    });
    $('.pin').addEventListener('click', function () {
      pinned = !pinned;
      this.classList.toggle('off', !pinned);
      invoke('float_pin', { pinned: pinned });
    });
    $('.min').addEventListener('click', function () {
      invoke('float_minimize');
    });
    $('.cfg').addEventListener('click', function () {
      invoke('open_settings');
    });
    $('.close').addEventListener('click', function () {
      invoke('float_close');
    });

    /* drag to move */
    $$('.drag').forEach((dragger) => {
      dragger.addEventListener('mousedown', function (e) {
        if (e.button === 0) startDrag();
      });
    });

    document.documentElement.appendChild(host);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
