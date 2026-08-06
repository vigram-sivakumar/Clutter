mod vault_watcher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(vault_watcher::VaultWatcherState::default())
        .invoke_handler(tauri::generate_handler![
            vault_watcher::start_vault_watcher,
            vault_watcher::stop_vault_watcher,
        ])
        .plugin(tauri_plugin_fs::init())
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
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
