//! Creating and deleting the folders and files of a Space on the webview's behalf: `create_directory` and
//! `delete_path`. They replace the fs plugin's `mkdir` and `remove`, which are no longer granted to the webview.
//!
//! The plugin judged a path as written, and for a path that did not exist yet it never resolved a link in a parent, so
//! a directory link inside a Space carried a `mkdir` out of it (reproduced through the real ACL). These commands use
//! the shared authorization (`fs_authorization`): the path must be absolute, with no `..`, inside the runtime fs scope
//! of an authorized Space, and links are resolved before it is judged, so what is judged is what is touched.
//!
//! * `create_directory` resolves the deepest existing ancestor (a new folder's parents may not exist yet). With
//!   `recursive` it is `mkdir -p`; without it, it is `mkdir`, which fails if the name exists, so a folder that appeared
//!   at the name is never entered or merged into.
//! * `delete_path` judges the entry by its own name, never by what it points at: a link is unlinked, never followed,
//!   and a recursive delete removes links inside the folder without touching their targets. A folder is removed only
//!   when it is empty unless `recursive` says otherwise. It never removes a Space's own folder, or a folder that
//!   contains one (`space_access::ProtectedFolders`): forgetting a Space never deletes the user's folder.
//!
//! Limit (shared with the other commands in `fs_authorization`): a check followed by a use is not atomic.

use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Runtime};
use tauri_plugin_fs::FsExt;

use crate::fs_authorization::{authorize_deep, authorize_entry};

pub(crate) fn create_directory_in(
    path: &str,
    recursive: bool,
    is_allowed: &dyn Fn(&Path) -> bool,
    is_forbidden: &dyn Fn(&Path) -> bool,
) -> Result<(), String> {
    let resolved: PathBuf = authorize_deep(path, is_allowed, is_forbidden)?;
    let created = if recursive { fs::create_dir_all(&resolved) } else { fs::create_dir(&resolved) };
    created.map_err(|error| error.to_string())
}

pub(crate) fn delete_path_in(
    path: &str,
    recursive: bool,
    is_allowed: &dyn Fn(&Path) -> bool,
    is_forbidden: &dyn Fn(&Path) -> bool,
    holds_a_space: &dyn Fn(&Path) -> bool,
) -> Result<(), String> {
    let resolved = authorize_entry(path, is_allowed, is_forbidden)?;
    // A Space's own folder, or one that contains a Space, is never deleted from here (removing a Space from Clutter
    // forgets it). A link is judged by its own name, so unlinking a link that points at a Space is still allowed.
    if holds_a_space(&resolved) {
        return Err(format!("refused: {path} is a Space, or holds one"));
    }
    let kind = fs::symlink_metadata(&resolved).map_err(|error| error.to_string())?;
    let removed = if kind.is_dir() {
        if recursive { fs::remove_dir_all(&resolved) } else { fs::remove_dir(&resolved) }
    } else {
        fs::remove_file(&resolved)
    };
    removed.map_err(|error| error.to_string())
}

/// Creates a folder inside an authorized Space; `recursive` also creates the missing parents and accepts an existing one.
#[tauri::command]
pub async fn create_directory<R: Runtime>(app: AppHandle<R>, path: String, recursive: Option<bool>) -> Result<(), String> {
    let scope = app.fs_scope();
    tauri::async_runtime::spawn_blocking(move || {
        create_directory_in(&path, recursive.unwrap_or(false), &|candidate| scope.is_allowed(candidate), &|candidate| scope.is_forbidden(candidate))
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Deletes a file, a link or a folder inside an authorized Space; a folder with contents only with `recursive`.
#[tauri::command]
pub async fn delete_path<R: Runtime>(app: AppHandle<R>, path: String, recursive: Option<bool>) -> Result<(), String> {
    let scope = app.fs_scope();
    tauri::async_runtime::spawn_blocking(move || {
        delete_path_in(
            &path,
            recursive.unwrap_or(false),
            &|candidate| scope.is_allowed(candidate),
            &|candidate| scope.is_forbidden(candidate),
            &|candidate| crate::space_access::contains_protected_folder(&app, candidate),
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct Scratch(PathBuf);

    impl Scratch {
        fn new(label: &str) -> Self {
            let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
            let base = fs::canonicalize(std::env::temp_dir()).unwrap().join(format!("clutter-entries-{label}-{}-{nanos}", std::process::id()));
            fs::create_dir_all(&base).unwrap();
            Scratch(base)
        }
        fn path(&self, name: &str) -> PathBuf {
            self.0.join(name)
        }
        fn text(&self, name: &str) -> String {
            self.path(name).to_string_lossy().into_owned()
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    /// A scope that grants everything below `dir`, dot entries included, and forbids nothing.
    fn in_dir(dir: &Path) -> impl Fn(&Path) -> bool + '_ {
        move |path: &Path| path.starts_with(dir)
    }
    const NOTHING: &dyn Fn(&Path) -> bool = &|_| false;

    fn mkdir(vault: &Scratch, path: &str, recursive: bool) -> Result<(), String> {
        create_directory_in(path, recursive, &in_dir(&vault.0), NOTHING)
    }
    fn delete(vault: &Scratch, path: &str, recursive: bool) -> Result<(), String> {
        delete_path_in(path, recursive, &in_dir(&vault.0), NOTHING, NOTHING)
    }
    /// With `spaces` registered the way the app registers them: a path holds a Space when it is one or contains one.
    fn delete_with_spaces(vault: &Scratch, path: &str, recursive: bool, spaces: &[PathBuf]) -> Result<(), String> {
        let holds = |candidate: &Path| spaces.iter().any(|space| space.starts_with(candidate));
        delete_path_in(path, recursive, &in_dir(&vault.0), NOTHING, &holds)
    }

    // ---- create_directory ---------------------------------------------------------------------------------

    #[test]
    fn creates_a_folder_and_its_missing_parents_inside_the_space_and_accepts_one_that_exists() {
        let vault = Scratch::new("mkdir-ok");

        mkdir(&vault, &vault.text("a/b/c"), true).unwrap();
        mkdir(&vault, &vault.text("a/b/c"), true).unwrap();
        mkdir(&vault, &vault.text(".clutter"), true).unwrap();

        assert!(vault.path("a/b/c").is_dir());
        assert!(vault.path(".clutter").is_dir());
    }

    #[test]
    fn a_folder_that_exists_is_never_entered_when_the_caller_asked_for_a_new_one() {
        let vault = Scratch::new("mkdir-exclusive");
        fs::create_dir_all(vault.path("taken")).unwrap();
        fs::write(vault.path("taken/keep.md"), "mine").unwrap();
        fs::write(vault.path("file"), "x").unwrap();

        let error = mkdir(&vault, &vault.text("taken"), false).unwrap_err();
        assert!(error.contains("File exists") || error.contains("os error 17"), "{error}");
        assert!(mkdir(&vault, &vault.text("file"), false).is_err());
        assert!(mkdir(&vault, &vault.text("file"), true).is_err());
        mkdir(&vault, &vault.text("fresh"), false).unwrap();

        assert_eq!(fs::read_to_string(vault.path("taken/keep.md")).unwrap(), "mine");
        assert!(vault.path("fresh").is_dir());
    }

    #[test]
    fn a_link_to_a_folder_outside_the_space_cannot_carry_a_mkdir_out_of_it() {
        let vault = Scratch::new("mkdir-link");
        let outside = Scratch::new("mkdir-link-outside");
        symlink(&outside.0, vault.path("exit")).unwrap();
        symlink(outside.path("not-there"), vault.path("dangling")).unwrap();

        for target in ["exit/made", "exit/made/deeper", "dangling/made", "exit"] {
            assert!(mkdir(&vault, &vault.text(target), true).is_err(), "recursive {target}");
            assert!(mkdir(&vault, &vault.text(target), false).is_err(), "exclusive {target}");
        }

        assert_eq!(fs::read_dir(&outside.0).unwrap().count(), 0, "nothing was created outside the Space");
    }

    #[test]
    fn a_link_that_stays_inside_the_space_is_followed() {
        let vault = Scratch::new("mkdir-inner-link");
        fs::create_dir_all(vault.path("real")).unwrap();
        symlink(vault.path("real"), vault.path("alias")).unwrap();

        mkdir(&vault, &vault.text("alias/made"), true).unwrap();

        assert!(vault.path("real/made").is_dir());
    }

    #[test]
    fn a_path_outside_the_space_a_relative_path_and_a_parent_reference_are_refused() {
        let vault = Scratch::new("mkdir-scope");
        let outside = Scratch::new("mkdir-scope-outside");

        assert!(mkdir(&vault, &outside.text("made"), true).is_err());
        assert!(mkdir(&vault, "relative/made", true).is_err());
        assert!(mkdir(&vault, &format!("{}/../{}/made", vault.0.display(), outside.0.file_name().unwrap().to_string_lossy()), true).is_err());
        assert!(!outside.path("made").exists());
    }

    // ---- delete_path --------------------------------------------------------------------------------------

    #[test]
    fn deletes_a_file_an_empty_folder_and_a_folder_with_contents_only_when_asked_to() {
        let vault = Scratch::new("delete-ok");
        fs::write(vault.path("note.md"), "x").unwrap();
        fs::create_dir_all(vault.path("empty")).unwrap();
        fs::create_dir_all(vault.path("full/inner")).unwrap();
        fs::write(vault.path("full/inner/n.md"), "n").unwrap();

        delete(&vault, &vault.text("note.md"), false).unwrap();
        delete(&vault, &vault.text("empty"), false).unwrap();
        assert!(delete(&vault, &vault.text("full"), false).is_err());
        assert!(vault.path("full/inner/n.md").exists(), "a folder with contents survives a non-recursive delete");
        delete(&vault, &vault.text("full"), true).unwrap();

        assert!(!vault.path("note.md").exists() && !vault.path("empty").exists() && !vault.path("full").exists());
    }

    #[test]
    fn a_link_is_unlinked_never_followed_and_a_recursive_delete_does_not_reach_through_links_inside() {
        let vault = Scratch::new("delete-link");
        let outside = Scratch::new("delete-link-outside");
        fs::write(outside.path("secret.md"), "keep me").unwrap();
        fs::create_dir_all(outside.path("folder")).unwrap();
        fs::write(outside.path("folder/inner.md"), "keep me too").unwrap();
        symlink(outside.path("secret.md"), vault.path("pointer.md")).unwrap();
        fs::create_dir_all(vault.path("tree")).unwrap();
        symlink(outside.path("folder"), vault.path("tree/exit")).unwrap();

        delete(&vault, &vault.text("pointer.md"), false).unwrap();
        delete(&vault, &vault.text("tree"), true).unwrap();

        assert!(!vault.path("pointer.md").exists() && !vault.path("tree").exists());
        assert_eq!(fs::read_to_string(outside.path("secret.md")).unwrap(), "keep me");
        assert_eq!(fs::read_to_string(outside.path("folder/inner.md")).unwrap(), "keep me too");
    }

    #[test]
    fn a_path_through_a_link_to_the_outside_a_path_outside_the_space_and_a_parent_reference_are_refused() {
        let vault = Scratch::new("delete-scope");
        let outside = Scratch::new("delete-scope-outside");
        fs::write(outside.path("victim.md"), "keep me").unwrap();
        symlink(&outside.0, vault.path("exit")).unwrap();

        assert!(delete(&vault, &vault.text("exit/victim.md"), false).is_err());
        assert!(delete(&vault, &outside.text("victim.md"), false).is_err());
        assert!(delete(&vault, &format!("{}/../{}/victim.md", vault.0.display(), outside.0.file_name().unwrap().to_string_lossy()), false).is_err());
        assert!(delete(&vault, "victim.md", false).is_err());

        assert_eq!(fs::read_to_string(outside.path("victim.md")).unwrap(), "keep me");
    }

    #[test]
    fn a_space_root_and_a_folder_that_holds_one_are_never_deleted_but_what_is_inside_a_space_is() {
        let vault = Scratch::new("delete-space-root");
        let space = vault.path("Notes");
        fs::create_dir_all(space.join("Folder")).unwrap();
        fs::write(space.join("Folder/n.md"), "keep").unwrap();
        fs::write(space.join("note.md"), "keep").unwrap();
        let spaces = [space.clone()];

        for recursive in [false, true] {
            // The Space itself, and the folder around it.
            assert!(delete_with_spaces(&vault, &vault.text("Notes"), recursive, &spaces).unwrap_err().contains("is a Space"));
            assert!(delete_with_spaces(&vault, &vault.0.to_string_lossy(), recursive, &spaces).is_err());
        }
        assert_eq!(fs::read_to_string(space.join("note.md")).unwrap(), "keep");
        assert_eq!(fs::read_to_string(space.join("Folder/n.md")).unwrap(), "keep");

        // Ordinary deletion inside the Space is untouched.
        delete_with_spaces(&vault, &vault.text("Notes/note.md"), false, &spaces).unwrap();
        delete_with_spaces(&vault, &vault.text("Notes/Folder"), true, &spaces).unwrap();
        assert!(space.is_dir() && !space.join("note.md").exists() && !space.join("Folder").exists());
    }

    #[test]
    fn a_link_that_points_at_a_space_can_be_unlinked_without_touching_the_space() {
        let vault = Scratch::new("delete-space-link");
        let space = vault.path("Notes");
        fs::create_dir_all(&space).unwrap();
        fs::write(space.join("note.md"), "keep").unwrap();
        symlink(&space, vault.path("alias")).unwrap();

        delete_with_spaces(&vault, &vault.text("alias"), false, &[space.clone()]).unwrap();

        assert!(!vault.path("alias").exists());
        assert_eq!(fs::read_to_string(space.join("note.md")).unwrap(), "keep");
    }

    #[test]
    fn deleting_something_that_is_not_there_reports_it_as_not_found() {
        let vault = Scratch::new("delete-missing");

        let error = delete(&vault, &vault.text("nope.md"), false).unwrap_err();

        assert!(error.contains("No such file or directory"), "{error}");
    }

    // ---- the command boundary (mock runtime, real IPC dispatch, the real fs-plugin runtime scope) -----------

    use serde_json::{json, Value};
    use tauri::ipc::{CallbackFn, InvokeBody};
    use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, INVOKE_KEY};
    use tauri::Manager;
    use tauri::webview::InvokeRequest;

    struct Boundary {
        root: PathBuf,
        vault: PathBuf,
        outside: PathBuf,
        _app: tauri::App<tauri::test::MockRuntime>,
        window: tauri::WebviewWindow<tauri::test::MockRuntime>,
    }

    impl Boundary {
        fn new(label: &str) -> Self {
            let root = Scratch::new(label);
            let base = root.0.clone();
            std::mem::forget(root);
            let (vault, outside) = (base.join("vault"), base.join("outside"));
            fs::create_dir_all(&vault).unwrap();
            fs::create_dir_all(&outside).unwrap();
            let app = mock_builder()
                .plugin(tauri_plugin_fs::init())
                .invoke_handler(tauri::generate_handler![create_directory, delete_path])
                .build(mock_context(noop_assets()))
                .unwrap();
            app.fs_scope().allow_directory(&vault, true).unwrap();
            app.manage(crate::space_access::ProtectedFolders::default());
            let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default()).build().unwrap();
            Boundary { root: base, vault, outside, _app: app, window }
        }

        fn call(&self, command: &str, args: Value) -> Result<Value, Value> {
            get_ipc_response(
                &self.window,
                InvokeRequest {
                    cmd: command.into(),
                    callback: CallbackFn(0),
                    error: CallbackFn(1),
                    url: "tauri://localhost".parse().unwrap(),
                    body: InvokeBody::Json(args),
                    headers: Default::default(),
                    invoke_key: INVOKE_KEY.to_string(),
                },
            )
            .map(|body| body.deserialize::<Value>().unwrap())
        }
    }

    impl Drop for Boundary {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    fn is_forbidden(result: Result<Value, Value>) -> bool {
        matches!(result, Err(error) if error.as_str().is_some_and(|message| message.contains("forbidden path")))
    }

    #[test]
    fn through_the_command_a_space_can_make_and_delete_and_nothing_outside_it_can_be_reached() {
        let b = Boundary::new("boundary");
        fs::write(b.outside.join("victim.md"), "keep me").unwrap();
        symlink(&b.outside, b.vault.join("exit")).unwrap();
        fs::write(b.vault.join("note.md"), "x").unwrap();

        b.call("create_directory", json!({ "path": b.vault.join("a/b"), "recursive": true })).unwrap();
        assert!(b.vault.join("a/b").is_dir());
        b.call("delete_path", json!({ "path": b.vault.join("note.md") })).unwrap();
        assert!(!b.vault.join("note.md").exists());

        assert!(is_forbidden(b.call("create_directory", json!({ "path": b.vault.join("exit/made"), "recursive": true }))));
        assert!(is_forbidden(b.call("create_directory", json!({ "path": b.outside.join("made"), "recursive": true }))));
        assert!(is_forbidden(b.call("delete_path", json!({ "path": b.vault.join("exit/victim.md") }))));
        assert!(is_forbidden(b.call("delete_path", json!({ "path": b.outside.join("victim.md") }))));
        assert!(!b.outside.join("made").exists());
        assert_eq!(fs::read_to_string(b.outside.join("victim.md")).unwrap(), "keep me");
    }

    #[test]
    fn through_the_command_a_registered_space_root_cannot_be_deleted_whatever_the_script_asks() {
        let b = Boundary::new("boundary-root");
        fs::write(b.vault.join("note.md"), "keep me").unwrap();
        crate::space_access::protect_folder(b._app.handle(), &b.vault);

        for recursive in [false, true] {
            let answer = b.call("delete_path", json!({ "path": b.vault, "recursive": recursive }));
            assert!(matches!(&answer, Err(error) if error.as_str().is_some_and(|m| m.contains("is a Space"))), "{answer:?}");
        }

        assert_eq!(fs::read_to_string(b.vault.join("note.md")).unwrap(), "keep me");
        b.call("delete_path", json!({ "path": b.vault.join("note.md") })).unwrap();
        assert!(b.vault.is_dir() && !b.vault.join("note.md").exists());
    }
}
