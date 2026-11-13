//! Storage for crash-recovery records (ADR-062): the only writer of `<app data>/recovery/<vault key>/<record>.json`.
//!
//! Records used to be written through the fs plugin's `write_text_file`, which meant the webview held a command that
//! truncates any file under `$HOME/**`, notes included. These two commands replace it with something that cannot name
//! a path: the webview hands over a vault key and a record file name, each one plain path component, and the folder is
//! built here under the application data directory, so they are not general-purpose filesystem access (the same shape
//! as `parse_cache_*`).
//!
//! A write is a complete record or nothing: the text goes to `<record>.tmp` (created exclusively, so a link planted at
//! that name is never followed), is synced, and is renamed over the record, so pre-rename failures leave the
//! earlier record intact. Post-rename directory-sync failures reject protection but may leave the whole new record. The temporary file keeps its fixed name because the journal reads an interrupted
//! `.json.tmp` as recoverable work. A link at the record's own name is replaced, never written through, and a vault
//! key folder that is a link is refused.

use crate::recovery_files::{enumerate_records, remove_record, write_record, RecoveryCatalogEntry};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn recovery_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("recovery"))
        .map_err(|error| error.to_string())
}

/// Replaces `<key>/<name>` with `text`, whole or not at all.
#[tauri::command]
pub async fn recovery_write(
    app: AppHandle,
    key: String,
    name: String,
    text: String,
) -> Result<(), String> {
    let root = recovery_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || write_record(&root, &key, &name, &text))
        .await
        .map_err(|error| error.to_string())?
}

/// Removes `<key>/<name>`; one that is already gone is not an error.
#[tauri::command]
pub async fn recovery_remove(app: AppHandle, key: String, name: String) -> Result<(), String> {
    let root = recovery_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || remove_record(&root, &key, &name))
        .await
        .map_err(|error| error.to_string())?
}

/// App-owned recovery inventory. No registry state or filesystem path is accepted from the webview.
#[tauri::command]
pub async fn recovery_list(app: AppHandle) -> Result<Vec<RecoveryCatalogEntry>, String> {
    let root = recovery_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || enumerate_records(&root))
        .await
        .map_err(|error| error.to_string())?
}
