use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_fs::FsExt;

/// The fs plugin's runtime scope starts empty. Tauri's deny APIs and the persistence plugin populate it with
/// escaped literal paths and, for directories, a separate glob ending in a separator and `*` or `**`.
/// Tauri exposes the resulting patterns but only accepts literal paths when adding runtime exclusions.
fn exclusion_path(pattern: &str) -> Result<(PathBuf, Option<bool>), std::io::Error> {
    let (literal, recursive) = [("**", true), ("*", false)]
        .into_iter()
        .find_map(|(suffix, recursive)| {
            let literal = pattern.strip_suffix(suffix)?;
            literal.ends_with(std::path::MAIN_SEPARATOR).then_some((literal, Some(recursive)))
        })
        .unwrap_or((pattern, None));
    let mut path = String::with_capacity(literal.len());
    let mut rest = literal;
    while let Some(ch) = rest.chars().next() {
        if let Some(escape) = ["[[]", "[]]", "[?]", "[*]"].into_iter().find(|escape| rest.starts_with(escape)) {
            path.push(char::from(escape.as_bytes()[1]));
            rest = &rest[escape.len()..];
        } else if matches!(ch, '[' | ']' | '?' | '*') {
            return Err(std::io::Error::other(format!("unsupported runtime filesystem exclusion: {pattern}")));
        } else {
            path.push(ch);
            rest = &rest[ch.len_utf8()..];
        }
    }
    Ok((PathBuf::from(path), recursive))
}

fn copy_fs_exclusions(
    fs: &tauri::fs::Scope,
    assets: &tauri::fs::Scope,
    copied: &mut HashSet<String>,
) -> Result<(), Box<dyn std::error::Error>> {
    for pattern in fs.forbidden_patterns() {
        if copied.contains(pattern.as_str()) {
            continue;
        }
        let (path, recursive) = exclusion_path(pattern.as_str())?;
        match recursive {
            Some(recursive) => assets.forbid_directory(path, recursive)?,
            None => assets.forbid_file(path)?,
        }
        copied.insert(pattern.to_string());
    }
    Ok(())
}

/// Keep exclusions on the actual asset protocol scope, including grants made directly by the dialog plugin.
pub(crate) fn asset_exclusions<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("asset-exclusions")
        .setup(|app, _| {
            let fs = app.fs_scope();
            let assets = app.asset_protocol_scope();
            let copied = Mutex::new(HashSet::new());
            copy_fs_exclusions(&fs, &assets, &mut copied.lock().unwrap())?;
            let source = fs.clone();
            fs.listen(move |event| {
                if let tauri::fs::Event::PathForbidden(path) = event {
                    if let Err(error) = copy_fs_exclusions(&source, &assets, &mut copied.lock().unwrap()) {
                        log::error!("Could not mirror filesystem exclusion for {}: {error}", path.display());
                        let _ = assets.forbid_directory(path, true);
                    }
                }
            });
            Ok(())
        })
        .build()
}

/// The folder to serve through the asset protocol, or why it must not be.
///
/// The asset protocol lets the webview read any file under a granted folder, so a grant is a read permission. This
/// command used to take whatever path the frontend sent (`/`, the home folder, another user's folder), widening reads
/// beyond anything the user chose. A folder is now granted only when it is already inside the runtime fs scope: the
/// folder the user picked in the native dialog, the Space Clutter created, or a Space inside an authorized folder
/// (`space_access::allow` and `create_space_folder` already grant those their asset access when they grant the fs
/// scope). Filesystem exclusions are mirrored separately onto the shared asset scope.
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

    // Every opened Space passes through here: its folder is never one `delete_path` may remove.
    crate::space_access::protect_folder(&app, &path);
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
    #[test]
    fn filesystem_exclusions_win_over_asset_grants_and_resolved_aliases() {
        let vault = scratch("deny-vault");
        let outside = scratch("deny-outside");
        let excluded = vault.join("private[*]");
        let flat = vault.join("flat");
        let alias = vault.join("alias");
        let visible = vault.join("cover.png");
        let secret = excluded.join("nested/secret.png");
        let flat_child = flat.join("child.png");
        let flat_deeper = flat.join("nested/allowed.png");
        let elsewhere = outside.join("secret.png");
        for file in [&visible, &secret, &flat_child, &flat_deeper, &elsewhere] {
            std::fs::create_dir_all(file.parent().unwrap()).unwrap();
            std::fs::write(file, "fixture").unwrap();
        }
        std::os::unix::fs::symlink(&visible, &alias).unwrap();

        let app = mock_builder()
            .plugin(tauri_plugin_fs::init())
            .plugin(tauri::plugin::Builder::<_, ()>::new("test-exclusions").setup({
                let excluded = excluded.clone();
                let flat = flat.clone();
                move |app, _| {
                    app.fs_scope().forbid_directory(&excluded, true)?;
                    app.fs_scope().forbid_directory(&flat, false)?;
                    Ok(())
                }
            }).build())
            .plugin(asset_exclusions())
            .invoke_handler(tauri::generate_handler![allow_vault_asset_scope])
            .build(mock_context(noop_assets()))
            .unwrap();
        app.fs_scope().allow_directory(&vault, true).unwrap();
        let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default()).build().unwrap();
        let grant = |path: &Path| get_ipc_response(
            &window,
            InvokeRequest {
                cmd: "allow_vault_asset_scope".into(),
                callback: CallbackFn(0),
                error: CallbackFn(1),
                url: "tauri://localhost".parse().unwrap(),
                body: InvokeBody::Json(json!({ "vaultRoot": path })),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.to_string(),
            },
        );
        assert!(grant(&excluded).is_err());
        assert!(grant(&vault).is_ok());
        let assets = app.asset_protocol_scope();
        assert!(assets.is_allowed(&visible));
        assert!(assets.is_allowed(&alias));
        assert!(assets.is_allowed(&flat_deeper));
        assert!(!assets.is_allowed(&flat_child));
        assert!(!assets.is_allowed(&secret));

        for target in [&secret, &elsewhere] {
            std::fs::remove_file(&alias).unwrap();
            std::os::unix::fs::symlink(target, &alias).unwrap();
            assert!(!assets.is_allowed(&alias));
        }
        app.fs_scope().forbid_file(&visible).unwrap();
        assert!(!assets.is_allowed(&visible));
        std::fs::remove_dir_all(vault).unwrap();
        std::fs::remove_dir_all(outside).unwrap();
    }

}
