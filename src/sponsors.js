/* global window, document */
'use strict';

const $$ = (s) => document.querySelectorAll(s);

const FUNDING = {
  github: {
    link: 'https://github.com/sponsors/cornips',
    icon: `<svg viewBox="0 0 16 16" fill="#db61a2" aria-hidden="true"><path d="M8 14.25l-.345-.666C4.451 11.033 1.75 8.632 1.75 5.94 1.75 3.9 3.3 2.5 5.05 2.5c1.2 0 2.29.62 2.95 1.6.66-.98 1.75-1.6 2.95-1.6 1.75 0 3.3 1.4 3.3 3.44 0 2.692-2.7 5.093-5.905 7.644L8 14.25z"/></svg>`,
    text: 'GitHub Sponsors',
  },
  buy_me_a_coffee: {
    link: 'https://www.buymeacoffee.com/cornips',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="#f5a623" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 8h2a2 2 0 0 1 2 2 4 4 0 0 1-4 4h-.5"></path><path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8z" fill="#f5a623" fill-opacity=".15"></path><path d="M8 2v2M12 2v2"></path></svg>`,
    text: 'Buy me a Coffee',
  },
  custom: {
    link: 'https://payment-links.mollie.com/payment/cnRzN8hBxK5zk5CwmD6rk',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="#248bd2" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#248bd2" fill-opacity=".12"/><path d="M15.5 8.5A4.5 4.5 0 1 0 15.5 15.5M7.5 10.8h6M7.5 13.2h5"/></svg>`,
    text: `<span data-i18n="donate_once">Donate once</span>`,
  },
};

$$('button[data-sponsor]').forEach((btn) => {
  const dataAttributes = btn.dataset;
  const { sponsor } = dataAttributes;
  const { link, icon, text } = FUNDING[sponsor];

  btn.innerHTML = `${icon} ${text}`;
  FLOBRO_I18N.apply();
  btn.addEventListener('click', () => window.__TAURI__.opener.openUrl(link));
});
