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
      zoom: 'Zoom',
      zoomOut: 'Zoom out',
      zoomIn: 'Zoom in',
      zoomReset: 'Reset zoom',
      refresh: 'Refresh',
      aspect: 'Snap to 16:9',
      pin: 'Toggle stay-on-top',
      newWindow: 'New float window',
      minimize: 'Minimize',
      settings: 'Settings',
      close: 'Close',
      drag: 'Drag to move',
      editUrl: 'Click to change the URL',
    },
    nl: {
      zoom: 'Zoom',
      zoomOut: 'Uitzoomen',
      zoomIn: 'Inzoomen',
      zoomReset: 'Zoom herstellen',
      refresh: 'Vernieuwen',
      aspect: 'Naar 16:9',
      pin: 'Bovenaan blijven aan/uit',
      newWindow: 'Nieuw zwevend venster',
      minimize: 'Minimaliseren',
      settings: 'Instellingen',
      close: 'Sluiten',
      drag: 'Sleep om te verplaatsen',
      editUrl: 'Klik om de URL te wijzigen',
    },
  };
  // The app replaces __FLOBRO_LANG__ with the language from settings; if the
  // token survives (dev builds), fall back to the system language.
  var langPref = '__FLOBRO_LANG__';
  if (langPref.indexOf('__') === 0 || !I18N[langPref]) {
    langPref = (navigator.language || 'en').toLowerCase().indexOf('nl') === 0 ? 'nl' : 'en';
  }
  var L = I18N[langPref];

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
    zoom: '<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.4" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M10.4 10.4L14 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
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
    pin: '<svg viewBox="0 0 16 16"><path d="M9.5 2.5l4 4-2.2.6-2.6 2.6.3 3.3-2-2L4 14l-1-1 3-3-2-2 3.3.3L9 5.7l-.6-2.2z" fill="currentColor" stroke="none"/></svg>',
    plus: '<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>',
    minimize:
      '<svg viewBox="0 0 16 16"><path d="M3 12h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>',
    settings:
      '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M8 1.6l.9 1.9 2-.6 1.4 1.4-.6 2 1.9.9v2l-1.9.9.6 2-1.4 1.4-2-.6-.9 1.9h-2l-.9-1.9-2 .6-1.4-1.4.6-2-1.9-.9v-2l1.9-.9-.6-2 1.4-1.4 2 .6.9-1.9z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" fill="none" transform="scale(.92) translate(.7 .7)"/></svg>',
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
      'display:flex;align-items:center;gap:6px;padding:0 6px;border-radius:7px;' +
      'color:#aebfcd;user-select:none;-webkit-user-select:none;cursor:text;height:28px}' +
      '.title:hover{background:rgba(255,255,255,.1)}' +
      '.title img{width:14px;height:14px;border-radius:3px}' +
      '.urlbox{display:none;flex:1 1 auto;min-width:0;height:26px;margin:0 6px;padding:0 10px;' +
      'border:1px solid rgba(255,255,255,.25);border-radius:7px;background:rgba(0,0,0,.35);' +
      'color:#eef5fb;font:12px -apple-system,"Segoe UI",system-ui,sans-serif;outline:none;' +
      'user-select:text;-webkit-user-select:text}' +
      '.urlbox:focus{border-color:#3fa9f5}' +
      '.bar.editing .urlbox{display:block}' +
      '.bar.editing .title,.bar.editing .drag,.bar.editing .zoomwrap{display:none}' +
      '.drag{flex:1 1 auto;align-self:stretch;cursor:grab;min-width:24px}' +
      'button{all:initial;cursor:pointer;width:28px;height:28px;border-radius:7px;display:inline-flex;' +
      'align-items:center;justify-content:center;color:#dfe9f2}' +
      'button:hover{background:rgba(255,255,255,.14)}' +
      'button.close:hover{background:#d64545;color:#fff}' +
      'button.pin.off{color:#7a8a98}' +
      'button.zm.open{background:rgba(255,255,255,.14)}' +
      'button svg{width:15px;height:15px;display:block}' +
      '.zoomwrap{display:none;align-items:center;gap:2px;padding:0 2px;border-radius:8px;' +
      'background:rgba(255,255,255,.08)}' +
      '.zoomwrap.open{display:inline-flex}' +
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
      var zoomwrap =
        '<span class="zoomwrap">' +
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
        '</span>';
      var actions =
        '<button class="rf" title="' +
        L.refresh +
        '">' +
        ICONS.refresh +
        '</button>' +
        '<button class="zm" title="' +
        L.zoom +
        '">' +
        ICONS.zoom +
        '</button>' +
        zoomwrap +
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
        '<button class="nw" title="' +
        L.newWindow +
        '">' +
        ICONS.plus +
        '</button>' +
        '<button class="cfg" title="' +
        L.settings +
        '">' +
        ICONS.settings +
        '</button>';
      var title =
        '<span class="title" title="' +
        L.editUrl +
        '"><img alt="" hidden><span class="text"></span></span>';
      var urlbox = '<input class="urlbox" type="text" spellcheck="false">';
      var drag = '<div class="drag" title="' + L.drag + '"></div>';
      return (
        '<div class="bar" part="bar">' +
        (isMac
          ? windowControlsLeft + title + urlbox + drag + actions
          : title + urlbox + drag + actions + windowControlsRight) +
        '</div>'
      );
    }

    var bar = shadow.querySelector('.bar');
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
      /* never hide mid-edit; losing a half-typed URL is infuriating */
      if (bar.classList.contains('editing')) return;
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

    /* URL editing: click the title, type, Enter navigates, Esc cancels */
    var urlbox = $('.urlbox');
    function openUrlEdit() {
      bar.classList.add('editing');
      urlbox.value = location.href;
      urlbox.focus();
      urlbox.select();
    }
    function closeUrlEdit() {
      bar.classList.remove('editing');
      scheduleHide();
    }
    $('.title').addEventListener('click', openUrlEdit);
    urlbox.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') return closeUrlEdit();
      if (e.key !== 'Enter') return;
      var v = urlbox.value.trim();
      if (!v) return closeUrlEdit();
      if (v.indexOf('://') === -1) v = 'https://' + v;
      closeUrlEdit();
      if (v !== location.href) location.href = v;
    });
    urlbox.addEventListener('blur', closeUrlEdit);

    /* actions */
    function setZoom(z) {
      zoom = Math.min(5, Math.max(0.25, z));
      $('.zoomlabel').textContent = Math.round(zoom * 100) + '%';
      invoke('float_zoom', { factor: zoom });
    }
    $('.zm').addEventListener('click', function () {
      this.classList.toggle('open');
      $('.zoomwrap').classList.toggle('open');
    });
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
      invoke('float_aspect');
    });
    $('.pin').addEventListener('click', function () {
      pinned = !pinned;
      this.classList.toggle('off', !pinned);
      invoke('float_pin', { pinned: pinned });
    });
    $('.nw').addEventListener('click', function () {
      invoke('show_launcher');
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
    $('.drag').addEventListener('mousedown', function (e) {
      if (e.button === 0) startDrag();
    });

    document.documentElement.appendChild(host);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
