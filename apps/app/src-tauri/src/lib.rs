use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

mod space;
mod startup;
mod vault_asset_scope;
mod vault_watcher;

/// The main window is declared `"visible": false` in tauri.conf.json: a
/// WKWebView paints white until its page's first frame, so the window is only
/// shown once the frontend has rendered its first screen (see
/// src/app/frontendReady.ts) and nothing else ever shows it.
static WINDOW_REVEALED: AtomicBool = AtomicBool::new(false);

/// How long the frontend gets to report ready before the user is asked what
/// to do. This never reveals the window by itself — it only offers recovery.
const STARTUP_TIMEOUT: Duration = Duration::from_secs(30);

/// Called by the frontend once its initial screen has rendered. Idempotent:
/// later calls (e.g. after a webview reload) leave the window alone, so a
/// reload never re-steals focus.
#[tauri::command]
fn frontend_ready(window: WebviewWindow) -> Result<(), String> {
    if !WINDOW_REVEALED.swap(true, Ordering::SeqCst) {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// If the frontend never reports ready (script failed to load, crashed before
/// rendering…) the window would stay hidden forever with no way to see why.
/// Instead of showing a blank webview, ask: reload it, or quit.
fn spawn_startup_watchdog(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(STARTUP_TIMEOUT);
        if WINDOW_REVEALED.load(Ordering::SeqCst) {
            return;
        }
        let reload = app
            .dialog()
            .message("Clutter didn't finish starting. You can try loading it again or quit.")
            .title("Clutter couldn't start")
            .kind(MessageDialogKind::Error)
            .buttons(MessageDialogButtons::OkCancelCustom(
                "Reload".into(),
                "Quit".into(),
            ))
            .blocking_show();
        if !reload {
            app.exit(1);
            return;
        }
        if WINDOW_REVEALED.load(Ordering::SeqCst) {
            return;
        }
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.eval("window.location.reload()");
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(vault_watcher::VaultWatcherState::default())
        .invoke_handler(tauri::generate_handler![
            frontend_ready,
            space::create_space_folder,
            space::get_default_space_parent,
            space::validate_space_folder,
            startup::get_configured_space,
            startup::open_space,
            startup::show_welcome_shape,
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
            spawn_startup_watchdog(app.handle().clone());
            startup::open_startup_window(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
