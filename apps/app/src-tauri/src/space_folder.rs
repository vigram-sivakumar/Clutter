use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};
use tauri_plugin_fs::FsExt;

const MAX_NAME_BYTES: usize = 255;

/// The rules of `isValidSpaceFolderName` (src/core/vault/ingest/spaceFolderName.ts), re-checked here because
/// this is the code that touches the disk: one path component, never `.`/`..`, no separators or control
/// characters.
fn is_valid_name(name: &str) -> bool {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
        return false;
    }
    if trimmed
        .chars()
        .any(|c| matches!(c, '/' | '\\' | ':') || (c as u32) < 0x20)
    {
        return false;
    }
    trimmed.len() <= MAX_NAME_BYTES
}

/// Whether two paths are the same directory entry (a case-only rename on a case-insensitive volume makes
/// the "new" path name the old folder itself).
#[cfg(unix)]
fn is_same_entry(a: &Path, b: &Path) -> bool {
    use std::os::unix::fs::MetadataExt;
    match (fs::metadata(a), fs::metadata(b)) {
        (Ok(a), Ok(b)) => a.dev() == b.dev() && a.ino() == b.ino(),
        _ => false,
    }
}

#[cfg(not(unix))]
fn is_same_entry(a: &Path, b: &Path) -> bool {
    match (fs::canonicalize(a), fs::canonicalize(b)) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

/// Renames the folder at `old` to `new_name` inside its own parent, never replacing anything. The name is
/// claimed first with a non-recursive `create_dir` — exclusive, so an existing file or folder of that name is
/// refused with no check-then-act race — and the old folder is then renamed over that empty directory (removed
/// again if the rename fails). Errors are the operating system's own, so a permission or read-only-volume
/// failure reaches the user as it is.
pub fn rename_in_place(old: &Path, new_name: &str) -> Result<PathBuf, String> {
    if !is_valid_name(new_name) {
        return Err("Enter a name without slashes or colons".into());
    }
    let parent = old
        .parent()
        .ok_or_else(|| "That folder can’t be renamed".to_string())?;
    let new = parent.join(new_name.trim());
    if new == old {
        return Ok(new);
    }
    let is_dir = fs::symlink_metadata(old)
        .map(|metadata| metadata.is_dir())
        .map_err(|error| error.to_string())?;
    if !is_dir {
        return Err("That is not a folder".into());
    }
    match fs::create_dir(&new) {
        Ok(()) => {}
        Err(error)
            if error.kind() == std::io::ErrorKind::AlreadyExists && is_same_entry(old, &new) =>
        {
            fs::rename(old, &new).map_err(|error| error.to_string())?;
            return Ok(new);
        }
        Err(error) => return Err(error.to_string()),
    }
    if let Err(error) = fs::rename(old, &new) {
        let _ = fs::remove_dir(&new);
        return Err(error.to_string());
    }
    Ok(new)
}

/// Renames a Space's folder in place and carries its access with it. Only a folder the fs scope already
/// allows can be renamed (`$HOME/**`, or the user's own picker grant), so the webview cannot name a folder it
/// has no access to; the destination is derived (same parent, one validated name), never supplied; and the new
/// path is granted exactly as the old one was (the folder itself, recursively) — nothing wider. The plugin-fs
/// `rename` cannot do this outside `$HOME`: it checks the destination path too, which no grant covers.
#[tauri::command]
pub fn rename_space_folder(
    app: AppHandle,
    path: String,
    new_name: String,
) -> Result<String, String> {
    let old = PathBuf::from(&path);
    let scope = app.fs_scope();
    if !scope.is_allowed(&old) {
        return Err(format!("forbidden path: {path}"));
    }
    let new = rename_in_place(&old, &new_name)?;
    if new != old {
        if let Err(error) = scope.allow_directory(&new, true) {
            // The folder can't be reached under its new name, so put it back rather than strand it.
            let _ = fs::rename(&new, &old);
            return Err(error.to_string());
        }
        let _ = app.asset_protocol_scope().allow_directory(&new, true);
    }
    Ok(new.to_string_lossy().into_owned())
}

/// Creates `<documents>/<name>` for a new Space and grants **exactly that folder** to the runtime fs scope through
/// `grant` (in the app, `fs_scope().allow_directory(path, true)`, the same grant the native folder picker makes and
/// the one the persisted-scope plugin saves for the next launch). Creation and grant are one operation: if the grant
/// fails the folder this call just made is removed again, so a Space is never left created but unusable.
///
/// The folder is made non-recursively and exclusively, so an existing name is refused (never adopted) with no
/// check-then-create race, and `documents` itself is never created as a side effect. Errors are the operating
/// system's own wording, which the frontend already classifies.
pub fn create_space_in(
    documents: &Path,
    name: &str,
    grant: &dyn Fn(&Path) -> Result<(), String>,
) -> Result<PathBuf, String> {
    if !is_valid_name(name) {
        return Err("Enter a name without slashes or colons".into());
    }
    let folder = documents.join(name.trim());
    fs::create_dir(&folder).map_err(|error| error.to_string())?;
    if let Err(error) = grant(&folder) {
        let _ = fs::remove_dir(&folder);
        return Err(error);
    }
    Ok(folder)
}

/// Whether `path` is a Space folder Clutter itself made available before: a real (not symlinked) direct child of
/// `documents` that holds a real `.clutter` directory, the marker Clutter writes when it opens a Space.
fn is_space_in_documents(documents: &Path, path: &Path) -> bool {
    let Ok(documents) = fs::canonicalize(documents) else {
        return false;
    };
    // `path` must itself be a directory entry, not a link to one elsewhere.
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_dir() => {}
        _ => return false,
    }
    let Ok(canonical) = fs::canonicalize(path) else {
        return false;
    };
    if canonical.parent() != Some(documents.as_path()) {
        return false;
    }
    matches!(fs::symlink_metadata(canonical.join(".clutter")), Ok(metadata) if metadata.is_dir())
}

/// Restores the runtime grant for a Space created before `create_space_folder` existed: those were made with a plain
/// plugin `mkdir`, so nothing ever added them to the runtime scope (the fs plugin could reach them through the static
/// `$HOME/**` capability; `rename_space_folder`, `move_file_no_clobber` and the atomic commands could not).
///
/// Narrow by construction: only a direct child of Documents that already holds a `.clutter` directory is granted, and
/// only that folder. Anything else (a picked Space, which the picker already granted and the persisted-scope plugin
/// restores; a folder with no marker; a link) is left exactly as it was. Returns whether a grant was made. It adds no
/// reach the webview did not already have through the fs plugin's static scope; it makes the native commands agree
/// with it for these folders.
pub fn ensure_space_access_in(
    documents: &Path,
    path: &Path,
    is_allowed: &dyn Fn(&Path) -> bool,
    grant: &dyn Fn(&Path) -> Result<(), String>,
) -> Result<bool, String> {
    if is_allowed(path) || !is_space_in_documents(documents, path) {
        return Ok(false);
    }
    grant(path)?;
    Ok(true)
}

/// The real path of `path` with every link resolved, or an error if it does not exist. Lets the interface refuse a
/// Space that is reached through a symbolic link: the filesystem watcher reports resolved paths, so a Space opened
/// through a link would receive no change events at all (ADR-063, Stage 2b real-app finding).
#[tauri::command]
pub async fn canonical_space_path(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        fs::canonicalize(&path)
            .map(|resolved| resolved.to_string_lossy().into_owned())
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Creates a new Space's folder in the user's Documents and grants it (see [`create_space_in`]). The only place a
/// Space folder is created.
#[tauri::command]
pub async fn create_space_folder(app: AppHandle, name: String) -> Result<String, String> {
    let documents = app.path().document_dir().map_err(|error| error.to_string())?;
    let scope = app.fs_scope();
    let folder = tauri::async_runtime::spawn_blocking(move || {
        create_space_in(&documents, &name, &|folder| {
            scope.allow_directory(folder, true).map_err(|error| error.to_string())
        })
    })
    .await
    .map_err(|error| error.to_string())??;
    // A created Space also serves its cover images through the asset protocol, as `allow_vault_asset_scope` would.
    let _ = app.asset_protocol_scope().allow_directory(&folder, true);
    Ok(folder.to_string_lossy().into_owned())
}

/// Grants an already-created Space its runtime access when it is opened (see [`ensure_space_access_in`]).
#[tauri::command]
pub async fn ensure_space_access(app: AppHandle, path: String) -> Result<bool, String> {
    let documents = app.path().document_dir().map_err(|error| error.to_string())?;
    let scope = app.fs_scope();
    tauri::async_runtime::spawn_blocking(move || {
        ensure_space_access_in(
            &documents,
            Path::new(&path),
            &|candidate| scope.is_allowed(candidate),
            &|folder| scope.allow_directory(folder, true).map_err(|error| error.to_string()),
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "clutter-space-folder-{label}-{}-{}",
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
    fn renames_in_place_and_keeps_the_contents() {
        let root = scratch("rename");
        let old = root.join("Notes");
        fs::create_dir_all(old.join(".clutter")).unwrap();
        fs::write(old.join("a.md"), "hello").unwrap();
        fs::write(old.join(".clutter/workspace.json"), "{}").unwrap();

        let new = rename_in_place(&old, "  Journal ").unwrap();

        assert_eq!(new, root.join("Journal"));
        assert!(!old.exists());
        assert_eq!(fs::read_to_string(new.join("a.md")).unwrap(), "hello");
        assert!(new.join(".clutter/workspace.json").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn never_replaces_an_existing_folder_or_file() {
        let root = scratch("conflict");
        let old = root.join("Notes");
        fs::create_dir_all(&old).unwrap();
        fs::write(old.join("a.md"), "mine").unwrap();
        let taken_folder = root.join("Taken");
        fs::create_dir_all(&taken_folder).unwrap(); // empty: a plain rename would replace it
        fs::write(root.join("TakenFile"), "x").unwrap();

        assert!(rename_in_place(&old, "Taken").unwrap_err().contains("exists"));
        assert!(rename_in_place(&old, "TakenFile").is_err());

        assert_eq!(fs::read_to_string(old.join("a.md")).unwrap(), "mine");
        assert!(taken_folder.is_dir());
        assert_eq!(fs::read_to_string(root.join("TakenFile")).unwrap(), "x");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn refuses_names_that_could_leave_the_parent_and_touches_nothing() {
        let root = scratch("names");
        let old = root.join("Notes");
        fs::create_dir_all(&old).unwrap();

        for name in ["", "   ", ".", "..", "../escape", "a/b", "a\\b", "a:b", "a\u{0}b"] {
            assert!(rename_in_place(&old, name).is_err(), "{name:?}");
        }
        assert!(rename_in_place(&old, &"x".repeat(256)).is_err());

        assert!(old.is_dir());
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn an_unchanged_name_is_a_no_op() {
        let root = scratch("same");
        let old = root.join("Notes");
        fs::create_dir_all(&old).unwrap();

        assert_eq!(rename_in_place(&old, " Notes ").unwrap(), old);
        assert!(old.is_dir());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn refuses_a_file_and_a_missing_folder() {
        let root = scratch("kinds");
        fs::write(root.join("file.txt"), "x").unwrap();

        assert!(rename_in_place(&root.join("file.txt"), "Other").is_err());
        assert!(rename_in_place(&root.join("gone"), "Other").is_err());
        assert!(!root.join("Other").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn reports_the_operating_systems_own_permission_error() {
        use std::os::unix::fs::PermissionsExt;
        let root = scratch("denied");
        let old = root.join("Notes");
        fs::create_dir_all(&old).unwrap();
        fs::set_permissions(&root, fs::Permissions::from_mode(0o555)).unwrap();

        let result = rename_in_place(&old, "Journal");

        fs::set_permissions(&root, fs::Permissions::from_mode(0o755)).unwrap();
        if let Err(message) = result {
            assert!(message.contains("os error 13") || message.contains("ermission"), "{message}");
            assert!(old.is_dir());
            assert!(!root.join("Journal").exists());
        } // (running as root ignores the mode; nothing to assert then)
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rename_in_place_is_the_only_rename_the_command_performs() {
        // The command derives the destination from the old path's own parent, so it can never move a folder.
        let root = scratch("derive");
        let old = root.join("Notes");
        fs::create_dir_all(&old).unwrap();

        let new = rename_in_place(&old, "Journal").unwrap();

        assert_eq!(new.parent(), old.parent());
        fs::remove_dir_all(root).unwrap();
    }

    // ---- Space creation and access (Stage 2b-ii hardening) ------------------------------------------------

    use std::cell::RefCell;

    #[test]
    fn creating_a_space_makes_the_folder_and_grants_exactly_that_folder() {
        let documents = scratch("create");
        let granted = RefCell::new(Vec::<PathBuf>::new());

        let folder = create_space_in(&documents, "  Personal ", &|path| {
            granted.borrow_mut().push(path.to_path_buf());
            Ok(())
        })
        .unwrap();

        assert_eq!(folder, documents.join("Personal"));
        assert!(folder.is_dir());
        assert_eq!(*granted.borrow(), vec![documents.join("Personal")]);
        fs::remove_dir_all(documents).unwrap();
    }

    #[test]
    fn a_failed_grant_removes_the_folder_it_just_made() {
        let documents = scratch("create-grant-fails");

        let error = create_space_in(&documents, "Personal", &|_| Err("no grant".into())).unwrap_err();

        assert_eq!(error, "no grant");
        assert!(!documents.join("Personal").exists());
        fs::remove_dir_all(documents).unwrap();
    }

    #[test]
    fn creating_never_adopts_an_existing_name_and_never_grants_it() {
        let documents = scratch("create-taken");
        fs::create_dir_all(documents.join("Taken")).unwrap();
        fs::write(documents.join("Taken/keep.md"), "mine").unwrap();
        fs::write(documents.join("TakenFile"), "x").unwrap();
        let granted = RefCell::new(0);

        for name in ["Taken", "TakenFile"] {
            let error = create_space_in(&documents, name, &|_| {
                *granted.borrow_mut() += 1;
                Ok(())
            })
            .unwrap_err();
            assert!(error.contains("exists"), "{error}");
        }

        assert_eq!(*granted.borrow(), 0);
        assert_eq!(fs::read_to_string(documents.join("Taken/keep.md")).unwrap(), "mine");
        fs::remove_dir_all(documents).unwrap();
    }

    #[test]
    fn creating_refuses_names_that_could_leave_documents_and_touches_nothing() {
        let documents = scratch("create-names");
        let outside = documents.parent().unwrap().join(format!("{}-outside", documents.file_name().unwrap().to_string_lossy()));
        let granted = RefCell::new(0);

        for name in ["", "  ", ".", "..", "../escape", "a/b", "/abs", "a\\b", "a:b", "a\u{0}b", &"x".repeat(256)] {
            assert!(create_space_in(&documents, name, &|_| { *granted.borrow_mut() += 1; Ok(()) }).is_err(), "{name:?}");
        }

        assert_eq!(*granted.borrow(), 0);
        assert!(!outside.exists());
        assert_eq!(fs::read_dir(&documents).unwrap().count(), 0);
        fs::remove_dir_all(documents).unwrap();
    }

    #[test]
    fn a_missing_documents_folder_is_not_created_as_a_side_effect() {
        let root = scratch("create-no-documents");
        let documents = root.join("Documents");

        assert!(create_space_in(&documents, "Personal", &|_| Ok(())).is_err());

        assert!(!documents.exists());
        fs::remove_dir_all(root).unwrap();
    }

    fn space(documents: &Path, name: &str) -> PathBuf {
        let path = documents.join(name);
        fs::create_dir_all(path.join(".clutter")).unwrap();
        path
    }

    #[test]
    fn an_existing_created_space_gets_its_own_grant_and_only_that() {
        let documents = scratch("ensure");
        let notes = space(&documents, "Notes");
        let granted = RefCell::new(Vec::<PathBuf>::new());

        let did = ensure_space_access_in(&documents, &notes, &|_| false, &|path| {
            granted.borrow_mut().push(path.to_path_buf());
            Ok(())
        })
        .unwrap();

        assert!(did);
        assert_eq!(*granted.borrow(), vec![notes]);
        fs::remove_dir_all(documents).unwrap();
    }

    #[test]
    fn a_space_that_is_already_allowed_is_not_granted_again() {
        let documents = scratch("ensure-allowed");
        let notes = space(&documents, "Notes");
        let calls = RefCell::new(0);

        let did = ensure_space_access_in(&documents, &notes, &|_| true, &|_| {
            *calls.borrow_mut() += 1;
            Ok(())
        })
        .unwrap();

        assert!(!did);
        assert_eq!(*calls.borrow(), 0);
        fs::remove_dir_all(documents).unwrap();
    }

    #[test]
    fn nothing_but_a_marked_direct_child_of_documents_is_ever_granted() {
        let root = scratch("ensure-refused");
        let documents = root.join("Documents");
        fs::create_dir_all(&documents).unwrap();
        let calls = RefCell::new(0);
        let attempt = |path: &Path| {
            ensure_space_access_in(&documents, path, &|_| false, &|_| {
                *calls.borrow_mut() += 1;
                Ok(())
            })
            .unwrap()
        };

        fs::create_dir_all(documents.join("Unmarked")).unwrap(); // a folder with no `.clutter`
        assert!(!attempt(&documents.join("Unmarked")));
        let nested = space(&documents.join("Unmarked"), "Inner"); // a grandchild of Documents
        assert!(!attempt(&nested));
        let elsewhere = space(&root, "Elsewhere"); // a Space outside Documents
        assert!(!attempt(&elsewhere));
        assert!(!attempt(&documents)); // Documents itself
        assert!(!attempt(&root)); // a parent of Documents
        assert!(!attempt(&documents.join("Missing"))); // nothing there
        std::os::unix::fs::symlink(&elsewhere, documents.join("Link")).unwrap(); // a link to a Space elsewhere
        assert!(!attempt(&documents.join("Link")));
        fs::write(documents.join("File"), "x").unwrap(); // a file
        assert!(!attempt(&documents.join("File")));
        fs::create_dir_all(documents.join("MarkerIsFile")).unwrap(); // `.clutter` is not a directory
        fs::write(documents.join("MarkerIsFile/.clutter"), "x").unwrap();
        assert!(!attempt(&documents.join("MarkerIsFile")));
        fs::create_dir_all(documents.join("MarkerIsLink")).unwrap(); // `.clutter` is a link to a directory
        std::os::unix::fs::symlink(&elsewhere, documents.join("MarkerIsLink/.clutter")).unwrap();
        assert!(!attempt(&documents.join("MarkerIsLink")));
        assert!(!attempt(&documents.join("Notes/../Unmarked"))); // a traversal spelling

        assert_eq!(*calls.borrow(), 0);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_failed_grant_is_reported_not_swallowed() {
        let documents = scratch("ensure-grant-fails");
        let notes = space(&documents, "Notes");

        let error = ensure_space_access_in(&documents, &notes, &|_| false, &|_| Err("denied".into())).unwrap_err();

        assert_eq!(error, "denied");
        fs::remove_dir_all(documents).unwrap();
    }

    #[test]
    fn a_path_through_a_symlink_resolves_to_the_real_folder() {
        let root = scratch("canonical");
        let real = root.join("Real");
        fs::create_dir_all(&real).unwrap();
        std::os::unix::fs::symlink(&real, root.join("Link")).unwrap();

        let through_link = tauri::async_runtime::block_on(canonical_space_path(root.join("Link").to_string_lossy().into_owned())).unwrap();
        let direct = tauri::async_runtime::block_on(canonical_space_path(real.to_string_lossy().into_owned())).unwrap();

        assert_eq!(through_link, direct);
        assert_ne!(through_link, root.join("Link").to_string_lossy());
        assert!(tauri::async_runtime::block_on(canonical_space_path(root.join("Missing").to_string_lossy().into_owned())).is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
