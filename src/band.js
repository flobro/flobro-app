/* global window, document */
'use strict';

/**
 * The toolbar, as its own webview above the page (spike for #1).
 *
 * Everything here used to live inside the page. What changed:
 * - the page cannot see, style or block any of it
 * - nothing it draws can cover the site, because the site starts below it
 * - it cannot read the page either, so title, favicon and URL arrive as an
 *   event from Rust, and reload and navigation go back out as commands
 */
const { invoke } = window.__TAURI__.core;
const appWindow = window.__TAURI__.window.getCurrentWindow();
const { listen } = window.__TAURI__.event;

const $ = (sel) => document.querySelector(sel);

const I18N = {
  en: {
    refresh: 'Refresh',
    zoomOut: 'Zoom out',
    zoomIn: 'Zoom in',
    aspect: 'Snap to 16:9',
    pin: 'Toggle stay-on-top',
    newWindow: 'New window',
    settings: 'Settings',
    minimize: 'Minimize',
    close: 'Close',
    drag: 'Drag to move, double-click to edit the URL',
  },
  nl: {
    refresh: 'Vernieuwen',
    zoomOut: 'Uitzoomen',
    zoomIn: 'Inzoomen',
    aspect: 'Naar 16:9',
    pin: 'Bovenaan blijven aan/uit',
    newWindow: 'Nieuw venster',
    settings: 'Instellingen',
    minimize: 'Minimaliseren',
    close: 'Sluiten',
    drag: 'Sleep om te verplaatsen, dubbelklik om de URL te wijzigen',
  },
};
const L = I18N[(navigator.language || 'en').toLowerCase().startsWith('nl') ? 'nl' : 'en'];

for (const [id, label] of [
  ['#refresh', L.refresh],
  ['#zoom-out', L.zoomOut],
  ['#zoom-in', L.zoomIn],
  ['#aspect', L.aspect],
  ['#pin', L.pin],
  ['#new-window', L.newWindow],
  ['#settings', L.settings],
  ['#minimize', L.minimize],
  ['#close', L.close],
]) {
  $(id).title = label;
}
$('#title').title = L.drag;

/* ------------------------------ page state ------------------------------ */

let pageUrl = '';

listen('flobro-page-meta', (event) => {
  const meta = event.payload || {};
  pageUrl = meta.url || '';
  $('#title-text').textContent = meta.title || '';
  const favicon = $('#favicon');
  if (meta.icon && favicon.src !== meta.icon) {
    favicon.onload = () => {
      favicon.hidden = false;
    };
    favicon.onerror = () => {
      favicon.hidden = true;
    };
    favicon.src = meta.icon;
  }
});

/* -------------------------------- actions ------------------------------- */

let zoom = 1;
let pinned = true;

const setZoom = (factor) => {
  zoom = Math.min(5, Math.max(0.25, factor));
  invoke('float_zoom', { factor: zoom });
};

/* The native View menu drives zoom through this hook, so the menu and the
 * band agree on the current factor. */
window.__FLOBRO_ZOOM_BY__ = (delta) => setZoom(delta === 0 ? 1 : zoom + delta);

$('#refresh').addEventListener('click', () => invoke('float_reload'));
$('#zoom-out').addEventListener('click', () => setZoom(zoom - 0.1));
$('#zoom-in').addEventListener('click', () => setZoom(zoom + 0.1));
$('#aspect').addEventListener('click', () => invoke('float_aspect'));
$('#new-window').addEventListener('click', () => invoke('float_new'));
$('#settings').addEventListener('click', () => invoke('open_settings'));
$('#minimize').addEventListener('click', () => invoke('float_minimize'));
$('#close').addEventListener('click', () => invoke('float_close'));
$('#pin').addEventListener('click', (e) => {
  pinned = !pinned;
  e.currentTarget.classList.toggle('off', !pinned);
  invoke('float_pin', { pinned });
});

/* --------------------------- drag and the URL --------------------------- */

for (const sel of ['#title', '#spacer']) {
  $(sel).addEventListener('mousedown', (e) => {
    if (e.button === 0) appWindow.startDragging();
  });
}

const urlbox = $('#urlbox');

function openUrlEdit() {
  document.body.classList.add('editing');
  urlbox.value = pageUrl;
  urlbox.focus();
  urlbox.select();
}

function closeUrlEdit() {
  document.body.classList.remove('editing');
}

$('#title').addEventListener('dblclick', openUrlEdit);
urlbox.addEventListener('blur', closeUrlEdit);
urlbox.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') return closeUrlEdit();
  if (e.key !== 'Enter') return;
  const value = urlbox.value.trim();
  closeUrlEdit();
  /* Rust re-checks the scheme, the same http(s)-only rule the in-page
   * editor enforced for itself. */
  if (value) invoke('float_navigate', { url: value });
});
