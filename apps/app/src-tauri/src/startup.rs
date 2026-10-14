//! Startup window selection.
//!
//! Which window opens is decided here, in `setup`, *before* any webview
//! exists — the `main` window is declared with `"create": false` in
//! tauri.conf.json so Tauri doesn't build it automatically. That way a launch
//! with no usable space never loads (or flashes) the main workspace UI.
//!
//! Both windows are created hidden and shown by the frontend after its first
//! paint (App.tsx), so the user never sees the webview's blank white
//! background. `show_after_timeout` is the safety net if that never happens.
//!
//! The configured space path lives in `<app config dir>/space.json`
//! (`{ "path": "/abs/path" }`) rather than the webview's localStorage because
//! Rust has to read it before any webview is created. Nothing writes this file
//! yet — the onboarding flow will.

use std::path::PathBuf;

use serde::Deserialize;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const SPACE_CONFIG_FILE: &str = "space.json";
const MAIN_WINDOW_LABEL: &str = "main";
const INITIAL_WINDOW_LABEL: &str = "initial";
const INITIAL_WINDOW_WIDTH: f64 = 620.0;
const INITIAL_WINDOW_HEIGHT: f64 = 620.0;

#[derive(Deserialize)]
struct SpaceConfig {
    path: String,
}

pub enum SpaceStatus {
    /// No space has ever been configured (first launch).
    NotConfigured,
    /// A space is recorded but can't be used: unreadable config, or the
    /// directory is missing / inaccessible / not a directory.
    Unavailable(String),
    /// A configured space whose directory exists.
    Ready(PathBuf),
}

fn space_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join(SPACE_CONFIG_FILE))
        .map_err(|error| error.to_string())
}

pub fn resolve_space(app: &AppHandle) -> SpaceStatus {
    let config_path = match space_config_path(app) {
        Ok(path) => path,
        Err(error) => return SpaceStatus::Unavailable(error),
    };

    let raw = match std::fs::read_to_string(&config_path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return SpaceStatus::NotConfigured
        }
        Err(error) => {
            return SpaceStatus::Unavailable(format!("{}: {error}", config_path.display()))
        }
    };

    let config: SpaceConfig = match serde_json::from_str(&raw) {
        Ok(config) => config,
        Err(error) => {
            return SpaceStatus::Unavailable(format!("{}: {error}", config_path.display()))
        }
    };

    let path = PathBuf::from(config.path);
    if path.as_os_str().is_empty() || !path.is_dir() {
        return SpaceStatus::Unavailable(format!(
            "configured space is missing or inaccessible: {}",
            path.display()
        ));
    }

    SpaceStatus::Ready(path)
}

/// Opens the main window for a valid space, otherwise the initial window.
pub fn open_startup_window(app: &AppHandle) -> tauri::Result<()> {
    match resolve_space(app) {
        SpaceStatus::Ready(_) => open_main_window(app)?,
        SpaceStatus::NotConfigured => {
            open_initial_window(app)?;
        }
        SpaceStatus::Unavailable(reason) => {
            log::warn!("Not opening workspace: {reason}");
            open_initial_window(app)?;
        }
    }
    Ok(())
}

fn open_main_window(app: &AppHandle) -> tauri::Result<()> {
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == MAIN_WINDOW_LABEL)
        .expect("main window config missing from tauri.conf.json");
    let window = WebviewWindowBuilder::from_config(app, config)?.build()?;
    show_after_timeout(window);
    Ok(())
}

fn open_initial_window(app: &AppHandle) -> tauri::Result<()> {
    let builder = WebviewWindowBuilder::new(app, INITIAL_WINDOW_LABEL, WebviewUrl::default())
        .title("Clutter")
        .inner_size(INITIAL_WINDOW_WIDTH, INITIAL_WINDOW_HEIGHT)
        .resizable(false)
        .maximizable(false)
        .fullscreen(false)
        .visible(false)
        .center();

    // Same overlay title bar as the main window (see tauri.conf.json).
    #[cfg(target_os = "macos")]
    let builder = builder
        .hidden_title(true)
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .traffic_light_position(tauri::LogicalPosition::new(16.0, 32.0));

    show_after_timeout(builder.build()?);
    Ok(())
}

/// Safety net: if the frontend fails before it can show its window, don't
/// leave the app running with no visible window.
fn show_after_timeout(window: tauri::WebviewWindow) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(5));
        let _ = window.show();
    });
}

/// Welcome screen's "Select a folder": validate the folder, persist it as the
/// configured space, open the main window on it and close the initial window.
/// On any failure nothing changes — the previous config (if any) is restored
/// and the initial window stays open.
#[tauri::command]
pub async fn open_space(app: AppHandle, path: String) -> Result<(), String> {
    let space = crate::space::validate_folder(std::path::Path::new(&path))?;

    let config_path = space_config_path(&app)?;
    let previous = std::fs::read_to_string(&config_path).ok();
    if let Some(dir) = config_path.parent() {
        std::fs::create_dir_all(dir)
            .map_err(|error| format!("Couldn't save your space: {error}"))?;
    }
    std::fs::write(
        &config_path,
        serde_json::json!({ "path": space.path }).to_string(),
    )
    .map_err(|error| format!("Couldn't save your space: {error}"))?;

    if let Err(error) = open_main_window(&app) {
        match previous {
            Some(raw) => {
                let _ = std::fs::write(&config_path, raw);
            }
            None => {
                let _ = std::fs::remove_file(&config_path);
            }
        }
        return Err(format!("Couldn't open that space: {error}"));
    }

    if let Some(initial) = app.get_webview_window(INITIAL_WINDOW_LABEL) {
        let _ = initial.destroy();
    }
    Ok(())
}

/// The configured space path for the main window's frontend, or `None` if
/// there isn't a usable one. The main window only exists when this is `Some`.
#[tauri::command]
pub fn get_configured_space(app: AppHandle) -> Option<String> {
    match resolve_space(&app) {
        SpaceStatus::Ready(path) => Some(path.to_string_lossy().into_owned()),
        _ => None,
    }
}
