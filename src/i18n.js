/**
 * Tiny i18n for the Flobro UI. English is primary, Dutch second.
 * Add languages here as usage data shows demand.
 */
'use strict';

window.FLOBRO_I18N = (function () {
  const dict = {
    en: {
      hero_title: 'Float a window',
      hero_sub: 'Paste a link, get a distraction-free window that stays on top.',
      url_placeholder: 'youtube.com/watch?v=…',
      float_btn: 'Float',
      recent: 'Recent',
      recent_empty: 'Nothing floated yet.',
      settings: 'Settings',
      minimize: 'Minimize',
      close: 'Close',
      settings_title: 'Settings',
      default_page: 'Default page',
      open_on_start: 'Open default page on launch',
      open_on_start_sub: 'Skip the launcher and float your default page right away.',
      stay_on_top: 'Stay on top by default',
      stay_on_top_sub: 'New windows float above everything. Toggle per window with the pin.',
      remember_recent: 'Remember recent pages',
      remember_recent_sub: 'Keeps your last 8 floated pages in the launcher.',
      share_usage: 'Share anonymous usage stats',
      share_usage_sub:
        'Only the hostname of floated pages (like youtube.com). Never full URLs, never your IP.',
      save: 'Save',
      saved: 'Saved.',
      recent_cleared: 'Recent pages cleared.',
      clear_recent: 'Clear recent',
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
    },
    nl: {
      hero_title: 'Laat een venster zweven',
      hero_sub: 'Plak een link en krijg een afleidingsvrij venster dat altijd bovenaan blijft.',
      url_placeholder: 'youtube.com/watch?v=…',
      float_btn: 'Float',
      recent: 'Recent',
      recent_empty: 'Nog niets gefloat.',
      settings: 'Instellingen',
      minimize: 'Minimaliseren',
      close: 'Sluiten',
      settings_title: 'Instellingen',
      default_page: 'Standaardpagina',
      open_on_start: 'Standaardpagina openen bij start',
      open_on_start_sub: 'Sla de launcher over en float direct je standaardpagina.',
      stay_on_top: 'Standaard bovenaan blijven',
      stay_on_top_sub: 'Nieuwe vensters zweven boven alles. Per venster aan te passen met de pin.',
      remember_recent: 'Recente pagina’s onthouden',
      remember_recent_sub: 'Bewaart je laatste 8 gefloate pagina’s in de launcher.',
      share_usage: 'Anonieme gebruiksstatistieken delen',
      share_usage_sub:
        'Alleen de hostnaam van gefloate pagina’s (zoals youtube.com). Nooit volledige URL’s, nooit je IP.',
      save: 'Opslaan',
      saved: 'Opgeslagen.',
      recent_cleared: 'Recente pagina’s gewist.',
      clear_recent: 'Recent wissen',
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
    },
  };

  const lang = (navigator.language || 'en').toLowerCase().startsWith('nl') ? 'nl' : 'en';

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

  return { t, apply, lang };
})();
