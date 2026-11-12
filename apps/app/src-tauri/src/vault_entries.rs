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
//! * `trash_path` (ADR-072) moves an entry to the user's Trash instead of deleting it (`macos_trash`). It is authorized by
//!   the same check as `delete_path` (`authorize_removal`: scope, links judged by their own name, Space folders
//!   refused), takes no `recursive` flag, and never falls back to deleting: a failed move leaves the entry and returns
//!   the error. `delete_path` stays a hard delete for internal cleanup and rollback.
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

/// The one authorization both removals share (`delete_path` and `trash_path`), so neither carries a weaker private copy.
/// The entry is judged by its own name; a Space's own folder, or one that contains a Space, is never removed from here
/// (removing a Space from Clutter forgets it). A link is judged by its own name, so removing a link that points at a
/// Space is still allowed.
fn authorize_removal(
    path: &str,
    is_allowed: &dyn Fn(&Path) -> bool,
    is_forbidden: &dyn Fn(&Path) -> bool,
    holds_a_space: &dyn Fn(&Path) -> bool,
) -> Result<PathBuf, String> {
    let resolved = authorize_entry(path, is_allowed, is_forbidden)?;
    if holds_a_space(&resolved) {
        return Err(format!("refused: {path} is a Space, or holds one"));
    }
    Ok(resolved)
}

pub(crate) fn delete_path_in(
    path: &str,
    recursive: bool,
    is_allowed: &dyn Fn(&Path) -> bool,
    is_forbidden: &dyn Fn(&Path) -> bool,
    holds_a_space: &dyn Fn(&Path) -> bool,
) -> Result<(), String> {
    let resolved = authorize_removal(path, is_allowed, is_forbidden, holds_a_space)?;
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

/// Moves one entry of a Space to the user's Trash (ADR-072). Authorized exactly as `delete_path` is. `move_to_trash`
/// is the only thing that touches the entry, and its failure is returned as it is: nothing is deleted instead.
pub(crate) fn trash_path_in(
    path: &str,
    is_allowed: &dyn Fn(&Path) -> bool,
    is_forbidden: &dyn Fn(&Path) -> bool,
    holds_a_space: &dyn Fn(&Path) -> bool,
    move_to_trash: &dyn Fn(&Path) -> Result<PathBuf, String>,
) -> Result<(), String> {
    let resolved = authorize_removal(path, is_allowed, is_forbidden, holds_a_space)?;
    // The same answer `delete_path` gives for an entry that is not there, so a caller treats a missing one alike.
    fs::symlink_metadata(&resolved).map_err(|error| error.to_string())?;
    move_to_trash(&resolved).map(|_| ())
}

/// Moves a file, a folder with everything in it, or a link (the link itself, never its target) to the Trash. It takes
/// no `recursive` flag: the system moves a folder as one unit. Never falls back to deleting: if the Trash cannot take
/// the entry, the entry stays and the error comes back.
#[tauri::command]
pub async fn trash_path<R: Runtime>(app: AppHandle<R>, path: String) -> Result<(), String> {
    let scope = app.fs_scope();
    tauri::async_runtime::spawn_blocking(move || {
        trash_path_in(
            &path,
            &|candidate| scope.is_allowed(candidate),
            &|candidate| scope.is_forbidden(candidate),
            &|candidate| crate::space_access::contains_protected_folder(&app, candidate),
            &crate::macos_trash::move_to_trash,
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

    // ---- trash_path ---------------------------------------------------------------------------------------
    //
    // Authorization and refusals are tested against a fake trasher that records what it was asked to move and touches
    // nothing; the real system call is tested separately (macOS only) with entries that are taken back out of the Trash.

    use std::cell::RefCell;

    /// Runs `trash_path_in` with a trasher that records the path, leaves the entry alone and answers `answer`.
    fn trash_with(vault: &Scratch, path: &str, spaces: &[PathBuf], answer: Result<(), String>) -> (Result<(), String>, Vec<PathBuf>) {
        let asked = RefCell::new(Vec::new());
        let holds = |candidate: &Path| spaces.iter().any(|space| space.starts_with(candidate));
        let trasher = |entry: &Path| {
            asked.borrow_mut().push(entry.to_path_buf());
            answer.clone().map(|_| entry.to_path_buf())
        };
        let result = trash_path_in(path, &in_dir(&vault.0), NOTHING, &holds, &trasher);
        (result, asked.into_inner())
    }

    #[test]
    fn a_file_a_folder_and_a_link_inside_the_space_are_handed_to_the_trash_once_and_not_touched_here() {
        let vault = Scratch::new("trash-ok");
        fs::write(vault.path("note.md"), "x").unwrap();
        fs::create_dir_all(vault.path("full/inner")).unwrap();
        fs::write(vault.path("full/inner/n.md"), "n").unwrap();
        symlink(vault.path("note.md"), vault.path("pointer.md")).unwrap();

        for name in ["note.md", "full", "pointer.md"] {
            let (result, asked) = trash_with(&vault, &vault.text(name), &[], Ok(()));
            assert!(result.is_ok(), "{name}");
            assert_eq!(asked, vec![vault.path(name)], "{name} is named by its own path, a link is not resolved");
        }
        // The fake did not move anything, and nothing here deleted anything either.
        assert!(vault.path("note.md").exists() && vault.path("full/inner/n.md").exists());
    }

    #[test]
    fn a_failed_move_is_returned_unchanged_and_nothing_is_deleted_instead() {
        let vault = Scratch::new("trash-fails");
        fs::write(vault.path("note.md"), "keep").unwrap();
        fs::create_dir_all(vault.path("full")).unwrap();
        fs::write(vault.path("full/n.md"), "keep").unwrap();

        for name in ["note.md", "full"] {
            let (result, asked) = trash_with(&vault, &vault.text(name), &[], Err("no Trash here".into()));
            assert_eq!(result.unwrap_err(), "no Trash here");
            assert_eq!(asked.len(), 1, "one attempt, no retry through another route");
        }

        assert_eq!(fs::read_to_string(vault.path("note.md")).unwrap(), "keep");
        assert_eq!(fs::read_to_string(vault.path("full/n.md")).unwrap(), "keep");
    }

    #[test]
    fn nothing_outside_the_space_a_link_to_the_outside_a_relative_path_or_a_parent_reference_reaches_the_trash() {
        let vault = Scratch::new("trash-scope");
        let outside = Scratch::new("trash-scope-outside");
        fs::write(outside.path("victim.md"), "keep me").unwrap();
        symlink(&outside.0, vault.path("exit")).unwrap();
        let climbing = format!("{}/../{}/victim.md", vault.0.display(), outside.0.file_name().unwrap().to_string_lossy());

        for path in [vault.text("exit/victim.md"), outside.text("victim.md"), climbing, "victim.md".to_string()] {
            let (result, asked) = trash_with(&vault, &path, &[], Ok(()));
            assert!(result.unwrap_err().contains("forbidden path"), "{path}");
            assert!(asked.is_empty(), "{path} was never handed to the trash");
        }
        assert_eq!(fs::read_to_string(outside.path("victim.md")).unwrap(), "keep me");
    }

    #[test]
    fn a_space_root_and_a_folder_that_holds_one_are_never_trashed_but_what_is_inside_a_space_is() {
        let vault = Scratch::new("trash-space-root");
        let space = vault.path("Notes");
        fs::create_dir_all(space.join("Folder")).unwrap();
        fs::write(space.join("note.md"), "keep").unwrap();
        let spaces = [space.clone()];

        for path in [vault.text("Notes"), vault.text("Notes/"), vault.0.to_string_lossy().into_owned()] {
            let (result, asked) = trash_with(&vault, &path, &spaces, Ok(()));
            assert!(result.is_err(), "{path}");
            assert!(asked.is_empty(), "{path} was never handed to the trash");
        }
        let (refused, _) = trash_with(&vault, &vault.text("Notes"), &spaces, Ok(()));
        assert!(refused.unwrap_err().contains("is a Space"));

        for name in ["Notes/note.md", "Notes/Folder"] {
            let (result, asked) = trash_with(&vault, &vault.text(name), &spaces, Ok(()));
            assert!(result.is_ok() && asked.len() == 1, "{name}");
        }
    }

    #[test]
    fn a_link_that_points_at_a_space_can_be_trashed_without_touching_the_space() {
        let vault = Scratch::new("trash-space-link");
        let space = vault.path("Notes");
        fs::create_dir_all(&space).unwrap();
        symlink(&space, vault.path("alias")).unwrap();

        let (result, asked) = trash_with(&vault, &vault.text("alias"), &[space.clone()], Ok(()));

        assert!(result.is_ok());
        assert_eq!(asked, vec![vault.path("alias")]);
        assert!(space.is_dir());
    }

    #[test]
    fn trashing_something_that_is_not_there_reports_it_as_not_found_and_asks_the_trash_for_nothing() {
        let vault = Scratch::new("trash-missing");

        let (result, asked) = trash_with(&vault, &vault.text("nope.md"), &[], Ok(()));

        assert!(result.unwrap_err().contains("No such file or directory"));
        assert!(asked.is_empty());
    }

    /// The real system call, on entries made for the purpose, each taken back out of the Trash at the end. The names
    /// are unique to this run so nothing of the user's is ever matched.
    #[cfg(target_os = "macos")]
    mod real_trash {
        use super::*;
        use crate::macos_trash::move_to_trash;

        fn unique(label: &str) -> String {
            let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
            format!("clutter-adr072-test-{label}-{}-{nanos}", std::process::id())
        }

        /// Removes what this test put in the Trash, by the exact path the system reported, and nothing else.
        fn take_back(trashed: &Path) {
            assert!(trashed.to_string_lossy().contains("clutter-adr072-test-"), "refusing to clean up {trashed:?}");
            if fs::symlink_metadata(trashed).map(|kind| kind.is_dir()).unwrap_or(false) {
                let _ = fs::remove_dir_all(trashed);
            } else {
                let _ = fs::remove_file(trashed);
            }
        }

        #[test]
        fn a_file_and_a_folder_with_contents_move_to_the_trash_and_leave_the_space() {
            let vault = Scratch::new("real-trash");
            let (file, folder) = (unique("file") + ".md", unique("folder"));
            fs::write(vault.path(&file), "hello").unwrap();
            fs::create_dir_all(vault.path(&format!("{folder}/inner"))).unwrap();
            fs::write(vault.path(&format!("{folder}/inner/n.md")), "inner").unwrap();

            let file_in_trash = move_to_trash(&vault.path(&file)).unwrap();
            let folder_in_trash = move_to_trash(&vault.path(&folder)).unwrap();

            assert!(!vault.path(&file).exists() && !vault.path(&folder).exists());
            assert_eq!(fs::read_to_string(&file_in_trash).unwrap(), "hello");
            assert_eq!(fs::read_to_string(folder_in_trash.join("inner/n.md")).unwrap(), "inner");
            assert!(file_in_trash.to_string_lossy().contains(".Trash"), "{file_in_trash:?}");
            take_back(&file_in_trash);
            take_back(&folder_in_trash);
        }

        #[test]
        fn a_name_already_in_the_trash_is_kept_and_both_entries_survive() {
            let vault = Scratch::new("real-trash-twice");
            let name = unique("same") + ".md";
            fs::write(vault.path(&name), "first").unwrap();
            let first = move_to_trash(&vault.path(&name)).unwrap();
            fs::write(vault.path(&name), "second").unwrap();
            let second = move_to_trash(&vault.path(&name)).unwrap();

            assert_ne!(first, second);
            assert_eq!(fs::read_to_string(&first).unwrap(), "first");
            assert_eq!(fs::read_to_string(&second).unwrap(), "second");
            take_back(&first);
            take_back(&second);
        }

        #[test]
        fn a_link_moves_as_the_link_and_its_target_stays() {
            let vault = Scratch::new("real-trash-link");
            let (target, link) = (unique("target") + ".md", unique("link"));
            fs::write(vault.path(&target), "stays").unwrap();
            symlink(vault.path(&target), vault.path(&link)).unwrap();

            let in_trash = move_to_trash(&vault.path(&link)).unwrap();

            assert!(fs::symlink_metadata(vault.path(&link)).is_err());
            assert_eq!(fs::read_to_string(vault.path(&target)).unwrap(), "stays");
            take_back(&in_trash);
        }

        #[test]
        fn an_entry_that_cannot_be_moved_stays_and_is_reported_not_deleted() {
            let vault = Scratch::new("real-trash-denied");
            let name = unique("locked") + ".md";
            let locked = vault.path("locked");
            fs::create_dir_all(&locked).unwrap();
            fs::write(locked.join(&name), "keep").unwrap();
            fs::set_permissions(&locked, std::os::unix::fs::PermissionsExt::from_mode(0o555)).unwrap();

            let error = move_to_trash(&locked.join(&name)).unwrap_err();

            fs::set_permissions(&locked, std::os::unix::fs::PermissionsExt::from_mode(0o755)).unwrap();
            assert!(error.contains("not deleted"), "{error}");
            assert_eq!(fs::read_to_string(locked.join(&name)).unwrap(), "keep");
        }

        #[test]
        fn a_missing_entry_is_reported_as_not_found() {
            let vault = Scratch::new("real-trash-missing");
            let error = move_to_trash(&vault.path("nope.md")).unwrap_err();
            assert!(error.contains("No such file or directory"), "{error}");
        }
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
                .invoke_handler(tauri::generate_handler![create_directory, delete_path, trash_path])
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

    #[test]
    fn through_the_command_nothing_outside_a_space_and_no_registered_space_root_can_be_sent_to_the_trash() {
        let b = Boundary::new("boundary-trash");
        fs::write(b.outside.join("victim.md"), "keep me").unwrap();
        fs::write(b.vault.join("note.md"), "keep me").unwrap();
        symlink(&b.outside, b.vault.join("exit")).unwrap();
        crate::space_access::protect_folder(b._app.handle(), &b.vault);

        assert!(is_forbidden(b.call("trash_path", json!({ "path": b.vault.join("exit/victim.md") }))));
        assert!(is_forbidden(b.call("trash_path", json!({ "path": b.outside.join("victim.md") }))));
        assert!(is_forbidden(b.call("trash_path", json!({ "path": "victim.md" }))));
        let answer = b.call("trash_path", json!({ "path": b.vault }));
        assert!(matches!(&answer, Err(error) if error.as_str().is_some_and(|m| m.contains("is a Space"))), "{answer:?}");

        assert_eq!(fs::read_to_string(b.outside.join("victim.md")).unwrap(), "keep me");
        assert_eq!(fs::read_to_string(b.vault.join("note.md")).unwrap(), "keep me");
    }
}
