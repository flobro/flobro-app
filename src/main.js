/* global window, document */
'use strict';

const { invoke } = window.__TAURI__.core;
const appWindow = window.__TAURI__.window.getCurrentWindow();

const $ = (sel) => document.querySelector(sel);
window.FLOBRO_I18N.apply();

/* Report uncaught launcher errors anonymously; the opt-out lives in Rust.
 * Visited websites run in float windows and are never touched by this. */
let errorsReported = 0;
function reportError(message) {
  if (errorsReported >= 5) return; /* never flood on an error loop */
  errorsReported++;
  invoke('report_error', { context: 'launcher', message: String(message).slice(0, 300) }).catch(
    () => {},
  );
}
window.addEventListener('error', (e) => reportError(e.message || e.error));
window.addEventListener('unhandledrejection', (e) => reportError(e.reason));

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
$('#feedback').addEventListener('click', () =>
  window.__TAURI__.opener.openUrl('https://github.com/flobro/flobro-app/issues'),
);
/* the version label doubles as a changelog link (the native About panel
 * on macOS cannot show one) */
$('#version').addEventListener('click', async () => {
  const version = await window.__TAURI__.app.getVersion();
  window.__TAURI__.opener.openUrl(`https://github.com/flobro/flobro-app/releases/tag/v${version}`);
});
$('#clear-recent').addEventListener('click', async () => {
  const settings = await invoke('get_settings');
  settings.recent = [];
  await invoke('save_settings', { settings });
  refreshRecent();
});

/* settings window broadcasts language changes; re-render texts live */
window.__TAURI__.event.listen('flobro-language', (e) => {
  window.FLOBRO_I18N.setLang(e.payload);
});
/* macOS menu: onboarding replay */
window.__TAURI__.event.listen('flobro-show-onboarding', () => startOnboarding(true));
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

/* --------------------------------- updates ------------------------------ */

const PENDING_UPDATE_KEY = 'flobro-pending-update';

/* Update check: silent on launch, banner only when something is available.
 * Nothing downloads until the user clicks "Update now". Manual checks
 * (macOS menu > Check for Updates) are handled in Rust with a native dialog. */
let updateBound = false;
let updateInfo = null;

function bindUpdateBanner() {
  if (updateBound) return;
  updateBound = true;
  const banner = $('#update-banner');
  const detail = $('#update-detail');
  const t = window.FLOBRO_I18N.t;
  $('#update-changes').addEventListener('click', () => {
    if (updateInfo) showNotesModal(`Flobro ${updateInfo.version}`, updateInfo.notes, false);
  });
  $('#update-later').addEventListener('click', () => {
    banner.hidden = true;
  });
  $('#update-now').addEventListener('click', async () => {
    if (!updateInfo) return;
    banner.dataset.busy = '1';
    detail.textContent = t('update_installing');
    /* remember the notes so the relaunched version can celebrate the update */
    try {
      localStorage.setItem(
        PENDING_UPDATE_KEY,
        JSON.stringify({ version: updateInfo.version, notes: updateInfo.notes }),
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

async function checkForUpdate() {
  bindUpdateBanner();
  const banner = $('#update-banner');
  const detail = $('#update-detail');
  const t = window.FLOBRO_I18N.t;
  let info;
  try {
    info = await invoke('check_update');
  } catch {
    info = null; /* offline or updater not configured */
  }
  if (!info) return;
  updateInfo = info;
  $('#update-banner strong').textContent = t('update_title');
  detail.textContent = t('update_detail').replace('{version}', info.version);
  banner.hidden = false;
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

/* ------------------------------- onboarding ------------------------------ */

/* First-run tour: three short steps mirroring the Getting Started wiki.
 * Shown once; skipping counts as done. */
const OB_KEY = 'flobro-onboarded';
const OB_ART = [
  /* step 1: a generic website flows into the Flobro app icon; the arrow
   * keeps clear margins on both sides */
  '<svg viewBox="0 0 200 90"><rect x="14" y="12" width="84" height="66" rx="8" fill="none" stroke="#248BD2" stroke-width="3"/><path d="M14 29h84" stroke="#248BD2" stroke-width="3"/><circle cx="24" cy="20.5" r="2.6" fill="#248BD2"/><circle cx="33" cy="20.5" r="2.6" fill="#248BD2"/><rect x="24" y="39" width="64" height="7" rx="3.5" fill="#248BD2" fill-opacity=".3"/><rect x="24" y="52" width="46" height="7" rx="3.5" fill="#248BD2" fill-opacity=".3"/><rect x="24" y="65" width="56" height="7" rx="3.5" fill="#248BD2" fill-opacity=".3"/><path d="M108 45h22" stroke="#248BD2" stroke-width="3" stroke-linecap="round"/><path d="M124 38l8 7-8 7" fill="none" stroke="#248BD2" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><rect x="144" y="36" width="40" height="31" rx="8" fill="none" stroke="#248BD2" stroke-opacity=".35" stroke-width="3"/><rect x="156" y="24" width="40" height="31" rx="8" fill="#248BD2"/></svg>',
  /* step 2: arrow points up at the top bar the text talks about */
  '<svg viewBox="0 0 200 90"><rect x="40" y="14" width="120" height="66" rx="9" fill="none" stroke="#248BD2" stroke-width="3"/><rect x="40" y="14" width="120" height="16" rx="8" fill="#248BD2"/><circle cx="54" cy="22" r="2.6" fill="#fff"/><circle cx="64" cy="22" r="2.6" fill="#fff"/><circle cx="74" cy="22" r="2.6" fill="#fff"/><path d="M100 68V46l-6 6m6-6l6 6" fill="none" stroke="#248BD2" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  /* step 3: pin + multiple windows; the transform centers the pin glyph
   * on the filled window (its raw bounding box sits at 147.2, 54) */
  '<svg viewBox="0 0 200 90"><rect x="26" y="30" width="64" height="44" rx="8" fill="none" stroke="#248BD2" stroke-opacity=".35" stroke-width="3"/><rect x="58" y="16" width="64" height="44" rx="8" fill="none" stroke="#248BD2" stroke-opacity=".6" stroke-width="3"/><rect x="110" y="30" width="64" height="44" rx="8" fill="#248BD2"/><path d="M150 40l10 10-5.5 1.5-6.5 6.5.8 8-5-5-7 7-2.5-2.5 7-7-5-5 8 .8 6.5-6.5z" fill="#fff" transform="translate(-5.2 -2)"/></svg>',
];

let obStep = 0;
let obBound = false;

function obRender() {
  const t = window.FLOBRO_I18N.t;
  $('#ob-art').innerHTML = OB_ART[obStep];
  $('#ob-title').textContent = t(`ob_title_${obStep + 1}`);
  $('#ob-body').textContent = t(`ob_body_${obStep + 1}`);
  $('#ob-next').textContent = obStep === OB_ART.length - 1 ? t('ob_done') : t('ob_next');
  /* the left button skips on the first step and goes back afterwards */
  $('#ob-skip').textContent = obStep === 0 ? t('ob_skip') : t('ob_prev');
  $('#ob-dots').innerHTML = OB_ART.map(
    (_, i) => `<span class="ob-dot${i === obStep ? ' on' : ''}"></span>`,
  ).join('');
}

function obFinish() {
  $('#onboarding').hidden = true;
  try {
    localStorage.setItem(OB_KEY, '1');
  } catch {
    /* storage unavailable */
  }
}

function startOnboarding(force) {
  let done = false;
  try {
    done = !!localStorage.getItem(OB_KEY);
  } catch {
    done = true; /* no storage: never nag */
  }
  if (done && !force) return;
  obStep = 0;
  if (!obBound) {
    obBound = true;
    $('#ob-skip').addEventListener('click', () => {
      if (obStep === 0) return obFinish();
      obStep--;
      obRender();
    });
    $('#ob-next').addEventListener('click', () => {
      if (obStep === OB_ART.length - 1) return obFinish();
      obStep++;
      obRender();
    });
  }
  obRender();
  $('#onboarding').hidden = false;
}

startOnboarding();
