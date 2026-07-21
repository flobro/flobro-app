fn main() {
    // Declaring the app commands generates ACL permissions (allow-<command>)
    // so the float capability can expose them to remote pages. Without this,
    // remote webviews cannot call any app command and the injected toolbar
    // buttons silently do nothing.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "get_settings",
            "save_settings",
            "open_float",
            "float_new",
            "float_pin",
            "float_zoom",
            "float_aspect",
            "float_minimize",
            "float_close",
            "open_settings",
            "show_launcher",
            "check_update",
            "install_update",
            "report_error",
        ]),
    ))
    .expect("failed to run tauri-build");
}
