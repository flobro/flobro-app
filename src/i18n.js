/**
 * Tiny i18n for the Flobro UI. English is primary, Dutch second.
 * Add languages here as usage data shows demand.
 * The language override (settings > Language) is mirrored in
 * localStorage ('flobro-lang') so every window resolves it synchronously.
 */
'use strict';

window.FLOBRO_I18N = (function () {
  const dict = {
    en: {
      hero_title: 'Float a window',
      hero_sub:
        'Paste a link, get a distraction-free window that stays on top. Dashboards, chats, docs, video: anything with a URL.',
      url_placeholder: 'Paste or type any link…',
      float_btn: 'Float',
      recent: 'Recent',
      recent_empty: 'Nothing floated yet.',
      settings: 'Settings',
      feedback: 'Feedback',
      minimize: 'Minimize',
      close: 'Close',
      settings_title: 'Settings',
      default_page: 'Default page',
      open_on_start: 'Open default page on launch',
      preferences: 'Preferences',
      open_on_start_sub: 'Skip the launcher and float your default page right away.',
      stay_on_top: 'Stay on top by default',
      stay_on_top_sub: 'New windows float above everything. Toggle per window with the pin.',
      remember_recent: 'Remember recently visited websites',
      remember_recent_sub: 'Keeps your last 8 visits in the launcher.',
      share_usage: 'Share anonymous usage stats',
      share_usage_sub:
        'Only the hostname of floated pages (like flobro.app). Never full URLs, never your IP.',
      language: 'Language',
      lang_auto: 'System language',
      save: 'Save',
      saved: 'Saved.',
      recent_cleared: 'Recent pages cleared.',
      clear_recent: 'Clear',
      clear_recent_title: 'Clear recent pages',
      support: 'Support Flobro',
      donate_once: 'Donate once',
      update_title: 'Update available',
      update_now: 'Update now',
      update_later: 'Later',
      update_detail: 'Version {version} is ready.',
      update_installing: 'Downloading and installing…',
      update_changes: 'What changed',
      updated_title: 'Updated to version {version}',
      support_note_1: 'Open source, kept alive by you.',
      support_note_2: 'Please consider a donation to keep Flobro alive.',
      ob_title_1: 'Float anything',
      ob_body_1:
        'Paste any link and hit Float. A pipeline dashboard, a chat, a video: it opens in a tiny frameless window that stays on top of everything.',
      ob_title_2: 'Hover for controls',
      ob_body_2:
        'The window has zero interface. Move your mouse to the top edge to reveal the toolbar: zoom, refresh, pin, 16:9 snap and more.',
      ob_title_3: 'Make it yours',
      ob_body_3:
        'Pin or unpin per window, open as many floats as you like, and set a default page in Settings.',
      ob_skip: 'Skip',
      ob_prev: 'Back',
      ob_next: 'Next',
      ob_done: 'Get started',
    },
    nl: {
      hero_title: 'Laat een venster zweven',
      hero_sub:
        'Plak een link en krijg een afleidingsvrij venster dat altijd bovenaan blijft. Dashboards, chats, documenten, video: alles met een URL.',
      url_placeholder: 'Plak of typ een link…',
      float_btn: 'Float',
      recent: 'Recent',
      recent_empty: 'Nog niets gefloat.',
      settings: 'Instellingen',
      feedback: 'Feedback',
      minimize: 'Minimaliseren',
      close: 'Sluiten',
      settings_title: 'Instellingen',
      default_page: 'Standaardpagina',
      open_on_start: 'Standaardpagina openen bij start',
      preferences: 'Voorkeuren',
      open_on_start_sub: 'Sla het welkomstscherm over en open direct je standaardpagina.',
      stay_on_top: 'Standaard bovenaan blijven',
      stay_on_top_sub: 'Nieuwe vensters zweven boven alles. Per venster aan te passen met de pin.',
      remember_recent: 'Recent bezochte websites onthouden',
      remember_recent_sub: 'Bewaart je laatste 8 bezoeken in het welkomstscherm.',
      share_usage: 'Anonieme gebruiksstatistieken delen',
      share_usage_sub:
        'Alleen de hostnaam van gefloate pagina’s (zoals flobro.app). Nooit volledige URL’s, nooit je IP.',
      language: 'Taal',
      lang_auto: 'Systeemtaal',
      save: 'Opslaan',
      saved: 'Opgeslagen.',
      recent_cleared: 'Recente pagina’s gewist.',
      clear_recent: 'Wissen',
      clear_recent_title: 'Recente pagina’s wissen',
      support: 'Steun Flobro',
      donate_once: 'Eenmalig doneren',
      update_title: 'Update beschikbaar',
      update_now: 'Nu bijwerken',
      update_later: 'Later',
      update_detail: 'Versie {version} staat klaar.',
      update_installing: 'Downloaden en installeren…',
      update_changes: 'Wat is er nieuw',
      updated_title: 'Bijgewerkt naar versie {version}',
      support_note_1: 'Open source, levend gehouden door jou.',
      support_note_2: 'Overweeg de ontwikkeling te steunen.',
      ob_title_1: 'Float alles',
      ob_body_1:
        'Plak een link en klik op Float. Een pipeline-dashboard, een chat, een video: het opent in een klein kaderloos venster dat boven alles blijft.',
      ob_title_2: 'Hover voor bediening',
      ob_body_2:
        'Het venster heeft nul interface. Beweeg je muis naar de bovenrand voor de werkbalk: zoom, vernieuwen, pin, 16:9 en meer.',
      ob_title_3: 'Maak het van jou',
      ob_body_3:
        'Pin of ontpin per venster, open zoveel floats als je wilt en stel een standaardpagina in via Instellingen.',
      ob_skip: 'Overslaan',
      ob_prev: 'Terug',
      ob_next: 'Volgende',
      ob_done: 'Aan de slag',
    },
  };

  function resolve(pref) {
    const p = pref || localStorage.getItem('flobro-lang') || 'auto';
    if (dict[p]) return p;
    return (navigator.language || 'en').toLowerCase().startsWith('nl') ? 'nl' : 'en';
  }

  let lang = resolve();

  function t(key) {
    return (dict[lang] && dict[lang][key]) || dict.en[key] || key;
  }

  function apply() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
      el.placeholder = t(el.dataset.i18nPh);
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.dataset.i18nTitle);
    });
  }

  /** Switch language at runtime; pref is 'auto', 'en' or 'nl'. */
  function setLang(pref) {
    try {
      localStorage.setItem('flobro-lang', pref || 'auto');
    } catch {
      /* storage unavailable */
    }
    lang = resolve(pref);
    apply();
  }

  return {
    t,
    apply,
    setLang,
    get lang() {
      return lang;
    },
  };
})();
