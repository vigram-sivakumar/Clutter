// Preserve the previous sandboxed installation's app state when moving direct
// distribution outside App Sandbox. User vaults stay at their existing paths.
use std::fs;
use std::io;
use std::path::Path;

fn copy_tree(source: &Path, target: &Path) -> io::Result<()> {
    fs::create_dir(target)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        if entry.file_name() == ".persisted-scope" {
            continue; // The legacy scope cache can contain forgotten grants.
        }
        let kind = entry.file_type()?;
        let destination = target.join(entry.file_name());
        if kind.is_dir() {
            copy_tree(&entry.path(), &destination)?;
        } else if kind.is_file() {
            fs::copy(entry.path(), destination)?;
        } else {
            return Err(io::Error::other("unsupported entry in previous Clutter profile"));
        }
    }
    Ok(())
}

fn migrate_directory(source: &Path, target: &Path) -> io::Result<()> {
    if target.exists() || !source.exists() {
        return Ok(());
    }
    if !fs::symlink_metadata(source)?.is_dir() {
        return Err(io::Error::other("previous Clutter profile is not a directory"));
    }
    let parent = target.parent().ok_or_else(|| io::Error::other("invalid profile path"))?;
    fs::create_dir_all(parent)?;
    let stage = parent.join(format!(".clutter-profile-{}", std::process::id()));
    // Leave an interrupted copy available for inspection and retry with a new
    // process. Never merge a partial profile into an existing destination.
    copy_tree(source, &stage)?;
    fs::rename(stage, target)
}

pub fn prepare(home: &Path, identifier: &str) -> io::Result<()> {
    let library = home.join("Library");
    let previous = library.join("Containers").join(identifier).join("Data/Library");
    migrate_directory(
        &previous.join("Application Support").join(identifier),
        &library.join("Application Support").join(identifier),
    )?;
    migrate_directory(&previous.join("WebKit"), &library.join("WebKit").join(identifier))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn copies_existing_state_without_deleting_originals_or_overwriting_direct_state() {
        let root = std::env::temp_dir().join(format!("clutter-profile-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let source = root.join("Library/Containers/test.profile/Data/Library");
        let data = source.join("Application Support/test.profile");
        fs::create_dir_all(data.join("recovery")).unwrap();
        fs::create_dir_all(source.join("WebKit/WebsiteData/LocalStorage")).unwrap();
        fs::write(data.join("recovery/note.json"), "unsaved work").unwrap();
        fs::write(data.join(".persisted-scope"), "stale grants").unwrap();
        fs::write(source.join("WebKit/WebsiteData/LocalStorage/state"), "space registry").unwrap();
        prepare(&root, "test.profile").unwrap();
        let direct = root.join("Library/Application Support/test.profile");
        assert_eq!(fs::read_to_string(direct.join("recovery/note.json")).unwrap(), "unsaved work");
        assert!(!direct.join(".persisted-scope").exists());
        assert!(data.join("recovery/note.json").exists());
        assert_eq!(fs::read_to_string(root.join("Library/WebKit/test.profile/WebsiteData/LocalStorage/state")).unwrap(), "space registry");
        fs::write(direct.join("recovery/note.json"), "new work").unwrap();
        prepare(&root, "test.profile").unwrap();
        assert_eq!(fs::read_to_string(direct.join("recovery/note.json")).unwrap(), "new work");
        fs::remove_dir_all(root).unwrap();
    }
}
