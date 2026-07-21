/* global window, document */
'use strict';

const { invoke } = window.__TAURI__.core;
const { openUrl } = window.__TAURI__.opener;
const { emit } = window.__TAURI__.event;
const appWindow = window.__TAURI__.window.getCurrentWindow();

const $ = (sel) => document.querySelector(sel);
const t = window.FLOBRO_I18N.t;
window.FLOBRO_I18N.apply();
let settings = null;

async function load() {
  settings = await invoke('get_settings');
  $('#default-url').value = settings.default_url || '';
  $('#open-on-start').checked = !!settings.open_default_on_start;
  $('#stay-on-top').checked = !!settings.stay_on_top;
  $('#remember-recent').checked = !!settings.remember_recent;
  $('#share-usage').checked = !!settings.share_usage;
  $('#language').value = settings.language || 'auto';
}

async function save() {
  settings.default_url = $('#default-url').value.trim();
  settings.open_default_on_start = $('#open-on-start').checked;
  settings.stay_on_top = $('#stay-on-top').checked;
  settings.remember_recent = $('#remember-recent').checked;
  settings.share_usage = $('#share-usage').checked;
  settings.language = $('#language').value;
  await invoke('save_settings', { settings });
  window.FLOBRO_I18N.setLang(settings.language);
  emit('flobro-language', settings.language);
  const status = $('#status');
  status.textContent = t('saved');
  setTimeout(() => {
    status.textContent = '';
  }, 1800);
}

/* Save on change: no Save button. Toggles and the language select save
 * immediately; the URL field saves on blur/Enter and while typing after a
 * short pause. */
let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 600);
}
for (const id of ['open-on-start', 'stay-on-top', 'remember-recent', 'share-usage', 'language']) {
  document.getElementById(id).addEventListener('change', save);
}
$('#default-url').addEventListener('change', save);
$('#default-url').addEventListener('input', saveSoon);
$('#close').addEventListener('click', () => appWindow.close());
$('#feedback').addEventListener('click', () =>
  openUrl('https://github.com/flobro/flobro-app/issues'),
);

/* A little feedback on the usage-stats toggle: confetti when it helps
 * development, a sad face drifting off when it doesn't. */
$('#share-usage').addEventListener('change', (e) => {
  const fx = $('#usage-fx');
  fx.innerHTML = '';
  if (e.target.checked) {
    for (let i = 0; i < 8; i++) {
      const bit = document.createElement('span');
      bit.className = 'fx-confetti';
      const angle = (Math.PI * 2 * i) / 8 + Math.random() * 0.5;
      const dist = 18 + Math.random() * 22;
      bit.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
      bit.style.setProperty('--dy', Math.sin(angle) * dist - 10 + 'px');
      bit.style.background = ['#248bd2', '#3fa9f5', '#1668a8'][i % 3];
      fx.appendChild(bit);
      setTimeout(() => bit.remove(), 900);
    }
  } else {
    const sad = document.createElement('span');
    sad.className = 'fx-sad';
    sad.textContent = '☹';
    fx.appendChild(sad);
    setTimeout(() => sad.remove(), 1600);
  }
});

load();
