use std::fs;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_updater::UpdaterExt;

static FLOAT_COUNTER: AtomicU32 = AtomicU32::new(0);

/* ------------------------------- updater -------------------------------
 * Checks GitHub releases on launch. Nothing installs automatically: the
 * launcher shows a banner with the version and notes, and only downloads
 * and installs after the user clicks "Update now". Update authenticity is
 * verified with a dedicated Tauri signing key (separate from the Apple and
 * Windows code-signing certificates); with the placeholder public key in
 * tauri.conf.json the check simply fails quietly and no banner appears.
 * Manual checks (macOS menu > Check for Updates) report through a native
 * dialog instead, so the answer shows up no matter which window is open. */
#[derive(Default)]
struct PendingUpdate(Mutex<Option<tauri_plugin_updater::Update>>);

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateInfo {
    version: String,
    current_version: String,
    notes: String,
}

#[tauri::command]
async fn check_update(
    app: AppHandle,
    pending: tauri::State<'_, PendingUpdate>,
) -> Result<Option<UpdateInfo>, String> {
    // Any failure (no update, offline, placeholder key) is treated as
    // "no update" so a broken check never nags the user.
    let updater = match app.updater() {
        Ok(u) => u,
        Err(_) => return Ok(None),
    };
    let found = updater.check().await.ok().flatten();
    let info = found.as_ref().map(|u| UpdateInfo {
        version: u.version.clone(),
        current_version: u.current_version.clone(),
        notes: u.body.clone().unwrap_or_default(),
    });
    *pending.0.lock().unwrap() = found;
    Ok(info)
}

#[tauri::command]
async fn install_update(
    app: AppHandle,
    pending: tauri::State<'_, PendingUpdate>,
) -> Result<(), String> {
    let update = pending.0.lock().unwrap().take();
    let Some(update) = update else {
        return Err("No pending update".into());
    };
    update
        .download_and_install(|_chunk, _total| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    // On Windows the installer has already exited the app; on macOS we
    // relaunch into the freshly installed version.
    app.restart();
}

/// Manual "Check for Updates" from the menu. The result lands in a native
/// dialog: from a float window a launcher banner would be invisible or force
/// the launcher to the front, which is annoying mid-browse.
#[cfg(target_os = "macos")]
async fn manual_update_check(app: AppHandle) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};

    let settings = load_settings(&app);
    let nl = resolved_lang(&settings) == "nl";
    let title = if nl {
        "Zoek naar updates"
    } else {
        "Check for Updates"
    };
    let found = match app.updater() {
        Ok(updater) => updater.check().await.ok().flatten(),
        Err(_) => None,
    };
    // Any failure counts as "no update", matching the silent launch check.
    let Some(update) = found else {
        app.dialog()
            .message(if nl {
                "Je gebruikt de nieuwste versie."
            } else {
                "You are on the latest version."
            })
            .title(title)
            .show(|_| {});
        return;
    };
    let message = if nl {
        format!("Versie {} staat klaar. Nu bijwerken?", update.version)
    } else {
        format!("Version {} is ready. Update now?", update.version)
    };
    let handle = app.clone();
    app.dialog()
        .message(message)
        .title(title)
        .buttons(MessageDialogButtons::OkCancelCustom(
            (if nl { "Nu bijwerken" } else { "Update now" }).into(),
            "Later".into(),
        ))
        .show(move |confirmed| {
            if !confirmed {
                return;
            }
            tauri::async_runtime::spawn(async move {
                if update
                    .download_and_install(|_chunk, _total| {}, || {})
                    .await
                    .is_ok()
                {
                    handle.restart();
                }
            });
        });
}

const TOOLBAR_JS: &str = include_str!("toolbar.js");

/* ------------------------------ analytics -------------------------------
 * Privacy-friendly usage stats via PostHog (EU cloud).
 * - Only the HOSTNAME of floated pages is sent, never full URLs.
 * - Random anonymous id, no IP persistence ($ip: null), no other properties.
 * - Fully disabled through the "Share anonymous usage stats" setting.
 */
const POSTHOG_KEY: &str = "phc_tmfA5uemSD7TscmzLWQPAiqYXxfNartjfYsrjWQ6rEot";
const POSTHOG_HOST: &str = "https://eu.i.posthog.com";

fn track(app: &AppHandle, event: &str, hostname: Option<String>) {
    let settings = load_settings(app);
    if !settings.share_usage || POSTHOG_KEY.contains("REPLACE_ME") {
        return;
    }
    let distinct_id = settings.anon_id;
    let event = event.to_string();
    std::thread::spawn(move || {
        let mut props = serde_json::json!({
            "$ip": null,
            "app_version": env!("CARGO_PKG_VERSION"),
            "$os": std::env::consts::OS,
            // system language: tells us which translations to add next
            "locale": sys_locale::get_locale().unwrap_or_else(|| "unknown".into()),
        });
        if let Some(host) = hostname {
            props["hostname"] = serde_json::Value::String(host);
        }
        let _ = ureq::post(&format!("{POSTHOG_HOST}/capture/"))
            .timeout(std::time::Duration::from_secs(5))
            .send_json(serde_json::json!({
                "api_key": POSTHOG_KEY,
                "event": event,
                "distinct_id": distinct_id,
                "properties": props,
            }));
    });
}

/* ------------------------------- settings ------------------------------- */

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(default)]
pub struct Settings {
    pub default_url: String,
    pub open_default_on_start: bool,
    pub stay_on_top: bool,
    pub remember_recent: bool,
    pub share_usage: bool,
    /// UI language: "auto" follows the system, or an explicit "en" / "nl".
    pub language: String,
    pub anon_id: String,
    pub recent: Vec<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            default_url: String::new(),
            open_default_on_start: false,
            stay_on_top: true,
            remember_recent: true,
            share_usage: true,
            language: "auto".into(),
            anon_id: uuid::Uuid::new_v4().to_string(),
            recent: vec![],
        }
    }
}

fn settings_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

fn load_settings(app: &AppHandle) -> Settings {
    settings_path(app)
        .ok()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// The UI language the toolbar and native menu should use.
fn resolved_lang(settings: &Settings) -> &'static str {
    let pref = settings.language.as_str();
    if pref == "en" || pref == "nl" {
        return if pref == "nl" { "nl" } else { "en" };
    }
    let sys = sys_locale::get_locale().unwrap_or_default().to_lowercase();
    if sys.starts_with("nl") {
        "nl"
    } else {
        "en"
    }
}

#[tauri::command]
fn get_settings(app: AppHandle) -> Settings {
    load_settings(&app)
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    let path = settings_path(&app)?;
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

/* ----------------------------- float windows ---------------------------- */

fn normalize_url(input: &str) -> Result<url::Url, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("Empty URL".into());
    }
    let candidate = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };
    let parsed = url::Url::parse(&candidate).map_err(|e| e.to_string())?;
    match parsed.scheme() {
        "http" | "https" => Ok(parsed),
        s => Err(format!("Unsupported scheme: {s}")),
    }
}

#[tauri::command]
async fn open_float(app: AppHandle, url: String) -> Result<(), String> {
    let parsed = normalize_url(&url)?;

    // remember in recents
    let mut settings = load_settings(&app);
    if settings.remember_recent {
        let u = parsed.to_string();
        settings.recent.retain(|r| r != &u);
        settings.recent.insert(0, u);
        settings.recent.truncate(8);
        let _ = save_settings(app.clone(), settings.clone());
    }

    // usage stats: hostname only, never the full URL
    track(
        &app,
        "float_opened",
        parsed.host_str().map(|h| h.to_string()),
    );

    let n = FLOAT_COUNTER.fetch_add(1, Ordering::SeqCst);
    let label = format!("float-{n}");

    WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed))
        .title("Flobro")
        .decorations(false)
        .always_on_top(settings.stay_on_top)
        .inner_size(560.0, 348.0)
        .min_inner_size(170.0, 38.0)
        .initialization_script(&TOOLBAR_JS.replace("__FLOBRO_LANG__", resolved_lang(&settings)))
        .build()
        .map_err(|e| e.to_string())?;

    // Hide the launcher once a float window is up
    if let Some(launcher) = app.get_webview_window("launcher") {
        let _ = launcher.hide();
    }
    Ok(())
}

/// Opens an empty float window (the toolbar's and menu's "New window").
/// Uses a local blank page so the float capability covers the toolbar IPC;
/// double-clicking the title bar lets the user type a URL right away.
#[tauri::command]
async fn float_new(app: AppHandle) -> Result<(), String> {
    let settings = load_settings(&app);
    track(&app, "float_opened", None);

    let n = FLOAT_COUNTER.fetch_add(1, Ordering::SeqCst);
    let label = format!("float-{n}");

    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("blank.html".into()))
        .title("Flobro")
        .decorations(false)
        .always_on_top(settings.stay_on_top)
        .inner_size(560.0, 348.0)
        .min_inner_size(170.0, 38.0)
        .initialization_script(&TOOLBAR_JS.replace("__FLOBRO_LANG__", resolved_lang(&settings)))
        .build()
        .map_err(|e| e.to_string())?;

    if let Some(launcher) = app.get_webview_window("launcher") {
        let _ = launcher.hide();
    }
    Ok(())
}

#[tauri::command]
fn float_pin(window: WebviewWindow, pinned: bool) -> Result<(), String> {
    window.set_always_on_top(pinned).map_err(|e| e.to_string())
}

#[tauri::command]
fn float_zoom(window: WebviewWindow, factor: f64) -> Result<(), String> {
    window
        .set_zoom(factor.clamp(0.25, 5.0))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn float_aspect(window: WebviewWindow) -> Result<(), String> {
    // Keep current width, snap height to 16:9 (plus nothing — the toolbar overlays)
    let size = window.inner_size().map_err(|e| e.to_string())?;
    let height = (size.width as f64 * 9.0 / 16.0).round() as u32;
    window
        .set_size(PhysicalSize::new(size.width, height))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn float_minimize(window: WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn float_close(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    let label = window.label().to_string();
    window.close().map_err(|e| e.to_string())?;
    // If that was the last float window, bring the launcher back
    let floats_left = app
        .webview_windows()
        .keys()
        .filter(|k| k.starts_with("float-") && **k != label)
        .count();
    if floats_left == 0 {
        if let Some(launcher) = app.get_webview_window("launcher") {
            let _ = launcher.show();
            let _ = launcher.set_focus();
        }
    }
    Ok(())
}

#[tauri::command]
async fn open_settings(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("settings") {
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, "settings", WebviewUrl::App("settings.html".into()))
        .title("Flobro settings")
        .decorations(false)
        .transparent(true)
        .inner_size(400.0, 700.0)
        .resizable(false)
        .always_on_top(true)
        .center()
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn show_launcher(app: AppHandle) -> Result<(), String> {
    if let Some(launcher) = app.get_webview_window("launcher") {
        launcher.show().map_err(|e| e.to_string())?;
        launcher.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/* ------------------------------ deep links ------------------------------ */

/// Handles flobro://open?url=<encoded> links coming from the Chrome
/// extension (or anywhere else).
fn handle_deep_link(app: &AppHandle, link: &str) {
    let Ok(parsed) = url::Url::parse(link) else {
        return;
    };
    if parsed.scheme() != "flobro" {
        return;
    }
    let target = parsed
        .query_pairs()
        .find(|(k, _)| k == "url")
        .map(|(_, v)| v.to_string());
    if let Some(target) = target {
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            let _ = open_float(handle, target).await;
        });
    }
}

/* ------------------------------ macOS menu ------------------------------
 * Native menu bar with the usual categories, fully localized (the
 * predefined items get explicit texts; their defaults are English and
 * spell the app after the binary name). Preferences (Cmd+,) opens the
 * settings window, File > New Float Window (Cmd+N) opens a blank float,
 * View > Reload Page (Cmd+R) reloads the focused float. */
#[cfg(target_os = "macos")]
fn build_menu(app: &tauri::App, lang: &str) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{
        AboutMetadataBuilder, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
    };
    let nl = lang == "nl";
    let t = |en: &'static str, nl_str: &'static str| if nl { nl_str } else { en };

    let version = env!("CARGO_PKG_VERSION");
    let changelog_url = format!("https://github.com/flobro/flobro-app/releases/tag/v{version}");
    // The About panel renders the icon at roughly 64pt, so feed it the 256px
    // asset; the default window icon is too small and shows up blurry.
    let about_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/128x128@2x.png"))
        .ok()
        .or_else(|| app.default_window_icon().cloned());
    let about_meta = AboutMetadataBuilder::new()
        .name(Some("Flobro"))
        .version(Some(version))
        .icon(about_icon)
        // macOS ignores website/website_label in the native About panel, so
        // the changelog URL also goes into the credits text, which macOS does
        // render. website is kept for any future non-macOS menu use.
        .credits(Some(format!(
            "{}:\n{changelog_url}",
            t("Changelog", "Wijzigingen")
        )))
        .website(Some(changelog_url.clone()))
        .website_label(Some(t("Changelog", "Wijzigingen")))
        .build();

    let app_menu = SubmenuBuilder::new(app, "Flobro")
        .item(&PredefinedMenuItem::about(
            app,
            Some(t("About Flobro", "Over Flobro")),
            Some(about_meta),
        )?)
        .separator()
        .item(
            &MenuItemBuilder::with_id(
                "check-updates",
                t("Check for Updates\u{2026}", "Zoek naar updates\u{2026}"),
            )
            .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id(
                "preferences",
                t("Preferences\u{2026}", "Voorkeuren\u{2026}"),
            )
            .accelerator("Cmd+,")
            .build(app)?,
        )
        .separator()
        .item(&PredefinedMenuItem::services(
            app,
            Some(t("Services", "Voorzieningen")),
        )?)
        .separator()
        .item(&PredefinedMenuItem::hide(
            app,
            Some(t("Hide Flobro", "Verberg Flobro")),
        )?)
        .item(&PredefinedMenuItem::hide_others(
            app,
            Some(t("Hide Others", "Verberg andere")),
        )?)
        .item(&PredefinedMenuItem::show_all(
            app,
            Some(t("Show All", "Toon alles")),
        )?)
        .separator()
        .item(&PredefinedMenuItem::quit(
            app,
            Some(t("Quit Flobro", "Stop Flobro")),
        )?)
        .build()?;

    let file_menu = SubmenuBuilder::new(app, t("File", "Archief"))
        .item(
            &MenuItemBuilder::with_id("new-float", t("New Float Window", "Nieuw zwevend venster"))
                .accelerator("Cmd+N")
                .build(app)?,
        )
        .separator()
        .item(&PredefinedMenuItem::close_window(
            app,
            Some(t("Close Window", "Sluit venster")),
        )?)
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, t("Edit", "Wijzig"))
        .item(&PredefinedMenuItem::undo(app, Some(t("Undo", "Herstel")))?)
        .item(&PredefinedMenuItem::redo(app, Some(t("Redo", "Opnieuw")))?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, Some(t("Cut", "Knip")))?)
        .item(&PredefinedMenuItem::copy(app, Some(t("Copy", "Kopieer")))?)
        .item(&PredefinedMenuItem::paste(app, Some(t("Paste", "Plak")))?)
        .item(&PredefinedMenuItem::select_all(
            app,
            Some(t("Select All", "Selecteer alles")),
        )?)
        .build()?;

    let view_menu = SubmenuBuilder::new(app, t("View", "Weergave"))
        .item(
            &MenuItemBuilder::with_id("reload-page", t("Reload Page", "Herlaad pagina"))
                .accelerator("Cmd+R")
                .build(app)?,
        )
        .build()?;

    let window_menu = SubmenuBuilder::new(app, t("Window", "Venster"))
        .item(&PredefinedMenuItem::minimize(
            app,
            Some(t("Minimize", "Minimaliseer")),
        )?)
        .item(&PredefinedMenuItem::fullscreen(
            app,
            Some(t(
                "Toggle Full Screen",
                "Schakel schermvullende weergave in/uit",
            )),
        )?)
        .build()?;

    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&MenuItemBuilder::with_id("flobro-help", t("Flobro Help", "Flobro-help")).build(app)?)
        .item(&MenuItemBuilder::with_id("onboarding", "Onboarding").build(app)?)
        .item(
            &MenuItemBuilder::with_id("getting-started", t("Getting Started", "Aan de slag"))
                .build(app)?,
        )
        .separator()
        .item(&MenuItemBuilder::with_id("report-bug", t("Report a Bug", "Bug melden")).build(app)?)
        .build()?;

    MenuBuilder::new(app)
        .items(&[
            &app_menu,
            &file_menu,
            &edit_menu,
            &view_menu,
            &window_menu,
            &help_menu,
        ])
        .build()
}

/* --------------------------------- run ---------------------------------- */

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // single-instance must be registered first; forwards deep links on
        // Windows/Linux where they arrive as arguments to a new instance
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            for arg in args {
                if arg.starts_with("flobro://") {
                    handle_deep_link(app, &arg);
                }
            }
            if let Some(launcher) = app.get_webview_window("launcher") {
                let _ = launcher.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(PendingUpdate::default())
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            open_float,
            float_new,
            float_pin,
            float_zoom,
            float_aspect,
            float_minimize,
            float_close,
            open_settings,
            show_launcher,
            check_update,
            install_update
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // Persist settings once on first run so the anonymous id is stable
            let settings = load_settings(&handle);
            let _ = save_settings(handle.clone(), settings.clone());

            track(&handle, "app_opened", None);

            #[cfg(target_os = "macos")]
            {
                use tauri_plugin_opener::OpenerExt;
                let menu = build_menu(app, resolved_lang(&settings))?;
                app.set_menu(menu)?;
                app.on_menu_event(|app, event| match event.id().as_ref() {
                    "preferences" => {
                        let handle = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = open_settings(handle).await;
                        });
                    }
                    "new-float" => {
                        let handle = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = float_new(handle).await;
                        });
                    }
                    "check-updates" => {
                        tauri::async_runtime::spawn(manual_update_check(app.clone()));
                    }
                    "onboarding" => {
                        let handle = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = show_launcher(handle.clone()).await;
                            let _ = handle.emit_to("launcher", "flobro-show-onboarding", ());
                        });
                    }
                    "reload-page" => {
                        // Reload the focused float window, if any
                        for (label, win) in app.webview_windows() {
                            if label.starts_with("float-") && win.is_focused().unwrap_or(false) {
                                let _ = win.eval("location.reload()");
                            }
                        }
                    }
                    "flobro-help" => {
                        let _ = app
                            .opener()
                            .open_url("https://github.com/flobro/flobro-app/wiki", None::<&str>);
                    }
                    "getting-started" => {
                        let _ = app.opener().open_url(
                            "https://github.com/flobro/flobro-app/wiki/Getting-Started",
                            None::<&str>,
                        );
                    }
                    "report-bug" => {
                        let _ = app
                            .opener()
                            .open_url("https://github.com/flobro/flobro-app/issues", None::<&str>);
                    }
                    _ => {}
                });
            }

            // deep links delivered while running (macOS) or on cold start
            let dl_handle = handle.clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    handle_deep_link(&dl_handle, url.as_str());
                }
            });

            if settings.open_default_on_start && !settings.default_url.is_empty() {
                let url = settings.default_url.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = open_float(handle, url).await;
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Flobro");
}
