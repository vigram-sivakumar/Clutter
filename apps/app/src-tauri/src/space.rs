//! Folder-level space selection for the welcome screen.
//!
//! `validate_folder` is read-only (used by `startup::open_space`) and
//! `get_default_space_parent` only reports where new spaces go.
//! Nothing is written inside a space and nothing is persisted here (that's
//! `startup::open_space`). Per ADR-030 no reserved resource (`.clutter`,
//! `Daily Notes`, …) is materialized up front; they appear lazily when a
//! feature first needs them.
//!
//! Done in Rust rather than via the JS fs plugin because the folder picker can
//! return paths outside the plugin's `$HOME` scope.

use std::fs;
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

    let metadata = fs::metadata(&canonical)
        .map_err(|error| format!("Couldn't read that folder: {error}"))?;
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
    fn rejects_missing_path_and_files() {
        let dir = scratch_dir("reject");
        assert!(validate_folder(&dir.join("nope")).is_err());

        let file = dir.join("a.txt");
        fs::write(&file, "x").unwrap();
        assert!(validate_folder(&file).is_err());
    }
}
