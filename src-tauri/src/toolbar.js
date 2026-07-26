/**
 * Flobro hover toolbar — injected into every floating window; hidden until
 * the mouse reaches the top edge.
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
    /* Remote pages may lack the __TAURI__ bundle; fall back to the
     * internals object when IPC is enabled. Failures are logged so a
     * misconfigured capability is visible, not a silently dead button. */
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

  /* Some pages (Twitch - see #8) capture keydown and stopPropagation(),
   * eating keystrokes meant for the URL editor. Registering our own
   * capturing listener here, before build(), guarantees it runs first. */
  var urlEditing = false;
  var urlEditRefs = null; // { close, commit } - populated by build()

  /* Cmd+W on macOS, Ctrl+W elsewhere: the platform's key convention, not
   * its layout. A float window has no titlebar to close from, and Windows
   * has no menu bar to hang an accelerator on, so the shortcut lives here.
   * On macOS the menu item usually claims the key before the page sees it;
   * this stays as the path for every other platform. */
  var closeModifier = /mac/i.test(navigator.platform || navigator.userAgent || '')
    ? 'metaKey'
    : 'ctrlKey';

  function isCloseShortcut(e) {
    return e[closeModifier] && !e.altKey && !e.shiftKey && (e.key === 'w' || e.key === 'W');
  }

  document.addEventListener(
    'keydown',
    function (e) {
      /* Ahead of the URL-editor shield below: the window has to be
       * closable even while the address bar is open. */
      if (isCloseShortcut(e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        invoke('float_close');
        return;
      }
      if (!urlEditing || !urlEditRefs) return;
      e.stopImmediatePropagation();
      if (e.key === 'Escape') return urlEditRefs.close();
      if (e.key === 'Enter') return urlEditRefs.commit();
    },
    true,
  );

  /* Tauri webviews ignore target="_blank" and window.open(); route both to
   * a new float window (covers OAuth popups too). Patched here, outside
   * build(), so it runs before the page can cache its own window.open. */
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

  /* The toolbar is built with DOM calls, never from an HTML string: pages
   * that send `require-trusted-types-for 'script'` (YouTube does) make every
   * HTML-string sink throw - innerHTML, insertAdjacentHTML and DOMParser
   * alike - which used to abort build() before the host was ever appended,
   * leaving the window with no titlebar at all. So the icons are shape data
   * instead of markup. Everything is stroked in the current colour unless
   * the shape says otherwise. */
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var SHAPE_DEFAULTS = { fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round' };

  var ICONS = {
    zoomOut: [['path', { d: 'M3 8h10', 'stroke-width': '1.8' }]],
    zoomIn: [['path', { d: 'M3 8h10M8 3v10', 'stroke-width': '1.8' }]],
    zoomReset: [
      ['circle', { cx: '8', cy: '8', r: '5.2', 'stroke-width': '1.6' }],
      ['circle', { cx: '8', cy: '8', r: '1.6', fill: 'currentColor', stroke: 'none' }],
    ],
    refresh: [
      ['path', { d: 'M13 8a5 5 0 1 1-1.5-3.6', 'stroke-width': '1.7' }],
      ['path', { d: 'M13 1.8v3h-3', 'stroke-width': '1.7', 'stroke-linejoin': 'round' }],
    ],
    aspect: [
      ['rect', { x: '2', y: '4', width: '12', height: '8', rx: '1.5', 'stroke-width': '1.6' }],
    ],
    pin: [
      [
        'path',
        {
          d: 'M9.5 2.5l4 4-2.2.6-2.6 2.6.3 3.3-2-2L4 14l-1-1 3-3-2-2 3.3.3L9 5.7l-.6-2.2z',
          fill: 'currentColor',
          stroke: 'none',
          transform: 'translate(-.7 -.6)',
        },
      ],
    ],
    plus: [['path', { d: 'M8 3v10M3 8h10', 'stroke-width': '1.8' }]],
    dots: [
      ['circle', { cx: '8', cy: '3.2', r: '1.5', fill: 'currentColor', stroke: 'none' }],
      ['circle', { cx: '8', cy: '8', r: '1.5', fill: 'currentColor', stroke: 'none' }],
      ['circle', { cx: '8', cy: '12.8', r: '1.5', fill: 'currentColor', stroke: 'none' }],
    ],
    minimize: [['path', { d: 'M3 12h10', 'stroke-width': '1.8' }]],
    settings: [
      ['circle', { cx: '8', cy: '8', r: '2', 'stroke-width': '1.5' }],
      [
        'path',
        {
          d: 'M8 1.6l.9 1.9 2-.6 1.4 1.4-.6 2 1.9.9v2l-1.9.9.6 2-1.4 1.4-2-.6-.9 1.9h-2l-.9-1.9-2 .6-1.4-1.4.6-2-1.9-.9v-2l1.9-.9-.6-2 1.4-1.4 2 .6.9-1.9z',
          'stroke-width': '1.3',
          'stroke-linejoin': 'round',
          /* The gear path's own bounding box is centered on (7, 8.2), so
           * the transform recenters it on (8, 8) to line up with the
           * inner circle. */
          transform: 'translate(8 8) scale(.92) translate(-7 -8.2)',
        },
      ],
    ],
    close: [['path', { d: 'M4 4l8 8M12 4l-8 8', 'stroke-width': '1.8' }]],
  };

  function setAttrs(node, attrs) {
    for (var key in attrs) node.setAttribute(key, attrs[key]);
  }

  function icon(name) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    var shapes = ICONS[name];
    for (var i = 0; i < shapes.length; i++) {
      var node = document.createElementNS(SVG_NS, shapes[i][0]);
      setAttrs(node, SHAPE_DEFAULTS);
      setAttrs(node, shapes[i][1]);
      svg.appendChild(node);
    }
    return svg;
  }

  /* h('span', { class: 'lbl' }, ['text', node]) */
  function h(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) setAttrs(node, attrs);
    for (var i = 0; children && i < children.length; i++) {
      var child = children[i];
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  function button(cls, label, iconName) {
    return h('button', { class: cls, title: label }, [icon(iconName)]);
  }

  function menuItem(cls, label, iconName) {
    return h('div', { class: 'mi ' + cls }, [icon(iconName), h('span', { class: 'lbl' }, [label])]);
  }

  var CSS =
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
    '.msep{border:0;border-top:1px solid rgba(255,255,255,.12);margin:6px 4px}';

  function build() {
    if (!document.documentElement) return;
    var host = document.createElement('flobro-toolbar');
    host.style.cssText = 'all:initial;position:fixed;top:0;left:0;right:0;z-index:2147483647;';
    var shadow = host.attachShadow({ mode: 'closed' });

    var style = document.createElement('style');
    style.textContent = CSS;
    shadow.appendChild(style);

    /* One layout everywhere: the window controls sit on the right of the
     * actions, on macOS too. The toolbar is not an OS titlebar, so matching
     * the platform's traffic-light side buys nothing and splits the code. */
    var mid = h('span', { class: 'mid' }, [
      h('span', { class: 'title', title: isNewTabPage ? L.dragOnly : L.drag }, [
        h('img', { alt: '', hidden: '' }),
        h('span', { class: 'text' }),
      ]),
      h('span', { class: 'spacer' }),
      h('input', { class: 'urlbox', type: 'text', spellcheck: 'false' }),
    ]);
    var actions = [
      button('rf', L.refresh, 'refresh'),
      button('pin', L.pin, 'pin'),
      button('mn', L.menu, 'dots'),
      button('min', L.minimize, 'minimize'),
      button('close', L.close, 'close'),
    ];
    var bar = h('div', { class: 'bar', part: 'bar' }, [mid].concat(actions));

    var menu = h('div', { class: 'menu' }, [
      h('div', { class: 'zrow' }, [
        button('zo', L.zoomOut, 'zoomOut'),
        h('span', { class: 'zlbl' }, ['100%']),
        button('zi', L.zoomIn, 'zoomIn'),
        button('zr', L.zoomReset, 'zoomReset'),
      ]),
      h('hr', { class: 'msep' }),
      menuItem('ar', L.aspect, 'aspect'),
      menuItem('nw', L.newWindow, 'plus'),
      h('hr', { class: 'msep' }),
      menuItem('cfg', L.settings, 'settings'),
    ]);

    shadow.appendChild(bar);
    shadow.appendChild(menu);

    var $ = function (sel) {
      return shadow.querySelector(sel);
    };

    /* title + favicon */
    function refreshTitle() {
      $('.title .text').textContent = document.title || location.hostname;
      var link = document.querySelector('link[rel~="icon"]');
      var img = $('.title img');
      var href = link ? link.href : location.origin + '/favicon.ico';
      if (img.src === href) return;
      img.onerror = function () {
        img.hidden = true;
      };
      img.onload = function () {
        img.hidden = false;
      };
      img.src = href;
    }
    refreshTitle();
    /* Watch the head only. Both the title and the favicon live there, while
     * a subtree observer on documentElement wakes up for every DOM change
     * the page makes - on YouTube that is thousands per minute. */
    if (document.head) {
      new MutationObserver(refreshTitle).observe(document.head, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

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

    /* URL editing: double-click the title, Enter navigates, Esc cancels.
     * Escape/Enter handling lives in the capturing keydown listener
     * registered above, which also shields keystrokes from page scripts. */
    var urlbox = $('.urlbox');
    function openUrlEdit() {
      bar.classList.add('editing');
      urlbox.value = location.href === 'about:blank' ? '' : location.href;
      urlbox.focus();
      urlbox.select();
      urlEditing = true;
    }
    function closeUrlEdit() {
      bar.classList.remove('editing');
      urlEditing = false;
      scheduleHide();
    }
    function commitUrlEdit() {
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
    }
    urlEditRefs = { close: closeUrlEdit, commit: commitUrlEdit };
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
