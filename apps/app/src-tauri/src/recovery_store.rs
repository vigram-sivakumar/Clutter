//! Storage for crash-recovery records (ADR-062): the only writer of `<app data>/recovery/<vault key>/<record>.json`.
//!
//! Records used to be written through the fs plugin's `write_text_file`, which meant the webview held a command that
//! truncates any file under `$HOME/**`, notes included. These two commands replace it with something that cannot name
//! a path: the webview hands over a vault key and a record file name, each one plain path component, and the folder is
//! built here under the application data directory, so they are not general-purpose filesystem access (the same shape
//! as `parse_cache_*`).
//!
//! A write is a complete record or nothing: the text goes to `<record>.tmp` (created exclusively, so a link planted at
//! that name is never followed), is synced, and is renamed over the record, so a failure at any point leaves the
//! earlier record as it was. The temporary file keeps its fixed name because the journal reads an interrupted
//! `.json.tmp` as recoverable work. A link at the record's own name is replaced, never written through, and a vault
//! key folder that is a link is refused.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

/// A record is a small JSON snapshot of one note; anything near this is not one.
const MAX_RECORD_BYTES: usize = 8 * 1024 * 1024;
const MAX_COMPONENT_BYTES: usize = 192;

/// One plain path component: a letter or digit first, then letters, digits, `.`, `_`, `-`. Rules out `..`, separators,
/// absolute paths, an empty name and a hidden (dot-leading) one.
fn is_plain_component(text: &str) -> bool {
    !text.is_empty()
        && text.len() <= MAX_COMPONENT_BYTES
        && text.bytes().next().is_some_and(|first| first.is_ascii_alphanumeric())
        && text.bytes().all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
}

fn record_folder(root: &Path, key: &str) -> Result<PathBuf, String> {
    if !is_plain_component(key) {
        return Err("not a recovery key".to_string());
    }
    Ok(root.join(key))
}

/// A committed record (`.json`) or the temporary file of an interrupted write (`.json.tmp`).
fn is_record_name(name: &str) -> bool {
    is_plain_component(name) && (name.ends_with(".json") || name.ends_with(".json.tmp"))
}

pub(crate) fn write_record(root: &Path, key: &str, name: &str, text: &str) -> Result<(), String> {
    if !is_plain_component(name) || !name.ends_with(".json") {
        return Err("not a recovery record name".to_string());
    }
    if text.len() > MAX_RECORD_BYTES {
        return Err("the recovery record is too large".to_string());
    }
    let folder = record_folder(root, key)?;
    fs::create_dir_all(&folder).map_err(|error| error.to_string())?;
    let kind = fs::symlink_metadata(&folder).map_err(|error| error.to_string())?;
    if kind.file_type().is_symlink() || !kind.is_dir() {
        return Err("the recovery folder is not a plain folder".to_string());
    }

    let temp = folder.join(format!("{name}.tmp"));
    // Whatever an earlier interrupted write left: replaced, and a link there is removed, not followed.
    match fs::remove_file(&temp) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.to_string()),
    }
    let written = (|| -> std::io::Result<()> {
        let mut file = OpenOptions::new().write(true).create_new(true).mode(0o600).open(&temp)?;
        file.write_all(text.as_bytes())?;
        file.sync_all()?;
        fs::rename(&temp, folder.join(name))
    })();
    if let Err(error) = written {
        let _ = fs::remove_file(&temp);
        return Err(error.to_string());
    }
    // Best effort: the rename itself is already atomic; this asks for it to be on disk too.
    if let Ok(directory) = fs::File::open(&folder) {
        let _ = directory.sync_all();
    }
    Ok(())
}

pub(crate) fn remove_record(root: &Path, key: &str, name: &str) -> Result<(), String> {
    if !is_record_name(name) {
        return Err("not a recovery record name".to_string());
    }
    let path = record_folder(root, key)?.join(name);
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn recovery_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map(|dir| dir.join("recovery")).map_err(|error| error.to_string())
}

/// Replaces `<key>/<name>` with `text`, whole or not at all.
#[tauri::command]
pub async fn recovery_write(app: AppHandle, key: String, name: String, text: String) -> Result<(), String> {
    let root = recovery_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || write_record(&root, &key, &name, &text)).await.map_err(|error| error.to_string())?
}

/// Removes `<key>/<name>`; one that is already gone is not an error.
#[tauri::command]
pub async fn recovery_remove(app: AppHandle, key: String, name: String) -> Result<(), String> {
    let root = recovery_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || remove_record(&root, &key, &name)).await.map_err(|error| error.to_string())?
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
            let base = fs::canonicalize(std::env::temp_dir()).unwrap().join(format!("clutter-recovery-{label}-{}-{nanos}", std::process::id()));
            fs::create_dir_all(&base).unwrap();
            Scratch(base)
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    const RECORD: &str = "note.aaaaaaaa.json";

    #[test]
    fn a_write_creates_the_folder_and_replaces_an_earlier_record_whole() {
        let scratch = Scratch::new("replace");
        let root = scratch.0.join("recovery");

        write_record(&root, "space-1", RECORD, "first").unwrap();
        write_record(&root, "space-1", RECORD, "second").unwrap();

        assert_eq!(fs::read_to_string(root.join("space-1").join(RECORD)).unwrap(), "second");
        assert!(!root.join("space-1").join(format!("{RECORD}.tmp")).exists(), "no temporary file is left");
    }

    #[test]
    fn a_failed_write_leaves_the_earlier_record_and_no_temporary_file() {
        let scratch = Scratch::new("failed");
        let root = scratch.0.join("recovery");
        write_record(&root, "space-1", RECORD, "first").unwrap();
        // Another record name that is a folder: the rename onto it fails after the temporary file was written.
        fs::create_dir_all(root.join("space-1").join("blocked.aaaaaaaa.json")).unwrap();

        assert!(write_record(&root, "space-1", "blocked.aaaaaaaa.json", "second").is_err());

        assert_eq!(fs::read_to_string(root.join("space-1").join(RECORD)).unwrap(), "first");
        assert!(root.join("space-1").join("blocked.aaaaaaaa.json").is_dir());
        assert!(!root.join("space-1").join("blocked.aaaaaaaa.json.tmp").exists());
    }

    #[test]
    fn an_interrupted_write_s_temporary_file_is_replaced_by_the_next_write() {
        let scratch = Scratch::new("stale");
        let root = scratch.0.join("recovery");
        fs::create_dir_all(root.join("k")).unwrap();
        fs::write(root.join("k").join(format!("{RECORD}.tmp")), "interrupted").unwrap();

        write_record(&root, "k", RECORD, "fresh").unwrap();

        assert_eq!(fs::read_to_string(root.join("k").join(RECORD)).unwrap(), "fresh");
        assert!(!root.join("k").join(format!("{RECORD}.tmp")).exists());
    }

    #[test]
    fn only_a_plain_key_and_a_json_record_name_are_accepted() {
        let scratch = Scratch::new("names");
        let root = scratch.0.join("recovery");
        let victim = scratch.0.join("victim.json");
        fs::write(&victim, "keep").unwrap();

        for key in ["", "..", ".", "a/b", "../x", "/abs", ".hidden", "a\\b", "k\0"] {
            assert!(write_record(&root, key, RECORD, "x").is_err(), "key {key:?}");
            assert!(remove_record(&root, key, RECORD).is_err(), "key {key:?}");
        }
        for name in ["", "..", "a/b.json", "../victim.json", "/abs.json", ".hidden.json", "note.txt", "note.json.tmp", "note", "n\0.json"] {
            assert!(write_record(&root, "k", name, "x").is_err(), "name {name:?}");
        }
        assert!(remove_record(&root, "k", "note.txt").is_err());
        assert!(remove_record(&root, "k", "../victim.json").is_err());
        assert_eq!(fs::read_to_string(&victim).unwrap(), "keep");
        assert!(!root.exists(), "a refused call creates nothing");
    }

    #[test]
    fn a_record_larger_than_the_limit_is_refused_and_writes_nothing() {
        let scratch = Scratch::new("big");
        let root = scratch.0.join("recovery");

        assert!(write_record(&root, "k", RECORD, &"x".repeat(MAX_RECORD_BYTES + 1)).is_err());

        assert!(!root.exists());
    }

    #[test]
    fn a_key_folder_that_is_a_link_is_refused_and_nothing_is_written_through_it() {
        let scratch = Scratch::new("link-folder");
        let root = scratch.0.join("recovery");
        let outside = scratch.0.join("outside");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&outside).unwrap();
        symlink(&outside, root.join("k")).unwrap();

        assert!(write_record(&root, "k", RECORD, "x").is_err());

        assert_eq!(fs::read_dir(&outside).unwrap().count(), 0);
    }

    #[test]
    fn a_link_at_the_record_or_temporary_name_is_replaced_never_written_through() {
        let scratch = Scratch::new("link-file");
        let root = scratch.0.join("recovery");
        let victim = scratch.0.join("victim.md");
        fs::write(&victim, "my note").unwrap();
        fs::create_dir_all(root.join("k")).unwrap();
        symlink(&victim, root.join("k").join(RECORD)).unwrap();
        symlink(&victim, root.join("k").join(format!("{RECORD}.tmp"))).unwrap();

        write_record(&root, "k", RECORD, "record").unwrap();

        assert_eq!(fs::read_to_string(&victim).unwrap(), "my note");
        assert_eq!(fs::read_to_string(root.join("k").join(RECORD)).unwrap(), "record");
        assert!(!fs::symlink_metadata(root.join("k").join(RECORD)).unwrap().file_type().is_symlink());
    }

    #[test]
    fn remove_deletes_a_record_or_an_interrupted_temp_file_and_a_missing_one_is_not_an_error() {
        let scratch = Scratch::new("remove");
        let root = scratch.0.join("recovery");
        write_record(&root, "k", RECORD, "x").unwrap();
        fs::write(root.join("k").join(format!("{RECORD}.tmp")), "x").unwrap();

        remove_record(&root, "k", RECORD).unwrap();
        remove_record(&root, "k", &format!("{RECORD}.tmp")).unwrap();
        remove_record(&root, "k", RECORD).unwrap();

        assert_eq!(fs::read_dir(root.join("k")).unwrap().count(), 0);
    }

    #[test]
    fn remove_unlinks_a_link_without_touching_what_it_points_at_and_refuses_a_folder() {
        let scratch = Scratch::new("remove-link");
        let root = scratch.0.join("recovery");
        let victim = scratch.0.join("victim.md");
        fs::write(&victim, "my note").unwrap();
        fs::create_dir_all(root.join("k").join("dir.json")).unwrap();
        symlink(&victim, root.join("k").join(RECORD)).unwrap();

        remove_record(&root, "k", RECORD).unwrap();
        assert!(remove_record(&root, "k", "dir.json").is_err());

        assert_eq!(fs::read_to_string(&victim).unwrap(), "my note");
        assert!(root.join("k").join("dir.json").is_dir());
    }
}
