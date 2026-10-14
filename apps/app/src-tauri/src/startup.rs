//! Startup window handling.
//!
//! There is one native window, `main`, for the whole app lifetime — the
//! welcome screen and the workspace are both React screens inside it, so
//! moving between them never creates a second webview (a fresh webview is
//! blank white until its page loads). Rust only decides the window's shape:
//! the welcome shape (small, fixed) when there's no usable space, the
//! workspace shape (tauri.conf.json's size, resizable) otherwise.
//! `main` is declared with `"create": false` so it can be built in either
//! shape at startup, before any webview exists.
//!
//! The configured space path lives in `<app config dir>/space.json`
//! (`{ "path": "/abs/path" }`) rather than the webview's localStorage because
//! Rust has to read it before any webview is created.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use serde::Deserialize;
use tauri::{AppHandle, LogicalSize, Manager, WebviewWindow, WebviewWindowBuilder};

use crate::vault_watcher::VaultWatcherState;

const SPACE_CONFIG_FILE: &str = "space.json";
const MAIN_WINDOW_LABEL: &str = "main";
const WELCOME_WINDOW_WIDTH: f64 = 620.0;
const WELCOME_WINDOW_HEIGHT: f64 = 620.0;

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

/// Builds the single `main` window: workspace-shaped for a valid space,
/// welcome-shaped otherwise.
pub fn open_startup_window(app: &AppHandle) -> tauri::Result<()> {
    let has_space = match resolve_space(app) {
        SpaceStatus::Ready(_) => true,
        SpaceStatus::NotConfigured => false,
        SpaceStatus::Unavailable(reason) => {
            log::warn!("Not opening workspace: {reason}");
            false
        }
    };

    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == MAIN_WINDOW_LABEL)
        .expect("main window config missing from tauri.conf.json");
    let builder = WebviewWindowBuilder::from_config(app, config)?;
    let window = builder.build()?;
    if !has_space {
        apply_welcome_shape(&window)?;
    }
    Ok(())
}

/// Called by the welcome screen once it has rendered: shrinks the window to
/// the small fixed welcome shape (a no-op at a fresh launch, where it was
/// already built that way).
#[tauri::command]
pub fn show_welcome_shape(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "The window isn't available.".to_string())?;
    apply_welcome_shape(&window).map_err(|error| error.to_string())
}

/// Small, fixed-size window for the welcome screen.
fn apply_welcome_shape(window: &WebviewWindow) -> tauri::Result<()> {
    window.set_resizable(false)?;
    window.set_maximizable(false)?;
    window.set_size(LogicalSize::new(
        WELCOME_WINDOW_WIDTH,
        WELCOME_WINDOW_HEIGHT,
    ))?;
    window.center()
}

/// The workspace window's size and behavior — whatever tauri.conf.json
/// declares for `main`.
fn apply_workspace_shape(app: &AppHandle, window: &WebviewWindow) -> tauri::Result<()> {
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|config| config.label == MAIN_WINDOW_LABEL)
        .expect("main window config missing from tauri.conf.json");
    window.set_resizable(config.resizable)?;
    window.set_maximizable(config.maximizable)?;
    window.set_size(LogicalSize::new(config.width, config.height))?;
    window.center()
}

static RETURNING_TO_WELCOME: AtomicBool = AtomicBool::new(false);

/// Removes `space.json` only if it still points at `root`, so a deleted space
/// is forgotten (and never reopened on the next launch) without touching a
/// different space the user has since configured.
fn clear_space_config_if(config_path: &Path, root: &Path) {
    let configured = std::fs::read_to_string(config_path)
        .ok()
        .and_then(|raw| serde_json::from_str::<SpaceConfig>(&raw).ok());
    if matches!(configured, Some(config) if Path::new(&config.path) == root) {
        let _ = std::fs::remove_file(config_path);
    }
}

/// The open space's folder is gone (deleted, trashed or moved while Clutter
/// was running): forget it, stop watching it, and send the same window back
/// to the welcome screen. Nothing is created — not a replacement space, not
/// the old folder.
pub fn return_to_welcome(app: &AppHandle, root: &Path) {
    if app.get_webview_window(MAIN_WINDOW_LABEL).is_none()
        || RETURNING_TO_WELCOME.swap(true, Ordering::SeqCst)
    {
        return;
    }

    let app = app.clone();
    let root = root.to_path_buf();
    // Off the watcher's own thread: dropping the watcher from inside its own
    // callback would deadlock.
    std::thread::spawn(move || {
        if let Ok(config_path) = space_config_path(&app) {
            clear_space_config_if(&config_path, &root);
        }
        if let Ok(mut watcher) = app.state::<VaultWatcherState>().watcher.lock() {
            *watcher = None;
        }
        if let Some(main) = app.get_webview_window(MAIN_WINDOW_LABEL) {
            // Reload rather than unmount in place: it discards the workspace
            // without running its flush-on-close, which could otherwise write
            // into (and so recreate) the vanished folder. Same window, same
            // webview. The window keeps its size until the welcome screen has
            // painted and asks for the welcome shape (`show_welcome_shape`),
            // so the user never sees a shrunken window before the content.
            let _ = main.eval("window.location.reload()");
        }
        RETURNING_TO_WELCOME.store(false, Ordering::SeqCst);
    });
}

/// Opens `path` as the space: validate the folder, persist it as the
/// configured space and reshape the (one) window for the workspace; the
/// frontend then switches screens
/// (it gets back the validated path that was persisted). On any failure nothing changes — the
/// previous config (if any) is restored and the window stays as it was.
#[tauri::command]
pub async fn open_space(app: AppHandle, path: String) -> Result<String, String> {
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

    let shaped = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "The window isn't available.".to_string())
        .and_then(|window| apply_workspace_shape(&app, &window).map_err(|error| error.to_string()));
    if let Err(error) = shaped {
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
    Ok(space.path)
}

/// The configured space path for the main window's frontend, or `None` if
/// there isn't a usable one (the frontend then shows the welcome screen).
#[tauri::command]
pub fn get_configured_space(app: AppHandle) -> Option<String> {
    match resolve_space(&app) {
        SpaceStatus::Ready(path) => Some(path.to_string_lossy().into_owned()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config_file(label: &str, contents: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "clutter-startup-test-{label}-{}.json",
            std::process::id()
        ));
        std::fs::write(&path, contents).unwrap();
        path
    }

    #[test]
    fn clears_config_that_points_at_the_deleted_space() {
        let config = config_file("match", r#"{"path": "/spaces/a"}"#);
        clear_space_config_if(&config, Path::new("/spaces/a"));
        assert!(!config.exists());
    }

    #[test]
    fn keeps_config_that_points_at_a_different_space() {
        let config = config_file("other", r#"{"path": "/spaces/b"}"#);
        clear_space_config_if(&config, Path::new("/spaces/a"));
        assert!(config.exists());
        std::fs::remove_file(config).unwrap();
    }

    #[test]
    fn tolerates_a_missing_or_malformed_config() {
        clear_space_config_if(Path::new("/nonexistent/space.json"), Path::new("/spaces/a"));
        let config = config_file("bad", "not json");
        clear_space_config_if(&config, Path::new("/spaces/a"));
        assert!(config.exists());
        std::fs::remove_file(config).unwrap();
    }
}
