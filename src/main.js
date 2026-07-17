/* global window, document */
'use strict';

const { invoke } = window.__TAURI__.core;
const appWindow = window.__TAURI__.window.getCurrentWindow();

const $ = (sel) => document.querySelector(sel);
window.FLOBRO_I18N.apply();

async function refreshRecent() {
  const settings = await invoke('get_settings');
  const box = $('#recent');
  const label = $('#recent-label');
  box.innerHTML = '';
  const isEmpty = !settings.recent || settings.recent.length === 0;
  box.hidden = isEmpty;
  label.hidden = isEmpty;
  if (isEmpty) return;
  for (const url of settings.recent) {
    const btn = document.createElement('button');
    const img = document.createElement('img');
    let host = url;
    try {
      host = new URL(url).hostname;
    } catch (_) {
      /* keep raw */
    }
    img.src = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(host) + '&sz=32';
    img.alt = '';
    btn.appendChild(img);
    btn.appendChild(document.createTextNode(url.replace(/^https?:\/\//, '')));
    btn.title = url;
    btn.addEventListener('click', () => floatUrl(url));
    box.appendChild(btn);
  }
}

async function floatUrl(url) {
  try {
    await invoke('open_float', { url });
    refreshRecent();
  } catch (err) {
    const input = $('#url');
    input.setCustomValidity(String(err));
    input.reportValidity();
    setTimeout(() => input.setCustomValidity(''), 2500);
  }
}

async function setVersion() {
  const version = await window.__TAURI__.app.getVersion();
  console.log('version', version);
  $('.appVersion').textContent = version;
}

$('#form').addEventListener('submit', (e) => {
  e.preventDefault();
  const url = $('#url').value.trim();
  if (url) floatUrl(url);
});

$('#settings').addEventListener('click', () => invoke('open_settings'));
$('#min').addEventListener('click', () => appWindow.minimize());
$('#close').addEventListener('click', () => appWindow.close());

/* ------------------------ release notes rendering ----------------------- */

/* Tiny Markdown renderer for GitHub release bodies: headings, lists, bold,
 * italic, inline code and links. Input is escaped first, so note content can
 * never inject markup. Enough for changelog-style notes; not a full parser. */
function renderMarkdown(md) {
  const esc = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const inline = (s) =>
    s
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
        '<a href="#" data-url="$2" rel="noopener">$1</a>',
      );

  const out = [];
  let list = false;
  for (const raw of md.split(/\r?\n/)) {
    const line = esc(raw.trim());
    const li = line.match(/^[-*] (.*)$/);
    if (li) {
      if (!list) {
        out.push('<ul>');
        list = true;
      }
      out.push(`<li>${inline(li[1])}</li>`);
      continue;
    }
    if (list) {
      out.push('</ul>');
      list = false;
    }
    const h = line.match(/^(#{1,6}) (.*)$/);
    if (h) {
      const level = Math.min(h[1].length + 1, 6); /* demote: modal title is the h1 */
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
    } else if (line) {
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  if (list) out.push('</ul>');
  return out.join('');
}

function showNotesModal(title, notesMarkdown, withSupport) {
  const modal = $('#notes-modal');
  $('#notes-title').textContent = title;
  $('#notes-body').innerHTML = renderMarkdown(notesMarkdown || '');
  $('#notes-support').hidden = !withSupport;
  modal.hidden = false;

  /* links open in the system browser, never inside the launcher */
  $('#notes-body')
    .querySelectorAll('a[data-url]')
    .forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        window.__TAURI__.opener.openUrl(a.dataset.url);
      });
    });
}

function closeNotesModal() {
  $('#notes-modal').hidden = true;
  /* never re-celebrate an update after the modal was dismissed */
  try {
    localStorage.removeItem('flobro-pending-update');
  } catch {
    /* storage unavailable */
  }
}

$('#notes-close').addEventListener('click', closeNotesModal);
$('#notes-modal').addEventListener('click', (e) => {
  if (e.target === $('#notes-modal')) closeNotesModal();
});
$('#notes-gh').addEventListener('click', () =>
  window.__TAURI__.opener.openUrl('https://github.com/sponsors/cornips'),
);
$('#notes-mollie').addEventListener('click', () =>
  window.__TAURI__.opener.openUrl('https://payment-links.mollie.com/payment/cnRzN8hBxK5zk5CwmD6rk'),
);

/* --------------------------------- updates ------------------------------ */

const PENDING_UPDATE_KEY = 'flobro-pending-update';

/* Update check: silent on launch, banner only when something is available.
 * Nothing downloads until the user clicks "Update now". */
async function checkForUpdate() {
  let info;
  try {
    info = await invoke('check_update');
  } catch {
    return; /* offline or updater not configured: stay quiet */
  }
  if (!info) return;

  const banner = $('#update-banner');
  const detail = $('#update-detail');
  const t = window.FLOBRO_I18N.t;
  detail.textContent = t('update_detail').replace('{version}', info.version);
  banner.hidden = false;

  $('#update-changes').addEventListener('click', () => {
    showNotesModal(`Flobro ${info.version}`, info.notes, false);
  });
  $('#update-later').addEventListener('click', () => {
    banner.hidden = true;
  });
  $('#update-now').addEventListener('click', async () => {
    banner.dataset.busy = '1';
    detail.textContent = t('update_installing');
    /* remember the notes so the relaunched version can celebrate the update */
    try {
      localStorage.setItem(
        PENDING_UPDATE_KEY,
        JSON.stringify({ version: info.version, notes: info.notes }),
      );
    } catch {
      /* storage unavailable: skip the post-update popup */
    }
    try {
      await invoke('install_update'); /* installs, then relaunches */
    } catch (err) {
      /* leave the banner up so the user can retry or download manually */
      banner.dataset.busy = '';
      detail.textContent = String(err);
      localStorage.removeItem(PENDING_UPDATE_KEY);
    }
  });
}

/* After a successful auto-update the stored version matches the running one:
 * show the notes once, with a small, friendly support nudge. */
async function celebrateUpdateIfAny() {
  let pending;
  try {
    pending = JSON.parse(localStorage.getItem(PENDING_UPDATE_KEY) || 'null');
  } catch {
    pending = null;
  }
  if (!pending) return;
  const current = await window.__TAURI__.app.getVersion();
  if (pending.version === current) {
    const t = window.FLOBRO_I18N.t;
    showNotesModal(t('updated_title').replace('{version}', current), pending.notes, true);
  }
  localStorage.removeItem(PENDING_UPDATE_KEY);
}

setVersion();

refreshRecent();

celebrateUpdateIfAny();

checkForUpdate();
