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
}
