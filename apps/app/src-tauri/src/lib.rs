use tauri::Manager;

mod vault_asset_scope;
mod vault_watcher;

/// Native (pre-webview-paint) background for the main window, matching the
/// `--surface-root` token in design-system/theme.css (dark: neutral-800,
/// light: neutral-50). Without it WKWebView paints its own white until the
/// first frame of the page — `backgroundColor` in tauri.conf.json can't be used
/// because it's static and can't follow light/dark. This relies on tauri's
/// `macos-private-api` feature (wry's `transparent` path), which is what
/// turns off WKWebView's default white fill; see tauri.conf.json.
fn native_background(theme: tauri::Theme) -> tauri::window::Color {
    match theme {
        tauri::Theme::Dark => tauri::window::Color(0x1f, 0x1f, 0x1f, 0xff),
        _ => tauri::window::Color(0xf9, 0xf8, 0xf7, 0xff),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(vault_watcher::VaultWatcherState::default())
        .invoke_handler(tauri::generate_handler![
            vault_asset_scope::allow_vault_asset_scope,
            vault_watcher::start_vault_watcher,
            vault_watcher::stop_vault_watcher,
        ])
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Automation/testing only — never reachable in an ordinary build:
            // the crate itself doesn't exist in the dependency graph unless
            // Cargo's `automation` feature is explicitly enabled (see
            // Cargo.toml), which nothing but packages/automation's own build
            // invocation does. Even then, this only starts if the harness
            // opts in via TAURI_AUTOMATION, so an ordinary `npm run desktop`
            // session never runs a WebDriver server. See
            // packages/automation/AUTOMATION.md.
            #[cfg(feature = "automation")]
            if std::env::var("TAURI_AUTOMATION").is_ok() {
                app.handle().plugin(tauri_plugin_wdio_webdriver::init())?;
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Runs before the event loop, i.e. before the window's first frame.
            // The page's own inline script refines this if the user's chosen
            // theme differs from the OS theme (index.html).
            if let Some(window) = app.get_webview_window("main") {
                let theme = window.theme().unwrap_or(tauri::Theme::Light);
                window.set_background_color(Some(native_background(theme)))?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
