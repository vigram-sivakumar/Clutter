use std::fs;
use std::io::ErrorKind;
use std::path::Path;

use tauri::{AppHandle, Runtime};
use tauri_plugin_fs::FsExt;

use crate::fs_authorization::authorize_entry;

/// The prefix of the error a refused move returns; the frontend (`LocalFileSystem.moveFile`) turns it into a
/// `DestinationExistsError`.
const EXISTS_PREFIX: &str = "EEXIST";

fn exists_error(to: &Path) -> String {
    format!("{EXISTS_PREFIX}: destination already exists: {}", to.display())
}

fn path_exists(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok()
}

/// Whether `to` is `from` under another spelling of the same name in the same folder (the same file or folder on disk).
#[cfg(unix)]
fn is_case_only_rename(from: &Path, to: &Path) -> bool {
    use std::os::unix::fs::MetadataExt;
    let (Some(from_name), Some(to_name)) = (from.file_name(), to.file_name()) else { return false };
    if from.parent() != to.parent() || from_name == to_name {
        return false;
    }
    if from_name.to_string_lossy().to_lowercase() != to_name.to_string_lossy().to_lowercase() {
        return false;
    }
    match (fs::symlink_metadata(from), fs::symlink_metadata(to)) {
        (Ok(a), Ok(b)) => a.dev() == b.dev() && a.ino() == b.ino(),
        _ => false,
    }
}

#[cfg(not(unix))]
fn is_case_only_rename(_from: &Path, _to: &Path) -> bool {
    false
}

/// Moves `from` to `to` without ever replacing something already at `to`.
///
/// A plain `rename` silently replaces its target, and checking first leaves a window for another move to claim
/// the name. For a file the destination name is therefore claimed with a hard link — creating a link fails if the
/// name exists, atomically — and only then is the source name removed. On a volume that has no hard links the
/// move falls back to a check followed by a rename. A directory is moved only when nothing is at the destination
/// (an empty directory would otherwise be replaced by `rename`).
pub fn move_no_clobber(from: &Path, to: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(from).map_err(|error| error.to_string())?;

    // A rename that only changes the case of the name, on a volume that ignores case, finds "something" at the
    // destination: the source itself. There is nothing to protect, and refusing it would make such a rename
    // impossible, so it is a plain rename.
    if is_case_only_rename(from, to) {
        return fs::rename(from, to).map_err(|error| error.to_string());
    }

    if metadata.is_dir() {
        if path_exists(to) {
            return Err(exists_error(to));
        }
        return fs::rename(from, to).map_err(|error| error.to_string());
    }

    match fs::hard_link(from, to) {
        Ok(()) => {
            if let Err(error) = fs::remove_file(from) {
                // Both names would now exist; undo the claim so the move has not half-happened.
                let _ = fs::remove_file(to);
                return Err(error.to_string());
            }
            Ok(())
        }
        Err(error) if error.kind() == ErrorKind::AlreadyExists => Err(exists_error(to)),
        Err(_) => {
            // No hard links here (or the source cannot be linked): the best available guard.
            if path_exists(to) {
                return Err(exists_error(to));
            }
            fs::rename(from, to).map_err(|error| error.to_string())
        }
    }
}

/// `moveFile(from, to, { noClobber: true })` for the local filesystem. Both paths must be inside the fs scope (see
/// `fs_authorization`: resolved first, so a link inside a granted folder cannot carry the destination out of it, and a
/// link at either path is the entry moved, never followed), and the resolved paths are the ones moved.
#[tauri::command]
pub fn move_file_no_clobber<R: Runtime>(app: AppHandle<R>, from: String, to: String) -> Result<(), String> {
    let scope = app.fs_scope();
    let (allowed, forbidden) = (|path: &Path| scope.is_allowed(path), |path: &Path| scope.is_forbidden(path));
    let from = authorize_entry(&from, &allowed, &forbidden)?;
    let to = authorize_entry(&to, &allowed, &forbidden)?;
    move_no_clobber(&from, &to)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn scratch(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "clutter-move-no-clobber-{label}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_folder_is_never_moved_onto_an_existing_file_or_folder() {
        let root = scratch("folder-collision");
        fs::create_dir(root.join("a")).unwrap();
        fs::write(root.join("a/note.md"), "A").unwrap();
        fs::create_dir(root.join("b")).unwrap();
        fs::write(root.join("c"), "C").unwrap();

        assert!(move_no_clobber(&root.join("a"), &root.join("b")).unwrap_err().starts_with("EEXIST"));
        assert!(move_no_clobber(&root.join("a"), &root.join("c")).unwrap_err().starts_with("EEXIST"));
        assert_eq!(fs::read_to_string(root.join("a/note.md")).unwrap(), "A");
        assert_eq!(fs::read_to_string(root.join("c")).unwrap(), "C");
    }

    #[test]
    fn a_case_only_rename_still_works_and_loses_nothing() {
        let root = scratch("case-only");
        fs::write(root.join("note.md"), "N").unwrap();
        // On a case-sensitive volume the second name is simply free; on APFS it is the same file. Either way it works.
        move_no_clobber(&root.join("note.md"), &root.join("Note.md")).unwrap();

        let names: Vec<String> = fs::read_dir(&root).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
        assert_eq!(names, vec!["Note.md".to_string()]);
        assert_eq!(fs::read_to_string(root.join("Note.md")).unwrap(), "N");
    }

    #[test]
    fn two_different_files_whose_names_differ_only_in_case_are_still_protected() {
        let root = scratch("case-two-files");
        fs::write(root.join("a.md"), "A").unwrap();
        fs::write(root.join("A.md"), "other").unwrap();
        // On a case-insensitive volume the second write replaced the first (one file); only test the protection when
        // both really exist.
        if fs::read_dir(&root).unwrap().count() == 2 {
            assert!(move_no_clobber(&root.join("a.md"), &root.join("A.md")).unwrap_err().starts_with("EEXIST"));
        }
    }

    #[test]
    fn moves_a_file_to_a_free_name() {
        let root = scratch("free");
        fs::write(root.join("a.md"), "A").unwrap();

        move_no_clobber(&root.join("a.md"), &root.join("b.md")).unwrap();

        assert!(!root.join("a.md").exists());
        assert_eq!(fs::read_to_string(root.join("b.md")).unwrap(), "A");
    }

    #[test]
    fn refuses_to_replace_a_file_and_leaves_both_untouched() {
        let root = scratch("file");
        fs::write(root.join("a.md"), "A").unwrap();
        fs::write(root.join("b.md"), "B").unwrap();

        let error = move_no_clobber(&root.join("a.md"), &root.join("b.md")).unwrap_err();

        assert!(error.starts_with("EEXIST"), "{error}");
        assert_eq!(fs::read_to_string(root.join("a.md")).unwrap(), "A");
        assert_eq!(fs::read_to_string(root.join("b.md")).unwrap(), "B");
    }

    #[test]
    fn of_two_moves_to_the_same_name_exactly_one_wins() {
        let root = scratch("race");
        fs::write(root.join("a.md"), "A").unwrap();
        fs::write(root.join("b.md"), "B").unwrap();

        let first = move_no_clobber(&root.join("a.md"), &root.join("Archive.md"));
        let second = move_no_clobber(&root.join("b.md"), &root.join("Archive.md"));

        assert!(first.is_ok());
        assert!(second.unwrap_err().starts_with("EEXIST"));
        assert_eq!(fs::read_to_string(root.join("Archive.md")).unwrap(), "A");
        assert_eq!(fs::read_to_string(root.join("b.md")).unwrap(), "B");
    }

    #[test]
    fn refuses_to_replace_a_directory_even_an_empty_one() {
        let root = scratch("dir");
        fs::create_dir_all(root.join("one/inner")).unwrap();
        fs::create_dir_all(root.join("two")).unwrap();

        let error = move_no_clobber(&root.join("one"), &root.join("two")).unwrap_err();

        assert!(error.starts_with("EEXIST"), "{error}");
        assert!(root.join("one/inner").exists());
    }

    #[test]
    fn moves_a_directory_to_a_free_name() {
        let root = scratch("dir-free");
        fs::create_dir_all(root.join("one/inner")).unwrap();
        fs::write(root.join("one/inner/n.md"), "n").unwrap();

        move_no_clobber(&root.join("one"), &root.join("two")).unwrap();

        assert!(root.join("two/inner/n.md").exists());
        assert!(!root.join("one").exists());
    }

    #[test]
    fn a_missing_source_is_an_error_that_is_not_exists() {
        let root = scratch("missing");

        let error = move_no_clobber(&root.join("nope.md"), &root.join("b.md")).unwrap_err();

        assert!(!error.starts_with("EEXIST"), "{error}");
    }

    // ---- the command boundary (mock runtime, real IPC dispatch, real fs-plugin scope) ----------------------

    use serde_json::{json, Value};
    use tauri::ipc::{CallbackFn, InvokeBody};
    use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, INVOKE_KEY};
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
            let root = fs::canonicalize(scratch(label)).unwrap();
            let (vault, outside) = (root.join("vault"), root.join("outside"));
            fs::create_dir_all(&vault).unwrap();
            fs::create_dir_all(&outside).unwrap();
            let app = mock_builder()
                .plugin(tauri_plugin_fs::init())
                .invoke_handler(tauri::generate_handler![move_file_no_clobber])
                .build(mock_context(noop_assets()))
                .unwrap();
            app.fs_scope().allow_directory(&vault, true).unwrap();
            let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default()).build().unwrap();
            Boundary { root, vault, outside, _app: app, window }
        }

        fn moves(&self, from: &Path, to: &Path) -> Result<Value, Value> {
            get_ipc_response(
                &self.window,
                InvokeRequest {
                    cmd: "move_file_no_clobber".into(),
                    callback: CallbackFn(0),
                    error: CallbackFn(1),
                    url: "tauri://localhost".parse().unwrap(),
                    body: InvokeBody::Json(json!({ "from": from, "to": to })),
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
    fn through_the_command_a_move_inside_a_granted_folder_works_and_a_collision_is_still_refused() {
        let b = Boundary::new("cmd-ok");
        fs::create_dir_all(b.vault.join("Folder")).unwrap();
        fs::write(b.vault.join("a.md"), "A").unwrap();
        fs::write(b.vault.join("taken.md"), "T").unwrap();
        fs::write(b.vault.join("Folder/.folder.md"), "folder note").unwrap();

        assert!(b.moves(&b.vault.join("a.md"), &b.vault.join("b.md")).is_ok());
        assert_eq!(fs::read_to_string(b.vault.join("b.md")).unwrap(), "A");
        let refused = b.moves(&b.vault.join("b.md"), &b.vault.join("taken.md"));
        assert!(refused.unwrap_err().as_str().unwrap().starts_with("EEXIST"));
        assert_eq!(fs::read_to_string(b.vault.join("taken.md")).unwrap(), "T");
        // A folder with a hidden note in it moves whole (the runtime scope hides dot entries from `**`).
        assert!(b.moves(&b.vault.join("Folder"), &b.vault.join("Renamed")).is_ok());
        assert_eq!(fs::read_to_string(b.vault.join("Renamed/.folder.md")).unwrap(), "folder note");
        // A hidden file itself is moved when its folder is granted.
        assert!(b.moves(&b.vault.join("Renamed/.folder.md"), &b.vault.join("Renamed/.moved.md")).is_ok());
    }

    #[test]
    fn through_the_command_nothing_leaves_or_enters_the_granted_folder_by_any_route() {
        let b = Boundary::new("cmd-escape");
        fs::write(b.vault.join("a.md"), "A").unwrap();
        fs::write(b.outside.join("theirs.md"), "THEIRS").unwrap();
        std::os::unix::fs::symlink(&b.outside, b.vault.join("exit")).unwrap();
        let dotdot = PathBuf::from(format!("{}/../outside/Planted.md", b.vault.display()));

        // Out of the folder: directly, with `..`, and through a link inside it (the case a plain scope check misses).
        assert!(is_forbidden(b.moves(&b.vault.join("a.md"), &b.outside.join("Planted.md"))));
        assert!(is_forbidden(b.moves(&b.vault.join("a.md"), &dotdot)));
        assert!(is_forbidden(b.moves(&b.vault.join("a.md"), &b.vault.join("exit/Planted.md"))));
        // Into the folder from outside, directly and through the link.
        assert!(is_forbidden(b.moves(&b.outside.join("theirs.md"), &b.vault.join("Taken.md"))));
        assert!(is_forbidden(b.moves(&b.vault.join("exit/theirs.md"), &b.vault.join("Taken.md"))));
        // A relative path is nothing.
        assert!(is_forbidden(b.moves(Path::new("a.md"), Path::new("b.md"))));

        assert_eq!(fs::read_to_string(b.vault.join("a.md")).unwrap(), "A");
        assert_eq!(fs::read_to_string(b.outside.join("theirs.md")).unwrap(), "THEIRS");
        assert_eq!(fs::read_dir(&b.outside).unwrap().count(), 1, "nothing was planted outside");
        assert!(!b.vault.join("Taken.md").exists());
    }

    #[test]
    fn through_the_command_a_link_is_moved_as_a_link_and_one_pointing_outside_is_refused() {
        let b = Boundary::new("cmd-link-entry");
        fs::write(b.outside.join("target.md"), "TARGET").unwrap();
        fs::write(b.vault.join("inner.md"), "INNER").unwrap();
        std::os::unix::fs::symlink(b.outside.join("target.md"), b.vault.join("pointer.md")).unwrap();
        std::os::unix::fs::symlink(b.vault.join("inner.md"), b.vault.join("alias.md")).unwrap();

        // A link to a file outside the grant is not Clutter's to move (the scope sees where it points).
        assert!(is_forbidden(b.moves(&b.vault.join("pointer.md"), &b.vault.join("renamed-pointer.md"))));
        assert!(fs::symlink_metadata(b.vault.join("pointer.md")).is_ok());
        // A link to a file inside the grant moves as a link: the file it points at stays where it is.
        assert!(b.moves(&b.vault.join("alias.md"), &b.vault.join("alias-moved.md")).is_ok());
        assert!(fs::symlink_metadata(b.vault.join("alias-moved.md")).unwrap().file_type().is_symlink());
        assert_eq!(fs::read_to_string(b.vault.join("inner.md")).unwrap(), "INNER");
        assert_eq!(fs::read_to_string(b.outside.join("target.md")).unwrap(), "TARGET");
        assert_eq!(fs::read_dir(&b.outside).unwrap().count(), 1);
    }
}
