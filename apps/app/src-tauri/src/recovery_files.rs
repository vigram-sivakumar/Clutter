//! Filesystem implementation of the recovery-store capability. No Tauri or registry dependency.
use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};

/// A record is a small JSON snapshot of one note; anything near this is not one.
const MAX_RECORD_BYTES: usize = 8 * 1024 * 1024;
const MAX_COMPONENT_BYTES: usize = 192;

/// One plain path component: a letter or digit first, then letters, digits, `.`, `_`, `-`. Rules out `..`, separators,
/// absolute paths, an empty name and a hidden (dot-leading) one.
fn is_plain_component(text: &str) -> bool {
    !text.is_empty()
        && text.len() <= MAX_COMPONENT_BYTES
        && text
            .bytes()
            .next()
            .is_some_and(|first| first.is_ascii_alphanumeric())
        && text
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
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
    write_record_with_directory_sync(root, key, name, text, &|directory| {
        fs::File::open(directory)?.sync_all()
    })
}

pub(crate) fn write_record_with_directory_sync(
    root: &Path,
    key: &str,
    name: &str,
    text: &str,
    sync_directory: &dyn Fn(&Path) -> std::io::Result<()>,
) -> Result<(), String> {
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
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&temp)?;
        file.write_all(text.as_bytes())?;
        file.sync_all()?;
        fs::rename(&temp, folder.join(name))
    })();
    if let Err(error) = written {
        let _ = fs::remove_file(&temp);
        return Err(error.to_string());
    }
    // A post-rename failure can leave the new record readable, but must never acknowledge protection.
    // Also confirm the key/root entries, including a freshly created recovery directory.
    for directory in [Some(folder.as_path()), Some(root), root.parent()]
        .into_iter()
        .flatten()
    {
        sync_directory(directory)
            .map_err(|error| format!("recovery directory durability not confirmed: {error}"))?;
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryCatalogEntry {
    pub key: String,
    pub record_name: String,
    pub name: Option<String>,
    pub space_id: Option<String>,
    pub last_path: Option<String>,
    pub modified_at_ms: Option<u64>,
    /// Inventory metadata could not be read. RecoveryJournal still owns full record validation.
    pub metadata_unreadable: bool,
}

/// Read-only inventory independent of Space registration. Never follows key-folder or record symlinks.
pub fn enumerate_records(root: &Path) -> Result<Vec<RecoveryCatalogEntry>, String> {
    let root_kind = match fs::symlink_metadata(root) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(error) => return Err(error.to_string()),
    };
    if root_kind.file_type().is_symlink() || !root_kind.is_dir() {
        return Err("the recovery root is not a plain folder".into());
    }
    let mut records = vec![];
    for directory in fs::read_dir(root).map_err(|error| error.to_string())? {
        let directory = directory.map_err(|error| error.to_string())?;
        let key = directory.file_name().to_string_lossy().into_owned();
        if !is_plain_component(&key)
            || !directory
                .file_type()
                .map_err(|error| error.to_string())?
                .is_dir()
        {
            continue;
        }
        for entry in fs::read_dir(directory.path()).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            let record_name = entry.file_name().to_string_lossy().into_owned();
            if !is_record_name(&record_name)
                || !entry
                    .file_type()
                    .map_err(|error| error.to_string())?
                    .is_file()
            {
                continue;
            }
            let modified_at_ms = entry
                .metadata()
                .ok()
                .and_then(|metadata| metadata.modified().ok())
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                .and_then(|duration| u64::try_from(duration.as_millis()).ok());
            let metadata = (|| -> Option<serde_json::Value> {
                let mut text = String::new();
                fs::File::open(entry.path())
                    .ok()?
                    .take(MAX_RECORD_BYTES as u64 + 1)
                    .read_to_string(&mut text)
                    .ok()?;
                if text.len() > MAX_RECORD_BYTES {
                    return None;
                }
                serde_json::from_str(&text).ok()
            })();
            let string = |field: &str| metadata.as_ref()?.get(field)?.as_str().map(String::from);
            records.push(RecoveryCatalogEntry {
                key: key.clone(),
                record_name,
                name: string("name"),
                space_id: string("spaceId"),
                last_path: string("lastPath"),
                modified_at_ms,
                metadata_unreadable: metadata.is_none(),
            });
        }
    }
    records.sort_by(|a, b| (&a.key, &a.record_name).cmp(&(&b.key, &b.record_name)));
    Ok(records)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct Scratch(PathBuf);

    impl Scratch {
        fn new(label: &str) -> Self {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let base = fs::canonicalize(std::env::temp_dir())
                .unwrap()
                .join(format!(
                    "clutter-recovery-{label}-{}-{nanos}",
                    std::process::id()
                ));
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
    fn a_post_rename_directory_flush_failure_never_acknowledges_protection() {
        let scratch = Scratch::new("sync-failure");
        let root = scratch.0.join("recovery");
        write_record(&root, "space-1", RECORD, "old").unwrap();
        let result = write_record_with_directory_sync(&root, "space-1", RECORD, "new", &|_| {
            Err(std::io::Error::other("injected directory flush failure"))
        });
        assert!(result.is_err());
        assert_eq!(
            fs::read_to_string(root.join("space-1").join(RECORD)).unwrap(),
            "new",
            "an unconfirmed whole record is preserved, not deleted"
        );
        write_record(&root, "space-1", RECORD, "confirmed retry").unwrap();
        assert_eq!(
            fs::read_to_string(root.join("space-1").join(RECORD)).unwrap(),
            "confirmed retry"
        );
    }

    #[test]
    fn protection_confirms_the_key_root_and_parent_directories() {
        let scratch = Scratch::new("sync-order");
        let root = scratch.0.join("recovery");
        let seen = std::cell::RefCell::new(vec![]);
        write_record_with_directory_sync(&root, "space-1", RECORD, "body", &|path| {
            seen.borrow_mut().push(path.to_path_buf());
            fs::File::open(path)?.sync_all()
        })
        .unwrap();
        assert_eq!(
            *seen.borrow(),
            [root.join("space-1"), root.clone(), scratch.0.clone()]
        );
    }

    #[test]
    fn catalog_keeps_legacy_malformed_temporary_and_unregistered_records_visible() {
        let scratch = Scratch::new("catalog");
        let root = scratch.0.join("recovery");
        assert!(enumerate_records(&root).unwrap().is_empty());
        write_record(&root, "legacy-key", RECORD, "{\"body\":\"legacy\"}").unwrap();
        write_record(
            &root,
            "orphan-key",
            RECORD,
            "{\"spaceId\":\"stable-id\",\"name\":\"Old Space\",\"lastPath\":\"/missing/space\"}",
        )
        .unwrap();
        fs::write(root.join("orphan-key/broken.bbbbbbbb.json"), "truncated").unwrap();
        fs::write(root.join("orphan-key/interrupted.bbbbbbbb.json.tmp"), "{}").unwrap();
        let records = enumerate_records(&root).unwrap();
        assert_eq!(records.len(), 4);
        let legacy = records.iter().find(|r| r.key == "legacy-key").unwrap();
        assert!(legacy.space_id.is_none());
        assert!(legacy.name.is_none());
        let orphan = records
            .iter()
            .find(|r| r.key == "orphan-key" && r.record_name == RECORD)
            .unwrap();
        assert_eq!(orphan.space_id.as_deref(), Some("stable-id"));
        assert_eq!(orphan.last_path.as_deref(), Some("/missing/space"));
        assert!(records.iter().any(|r| r.metadata_unreadable));
        assert!(records.iter().any(|r| r.record_name.ends_with(".tmp")));
        assert_eq!(
            fs::read_to_string(root.join("orphan-key/broken.bbbbbbbb.json")).unwrap(),
            "truncated"
        );
    }

    #[test]
    fn catalog_does_not_follow_key_record_or_root_symlinks() {
        let scratch = Scratch::new("catalog-links");
        let root = scratch.0.join("recovery");
        let outside = scratch.0.join("outside");
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join(RECORD), "private").unwrap();
        fs::create_dir_all(root.join("plain-key")).unwrap();
        symlink(&outside, root.join("linked-key")).unwrap();
        symlink(outside.join(RECORD), root.join("plain-key").join(RECORD)).unwrap();
        assert!(enumerate_records(&root).unwrap().is_empty());
        let linked_root = scratch.0.join("linked-root");
        symlink(&outside, &linked_root).unwrap();
        assert!(enumerate_records(&linked_root).is_err());
        assert_eq!(fs::read_to_string(outside.join(RECORD)).unwrap(), "private");
    }

    #[test]
    fn a_write_creates_the_folder_and_replaces_an_earlier_record_whole() {
        let scratch = Scratch::new("replace");
        let root = scratch.0.join("recovery");

        write_record(&root, "space-1", RECORD, "first").unwrap();
        write_record(&root, "space-1", RECORD, "second").unwrap();

        assert_eq!(
            fs::read_to_string(root.join("space-1").join(RECORD)).unwrap(),
            "second"
        );
        assert!(
            !root.join("space-1").join(format!("{RECORD}.tmp")).exists(),
            "no temporary file is left"
        );
    }

    #[test]
    fn a_failed_write_leaves_the_earlier_record_and_no_temporary_file() {
        let scratch = Scratch::new("failed");
        let root = scratch.0.join("recovery");
        write_record(&root, "space-1", RECORD, "first").unwrap();
        // Another record name that is a folder: the rename onto it fails after the temporary file was written.
        fs::create_dir_all(root.join("space-1").join("blocked.aaaaaaaa.json")).unwrap();

        assert!(write_record(&root, "space-1", "blocked.aaaaaaaa.json", "second").is_err());

        assert_eq!(
            fs::read_to_string(root.join("space-1").join(RECORD)).unwrap(),
            "first"
        );
        assert!(root.join("space-1").join("blocked.aaaaaaaa.json").is_dir());
        assert!(!root
            .join("space-1")
            .join("blocked.aaaaaaaa.json.tmp")
            .exists());
    }

    #[test]
    fn an_interrupted_write_s_temporary_file_is_replaced_by_the_next_write() {
        let scratch = Scratch::new("stale");
        let root = scratch.0.join("recovery");
        fs::create_dir_all(root.join("k")).unwrap();
        fs::write(root.join("k").join(format!("{RECORD}.tmp")), "interrupted").unwrap();

        write_record(&root, "k", RECORD, "fresh").unwrap();

        assert_eq!(
            fs::read_to_string(root.join("k").join(RECORD)).unwrap(),
            "fresh"
        );
        assert!(!root.join("k").join(format!("{RECORD}.tmp")).exists());
    }

    #[test]
    fn only_a_plain_key_and_a_json_record_name_are_accepted() {
        let scratch = Scratch::new("names");
        let root = scratch.0.join("recovery");
        let victim = scratch.0.join("victim.json");
        fs::write(&victim, "keep").unwrap();

        for key in [
            "", "..", ".", "a/b", "../x", "/abs", ".hidden", "a\\b", "k\0",
        ] {
            assert!(
                write_record(&root, key, RECORD, "x").is_err(),
                "key {key:?}"
            );
            assert!(remove_record(&root, key, RECORD).is_err(), "key {key:?}");
        }
        for name in [
            "",
            "..",
            "a/b.json",
            "../victim.json",
            "/abs.json",
            ".hidden.json",
            "note.txt",
            "note.json.tmp",
            "note",
            "n\0.json",
        ] {
            assert!(
                write_record(&root, "k", name, "x").is_err(),
                "name {name:?}"
            );
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
        assert_eq!(
            fs::read_to_string(root.join("k").join(RECORD)).unwrap(),
            "record"
        );
        assert!(!fs::symlink_metadata(root.join("k").join(RECORD))
            .unwrap()
            .file_type()
            .is_symlink());
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
