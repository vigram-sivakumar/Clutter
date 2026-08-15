use tauri::{AppHandle, Manager};

/// Registers the opened vault root with Tauri's asset protocol scope so
/// `convertFileSrc()` URLs under that directory tree can be served to the
/// webview. Scoped at runtime because the vault path is user-selected.
#[tauri::command]
pub fn allow_vault_asset_scope(app: AppHandle, vault_root: String) -> Result<(), String> {
    let path = std::path::PathBuf::from(vault_root);

    app.asset_protocol_scope()
        .allow_directory(&path, true)
        .map_err(|error| error.to_string())
}
