use std::fs;
use std::sync::atomic::{AtomicU32, Ordering};
use tauri::{AppHandle, Manager, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;

static FLOAT_COUNTER: AtomicU32 = AtomicU32::new(0);

const TOOLBAR_JS: &str = include_str!("toolbar.js");

/* ------------------------------ analytics -------------------------------
 * Privacy-friendly usage stats via PostHog (EU cloud).
 * - Only the HOSTNAME of floated pages is sent, never full URLs.
 * - Random anonymous id, no IP persistence ($ip: null), no other properties.
 * - Fully disabled through the "Share anonymous usage stats" setting.
 * Replace POSTHOG_KEY with the real project key; events are skipped while
 * the placeholder is in place. */
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
    pub anon_id: String,
    pub recent: Vec<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            default_url: "https://www.youtube.com".into(),
            open_default_on_start: false,
            stay_on_top: true,
            remember_recent: true,
            share_usage: true,
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
        .initialization_script(TOOLBAR_JS)
        .build()
        .map_err(|e| e.to_string())?;

    // Hide the launcher once a float window is up
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
        .inner_size(400.0, 560.0)
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
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            open_float,
            float_pin,
            float_zoom,
            float_aspect,
            float_minimize,
            float_close,
            open_settings,
            show_launcher
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // Persist settings once on first run so the anonymous id is stable
            let settings = load_settings(&handle);
            let _ = save_settings(handle.clone(), settings.clone());

            track(&handle, "app_opened", None);

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
