//! Folder-level space selection for the welcome screen.
//!
//! These commands only *validate or create a plain directory* and report it
//! back — nothing is written inside it and nothing is persisted. Per ADR-030
//! no reserved resource (`.clutter`, `Daily Notes`, …) is materialized up
//! front; they appear lazily when a feature first needs them. Persisting the
//! choice (space.json) is the later SpaceDetails → workspace step.
//!
//! Done in Rust rather than via the JS fs plugin because the folder picker can
//! return paths outside the plugin's `$HOME` scope.

use std::fs;
use std::io::ErrorKind;
use std::path::Path;

use serde::Serialize;
use tauri::{AppHandle, Manager};

const DEFAULT_SPACE_FOLDER_NAME: &str = "Clutter";

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
fn validate_folder(path: &Path) -> Result<SpaceFolder, String> {
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

/// Creates `<documents>/Clutter`. Never touches an existing folder's
/// contents: an existing *empty* directory (e.g. left by an earlier attempt)
/// is reused, anything else is an error.
fn create_default_space_in(documents: &Path) -> Result<SpaceFolder, String> {
    let target = documents.join(DEFAULT_SPACE_FOLDER_NAME);

    match fs::create_dir(&target) {
        Ok(()) => {}
        Err(error) if error.kind() == ErrorKind::AlreadyExists => {
            let is_empty_dir = target.is_dir()
                && fs::read_dir(&target)
                    .map(|mut entries| entries.next().is_none())
                    .unwrap_or(false);
            if !is_empty_dir {
                return Err(format!(
                    "A \"{DEFAULT_SPACE_FOLDER_NAME}\" folder already exists in Documents. \
                     Use \"Select a folder\" to open it instead."
                ));
            }
        }
        Err(error) => {
            return Err(format!(
                "Couldn't create the \"{DEFAULT_SPACE_FOLDER_NAME}\" folder in Documents: {error}"
            ))
        }
    }

    validate_folder(&target)
}

#[tauri::command]
pub async fn validate_space_folder(path: String) -> Result<SpaceFolder, String> {
    validate_folder(Path::new(&path))
}

#[tauri::command]
pub async fn create_default_space(app: AppHandle) -> Result<SpaceFolder, String> {
    let documents = app
        .path()
        .document_dir()
        .map_err(|error| format!("Couldn't locate your Documents folder: {error}"))?;
    create_default_space_in(&documents)
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

    #[test]
    fn creates_clutter_folder_in_documents() {
        let documents = scratch_dir("create");

        let space = create_default_space_in(&documents).unwrap();

        assert_eq!(space.name, "Clutter");
        assert!(documents.join("Clutter").is_dir());
        // Nothing is initialized inside it.
        assert_eq!(fs::read_dir(documents.join("Clutter")).unwrap().count(), 0);
    }

    #[test]
    fn reuses_empty_existing_folder() {
        let documents = scratch_dir("empty");
        fs::create_dir(documents.join("Clutter")).unwrap();

        assert!(create_default_space_in(&documents).is_ok());
    }

    #[test]
    fn never_touches_a_non_empty_existing_folder() {
        let documents = scratch_dir("nonempty");
        let existing = documents.join("Clutter");
        fs::create_dir(&existing).unwrap();
        fs::write(existing.join("mine.md"), "precious").unwrap();

        assert!(create_default_space_in(&documents).is_err());
        assert_eq!(fs::read_to_string(existing.join("mine.md")).unwrap(), "precious");
        assert_eq!(fs::read_dir(&existing).unwrap().count(), 1);
    }

    #[test]
    fn errors_when_clutter_exists_as_a_file() {
        let documents = scratch_dir("file");
        fs::write(documents.join("Clutter"), "i am a file").unwrap();

        assert!(create_default_space_in(&documents).is_err());
        assert_eq!(fs::read_to_string(documents.join("Clutter")).unwrap(), "i am a file");
    }
}
