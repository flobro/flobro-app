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

  $('#update-later').addEventListener('click', () => {
    banner.hidden = true;
  });
  $('#update-now').addEventListener('click', async () => {
    banner.dataset.busy = '1';
    detail.textContent = t('update_installing');
    try {
      await invoke('install_update'); /* installs, then relaunches */
    } catch (err) {
      /* leave the banner up so the user can retry or download manually */
      banner.dataset.busy = '';
      detail.textContent = String(err);
    }
  });
}

setVersion();

refreshRecent();

checkForUpdate();
