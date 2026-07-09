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

$('#form').addEventListener('submit', (e) => {
  e.preventDefault();
  const url = $('#url').value.trim();
  if (url) floatUrl(url);
});

$('#settings').addEventListener('click', () => invoke('open_settings'));
$('#min').addEventListener('click', () => appWindow.minimize());
$('#close').addEventListener('click', () => appWindow.close());

refreshRecent();
