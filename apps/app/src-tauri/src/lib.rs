use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Manager, RunEvent, Url, WebviewWindow};

mod app_menu;
mod parse_cache;
mod space_folder;
mod startup_notice;
mod vault_asset_scope;
mod vault_watcher;

/// The main window is declared `"visible": false` in tauri.conf.json: a
/// WKWebView paints white until its page's first frame, so the window is only
/// shown once the frontend has rendered its first screen (see
/// src/app/frontendReady.ts) and nothing else ever shows it — not a timeout,
/// not a failure: a blank or broken webview is never revealed.
static WINDOW_REVEALED: AtomicBool = AtomicBool::new(false);

/// Which startup attempt is current. Bumped on every Retry, so a watchdog or a
/// failure report that belongs to an earlier attempt can tell it is stale.
static STARTUP_ATTEMPT: AtomicU64 = AtomicU64::new(1);

/// True while the recovery dialog is on screen: at most one is ever shown, so
/// a watchdog firing and a failure report arriving together can't stack two.
static RECOVERY_OPEN: AtomicBool = AtomicBool::new(false);

/// True from the moment Retry is chosen until the retried navigation starts
/// loading. The page being replaced may still be running in that gap and can
/// report another failure; that report belongs to the old attempt and must not
/// open a prompt over the new one.
static RETRY_PENDING: AtomicBool = AtomicBool::new(false);

/// How long the frontend gets to report ready before the user is asked what to
/// do. Measured packaged-app time to ready is ~0.6s warm and ~1.5s for the
/// first run of a freshly signed binary (the dev server's cold start is ~4s),
/// so this leaves a wide margin. Ready is sent at the first render — it does
/// not wait for the vault — so vault size never counts against it.
const STARTUP_TIMEOUT: Duration = Duration::from_secs(15);

/// Called by the frontend once its initial screen has rendered. Idempotent:
/// later calls (e.g. after a webview reload) leave the window alone, so a
/// reload never re-steals focus.
#[tauri::command]
fn frontend_ready(window: WebviewWindow) -> Result<(), String> {
    if WINDOW_REVEALED.load(Ordering::SeqCst) {
        return Ok(());
    }
    // Marked revealed only once the window really is shown: if `show` failed
    // after the flag was set, nothing would ever show it and the watchdog
    // would already be disarmed.
    window.show().map_err(|error| error.to_string())?;
    if !WINDOW_REVEALED.swap(true, Ordering::SeqCst) {
        // Startup succeeded: a recovery prompt still on screen is now wrong.
        startup_notice::cancel_active();
        window.set_focus().map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// Called by the page itself (index.html) for a fatal startup error — an
/// uncaught exception or a module script that failed to load — so recovery is
/// offered at once instead of after the watchdog. Ignored once the window is
/// revealed: from then on the app owns its own error handling.
#[tauri::command]
fn frontend_failed(app: AppHandle, reason: String) {
    if WINDOW_REVEALED.load(Ordering::SeqCst) || RETRY_PENDING.load(Ordering::SeqCst) {
        return;
    }
    let attempt = STARTUP_ATTEMPT.load(Ordering::SeqCst);
    std::thread::spawn(move || {
        offer_recovery(&app, attempt, &format!("frontend reported: {reason}"))
    });
}

/// Where a Retry sends the webview: the dev server in dev builds, the bundled
/// frontend otherwise.
fn startup_url(app: &AppHandle) -> Option<Url> {
    if cfg!(dev) {
        app.config().build.dev_url.clone()
    } else {
        "tauri://localhost".parse().ok()
    }
}

/// Starts the watchdog for one attempt. If that attempt is still the current
/// one and nothing has been revealed when the timer ends, ask what to do.
fn spawn_startup_watchdog(app: AppHandle, attempt: u64) {
    std::thread::spawn(move || {
        std::thread::sleep(STARTUP_TIMEOUT);
        offer_recovery(&app, attempt, "frontend did not report ready in time");
    });
}

/// Asks the user to retry or quit, then acts on the answer. Runs on its own
/// thread (the dialog blocks). Never reveals the window: that is only ever
/// `frontend_ready`'s job, so a blank webview can't appear after a failure.
///
/// Retry navigates the webview to the startup URL, which — unlike evaluating
/// `location.reload()` — works when the first navigation never produced a
/// page and so no JavaScript context exists.
fn offer_recovery(app: &AppHandle, attempt: u64, reason: &str) {
    if WINDOW_REVEALED.load(Ordering::SeqCst) || STARTUP_ATTEMPT.load(Ordering::SeqCst) != attempt {
        return;
    }
    if RECOVERY_OPEN.swap(true, Ordering::SeqCst) {
        return;
    }
    log::error!("startup recovery offered: {reason}");
    let choice = startup_notice::ask(
        app,
        "Clutter couldn't start",
        "Clutter didn't finish starting. You can try again or quit.",
        "Retry",
        "Quit",
        || WINDOW_REVEALED.load(Ordering::SeqCst),
    );

    match choice {
        // Startup succeeded (or the app is exiting) while the prompt was up.
        startup_notice::Choice::Cancelled => {
            RECOVERY_OPEN.store(false, Ordering::SeqCst);
            return;
        }
        startup_notice::Choice::Quit => {
            RECOVERY_OPEN.store(false, Ordering::SeqCst);
            app.exit(1);
            return;
        }
        startup_notice::Choice::Retry => {}
    }
    // The page came up while the prompt was open: nothing left to retry.
    if WINDOW_REVEALED.load(Ordering::SeqCst) {
        RECOVERY_OPEN.store(false, Ordering::SeqCst);
        return;
    }
    // Start the new attempt before releasing the prompt slot, so a report or
    // watchdog from the attempt being replaced can't slip in between and open
    // a second prompt.
    let next_attempt = STARTUP_ATTEMPT.fetch_add(1, Ordering::SeqCst) + 1;
    RETRY_PENDING.store(true, Ordering::SeqCst);
    RECOVERY_OPEN.store(false, Ordering::SeqCst);
    match (app.get_webview_window("main"), startup_url(app)) {
        (Some(window), Some(url)) => {
            if let Err(error) = window.navigate(url) {
                log::error!("startup retry: navigation failed: {error}");
            }
            spawn_startup_watchdog(app.clone(), next_attempt);
        }
        _ => {
            log::error!("startup retry: no main window or startup URL");
            app.exit(1);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .on_page_load(|_, payload| {
            if let tauri::webview::PageLoadEvent::Started = payload.event() {
                RETRY_PENDING.store(false, Ordering::SeqCst);
            }
        })
        .on_menu_event(app_menu::handle_event)
        .manage(vault_watcher::VaultWatcherState::default())
        .invoke_handler(tauri::generate_handler![
            frontend_ready,
            frontend_failed,
            app_menu::set_copy_page_link_enabled,
            parse_cache::parse_cache_read,
            parse_cache::parse_cache_write,
            parse_cache::parse_cache_remove,
            space_folder::rename_space_folder,
            vault_asset_scope::allow_vault_asset_scope,
            vault_watcher::start_vault_watcher,
            vault_watcher::stop_vault_watcher,
        ])
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        // After fs: it restores the saved scope into the fs plugin's scope at startup. Only folders the user
        // chose in the native picker are ever added to that scope (JS cannot grant itself access), so only
        // those are persisted.
        .plugin(tauri_plugin_persisted_scope::init())
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
            app_menu::install(app.handle())?;
            spawn_startup_watchdog(app.handle().clone(), STARTUP_ATTEMPT.load(Ordering::SeqCst));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            // An alert owned by the system outlives the app unless cancelled.
            if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
                startup_notice::cancel_active();
            }
        });
}
