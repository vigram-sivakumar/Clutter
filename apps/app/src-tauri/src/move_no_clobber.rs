use std::fs;
use std::io::ErrorKind;
use std::path::Path;

use tauri::AppHandle;
use tauri_plugin_fs::FsExt;

/// The prefix of the error a refused move returns; the frontend (`LocalFileSystem.moveFile`) turns it into a
/// `DestinationExistsError`.
const EXISTS_PREFIX: &str = "EEXIST";

fn exists_error(to: &Path) -> String {
    format!("{EXISTS_PREFIX}: destination already exists: {}", to.display())
}

fn path_exists(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok()
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

/// `moveFile(from, to, { noClobber: true })` for the local filesystem. Both paths must already be inside the fs
/// scope — the same access the plugin-fs `rename` it replaces is held to — so the webview gains no reach.
#[tauri::command]
pub fn move_file_no_clobber(app: AppHandle, from: String, to: String) -> Result<(), String> {
    let scope = app.fs_scope();
    for path in [&from, &to] {
        if !scope.is_allowed(Path::new(path)) {
            return Err(format!("forbidden path: {path}"));
        }
    }
    move_no_clobber(Path::new(&from), Path::new(&to))
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
}
