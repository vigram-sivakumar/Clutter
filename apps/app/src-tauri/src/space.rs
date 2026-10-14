//! Folder-level space selection for the welcome screen.
//!
//! `validate_folder` is read-only (used by `startup::open_space` and
//! `validate_space_folder`) and
//! `get_default_space_parent` only reports where new spaces go.
//! Nothing is written inside a space and nothing is persisted here (that's
//! `startup::open_space`). Per ADR-030 no reserved resource (`.clutter`,
//! `Daily Notes`, …) is materialized up front; they appear lazily when a
//! feature first needs them.
//!
//! Done in Rust rather than via the JS fs plugin because the folder picker can
//! return paths outside the plugin's `$HOME` scope.

use std::fs;
use std::io::ErrorKind;
use std::path::Path;

use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize)]
pub struct SpaceFolder {
    pub path: String,
    pub name: String,
}

fn describe(path: &Path) -> SpaceFolder {
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned());
    SpaceFolder {
        path: path.to_string_lossy().into_owned(),
        name,
    }
}

/// Read-only checks: the path is an existing, listable, writable directory.
pub fn validate_folder(path: &Path) -> Result<SpaceFolder, String> {
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("Couldn't open that folder: {error}"))?;

    let metadata =
        fs::metadata(&canonical).map_err(|error| format!("Couldn't read that folder: {error}"))?;
    if !metadata.is_dir() {
        return Err("The selected item isn't a folder.".to_string());
    }
    if metadata.permissions().readonly() {
        return Err("That folder is read-only, so it can't be used as a space.".to_string());
    }
    fs::read_dir(&canonical)
        .map_err(|error| format!("Couldn't read the contents of that folder: {error}"))?;

    Ok(describe(&canonical))
}

const MAX_FOLDER_NAME_BYTES: usize = 255;

/// The trimmed name if it's usable as a single folder name. Mirrors the
/// frontend's `isValidSpaceName`, but this is the authority: it also keeps a
/// name like `../x` from escaping the parent folder.
fn validate_folder_name(name: &str) -> Result<&str, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
        return Err("Enter a name for your space.".to_string());
    }
    if trimmed
        .chars()
        .any(|c| c == '/' || c == '\\' || c == ':' || c.is_control())
    {
        return Err("A name can't contain / \\ : or control characters.".to_string());
    }
    if trimmed.len() > MAX_FOLDER_NAME_BYTES {
        return Err("That name is too long.".to_string());
    }
    Ok(trimmed)
}

/// Creates `<parent>/<name>`, or — if a folder is already there — uses it as
/// is. `create_dir` never touches an existing entry, so nothing existing is
/// overwritten or modified, and the name is never changed or suffixed. A
/// non-folder (e.g. a file) with that name is an error.
fn create_space_folder_in(parent: &Path, name: &str) -> Result<SpaceFolder, String> {
    let name = validate_folder_name(name)?;
    let parent = validate_folder(parent)?;
    let target = Path::new(&parent.path).join(name);

    match fs::create_dir(&target) {
        Ok(()) => Ok(describe(&target)),
        Err(error) if error.kind() == ErrorKind::AlreadyExists => {
            if target.is_dir() {
                Ok(describe(&target))
            } else {
                Err(format!(
                    "\"{name}\" exists in {} but isn't a folder.",
                    parent.name
                ))
            }
        }
        Err(error) => Err(format!("Couldn't create the folder: {error}")),
    }
}

/// SpaceDetails' Create button: creates the new space's folder (or reuses an
/// existing one) and returns it.
#[tauri::command]
pub async fn create_space_folder(parent_path: String, name: String) -> Result<SpaceFolder, String> {
    create_space_folder_in(Path::new(&parent_path), &name)
}

/// Read-only check of a user-picked folder, returning its canonical path and
/// name (used by SpaceDetails' Change button to pick the parent folder).
#[tauri::command]
pub async fn validate_space_folder(path: String) -> Result<SpaceFolder, String> {
    validate_folder(Path::new(&path))
}

/// Where a new space will be created (the user's Documents folder). Read-only:
/// nothing is created until the user confirms the new space.
#[tauri::command]
pub async fn get_default_space_parent(app: AppHandle) -> Result<SpaceFolder, String> {
    let documents = app
        .path()
        .document_dir()
        .map_err(|error| format!("Couldn't locate your Documents folder: {error}"))?;
    Ok(describe(&documents))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch_dir(label: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "clutter-space-test-{label}-{}-{}",
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
    fn validates_existing_folder_without_modifying_it() {
        let dir = scratch_dir("validate");
        fs::write(dir.join("note.md"), "keep me").unwrap();

        let space = validate_folder(&dir).unwrap();

        assert_eq!(space.name, dir.file_name().unwrap().to_string_lossy());
        assert_eq!(fs::read_to_string(dir.join("note.md")).unwrap(), "keep me");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
    }

    #[test]
    fn creates_the_named_folder_in_the_parent() {
        let parent = scratch_dir("create");

        let space = create_space_folder_in(&parent, "  Personal ").unwrap();

        assert_eq!(space.name, "Personal");
        assert!(parent.join("Personal").is_dir());
        assert_eq!(fs::read_dir(parent.join("Personal")).unwrap().count(), 0);
    }

    #[test]
    fn reuses_an_existing_folder_without_touching_it_or_renaming() {
        let parent = scratch_dir("exists");
        let existing = parent.join("Personal");
        fs::create_dir(&existing).unwrap();
        fs::write(existing.join("mine.md"), "precious").unwrap();

        let space = create_space_folder_in(&parent, "Personal").unwrap();

        assert_eq!(space.name, "Personal");
        assert_eq!(
            fs::read_to_string(existing.join("mine.md")).unwrap(),
            "precious"
        );
        assert_eq!(fs::read_dir(&existing).unwrap().count(), 1);
        assert_eq!(fs::read_dir(&parent).unwrap().count(), 1); // no "Personal 2"
    }

    #[test]
    fn errors_when_a_file_has_that_name() {
        let parent = scratch_dir("file");
        fs::write(parent.join("Personal"), "i am a file").unwrap();

        assert!(create_space_folder_in(&parent, "Personal").is_err());
        assert_eq!(
            fs::read_to_string(parent.join("Personal")).unwrap(),
            "i am a file"
        );
    }

    #[test]
    fn rejects_empty_and_path_escaping_names() {
        let parent = scratch_dir("names");
        for bad in [
            "", "   ", ".", "..", "../x", "a/b", "a\\b", "a:b", "a\u{0}b",
        ] {
            assert!(create_space_folder_in(&parent, bad).is_err(), "{bad:?}");
        }
        assert!(create_space_folder_in(&parent, &"x".repeat(256)).is_err());
        assert_eq!(fs::read_dir(&parent).unwrap().count(), 0);
    }

    #[test]
    fn rejects_a_missing_parent() {
        let parent = scratch_dir("missing");
        assert!(create_space_folder_in(&parent.join("nope"), "Personal").is_err());
    }

    #[test]
    fn rejects_missing_path_and_files() {
        let dir = scratch_dir("reject");
        assert!(validate_folder(&dir.join("nope")).is_err());

        let file = dir.join("a.txt");
        fs::write(&file, "x").unwrap();
        assert!(validate_folder(&file).is_err());
    }
}
