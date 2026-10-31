use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_fs::FsExt;

/// The folder to serve through the asset protocol, or why it must not be.
///
/// The asset protocol lets the webview read any file under a granted folder, so a grant is a read permission. This
/// command used to take whatever path the frontend sent (`/`, the home folder, another user's folder), widening reads
/// beyond anything the user chose. A folder is now granted only when it is already inside the runtime fs scope: the
/// folder the user picked in the native dialog, the Space Clutter created, or a Space inside an authorized folder
/// (`space_access::allow` and `create_space_folder` already grant those their asset access when they grant the fs
/// scope). The asset scope can therefore never be larger than the fs scope the user's own choices built.
pub(crate) fn authorize_asset_root(root: &str, in_fs_scope: &dyn Fn(&Path) -> bool) -> Result<PathBuf, String> {
    let path = PathBuf::from(root);
    if !path.is_absolute() {
        return Err(format!("forbidden path: {root}"));
    }
    let canonical = std::fs::canonicalize(&path).map_err(|error| format!("cannot resolve {root}: {error}"))?;
    if !canonical.is_dir() {
        return Err(format!("not a folder: {root}"));
    }
    if !in_fs_scope(&canonical) {
        return Err(format!("forbidden path: {root}"));
    }
    Ok(path)
}

/// Registers the opened vault root with Tauri's asset protocol scope so `convertFileSrc()` URLs under that directory
/// tree can be served to the webview. Scoped at runtime because the vault path is user-selected, and only for a
/// folder the fs scope already grants (see [`authorize_asset_root`]).
#[tauri::command]
pub fn allow_vault_asset_scope<R: Runtime>(app: AppHandle<R>, vault_root: String) -> Result<(), String> {
    let fs_scope = app.fs_scope();
    let path = authorize_asset_root(&vault_root, &|folder| fs_scope.is_allowed(folder))?;

    app.asset_protocol_scope()
        .allow_directory(&path, true)
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    use serde_json::json;
    use tauri::ipc::{CallbackFn, InvokeBody};
    use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, INVOKE_KEY};
    use tauri::webview::InvokeRequest;

    fn scratch(label: &str) -> PathBuf {
        let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let dir = std::fs::canonicalize(std::env::temp_dir()).unwrap().join(format!("clutter-asset-scope-{label}-{}-{nanos}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn only_an_existing_absolute_folder_inside_the_fs_scope_is_accepted() {
        let vault = scratch("accept");
        let outside = scratch("outside");
        std::fs::write(vault.join("file.md"), "x").unwrap();
        let inside = |path: &Path| path.starts_with(&vault);

        assert_eq!(authorize_asset_root(&vault.to_string_lossy(), &inside).unwrap(), vault);
        assert!(authorize_asset_root(&outside.to_string_lossy(), &inside).is_err());
        assert!(authorize_asset_root("/", &inside).is_err());
        assert!(authorize_asset_root("relative/path", &inside).is_err());
        assert!(authorize_asset_root(&vault.join("missing").to_string_lossy(), &inside).is_err());
        assert!(authorize_asset_root(&vault.join("file.md").to_string_lossy(), &inside).is_err());
        let _ = std::fs::remove_dir_all(&vault);
        let _ = std::fs::remove_dir_all(&outside);
    }

    #[test]
    fn a_link_inside_the_vault_that_leads_outside_is_judged_by_where_it_leads() {
        let vault = scratch("link-vault");
        let outside = scratch("link-outside");
        std::os::unix::fs::symlink(&outside, vault.join("link")).unwrap();
        let inside = |path: &Path| path.starts_with(&vault);

        assert!(authorize_asset_root(&vault.join("link").to_string_lossy(), &inside).is_err());
        let _ = std::fs::remove_dir_all(&vault);
        let _ = std::fs::remove_dir_all(&outside);
    }

    #[test]
    fn through_the_real_command_boundary_the_asset_scope_only_ever_grows_by_an_authorized_folder() {
        let vault = scratch("ipc-vault");
        let outside = scratch("ipc-outside");
        let app = mock_builder()
            .plugin(tauri_plugin_fs::init())
            .invoke_handler(tauri::generate_handler![allow_vault_asset_scope])
            .build(mock_context(noop_assets()))
            .expect("the mock app builds");
        app.fs_scope().allow_directory(&vault, true).unwrap();
        let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default()).build().unwrap();
        let call = |root: &Path| {
            get_ipc_response(
                &window,
                InvokeRequest {
                    cmd: "allow_vault_asset_scope".into(),
                    callback: CallbackFn(0),
                    error: CallbackFn(1),
                    url: "tauri://localhost".parse().unwrap(),
                    body: InvokeBody::Json(json!({ "vaultRoot": root })),
                    headers: Default::default(),
                    invoke_key: INVOKE_KEY.to_string(),
                },
            )
        };

        assert!(call(&outside).is_err(), "a folder the user never granted must not be served");
        assert!(call(Path::new("/")).is_err());
        assert!(!app.asset_protocol_scope().is_allowed(outside.join("secret.png")));

        assert!(call(&vault).is_ok());
        std::fs::write(vault.join("cover.png"), "x").unwrap();
        assert!(app.asset_protocol_scope().is_allowed(vault.join("cover.png")));
        assert!(!app.asset_protocol_scope().is_allowed(outside.join("secret.png")));
        let _ = std::fs::remove_dir_all(&vault);
        let _ = std::fs::remove_dir_all(&outside);
    }
}
