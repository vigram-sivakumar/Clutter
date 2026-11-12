//! Moving an entry to the user's Trash, the way a Mac app does (ADR-072): `NSFileManager trashItemAtURL`.
//!
//! It is the system's own move, so the entry lands in the user's Trash (`~/.Trash`, or the volume's own `.Trashes`),
//! can be recovered in Finder, and Finder offers **Put Back** for it (observed in Finder; `NSWorkspace recycleURLs`
//! did not offer it, which is why it was not chosen). A name already in the Trash is kept: the system renames the
//! newcomer. A folder moves as one unit, with everything in it, so there is no half-moved folder.
//!
//! What this never does: delete. If the system cannot move the entry, the entry stays where it is and the error is
//! returned; there is no fallback to `remove_file` or `remove_dir_all`. No AppleScript, no Apple Events, no
//! entitlement beyond the ones Clutter already has: the access that lets Clutter write the entry is what lets the
//! system move it. **Not verified in a signed, sandboxed build** (a release-validation requirement, ADR-072).

use std::path::{Path, PathBuf};

// Cocoa error codes (NSCocoaErrorDomain) the messages tell apart.
const NO_SUCH_FILE: isize = 4;
const NO_SUCH_FILE_READ: isize = 260;
const WRITE_NO_PERMISSION: isize = 513;
const FEATURE_UNSUPPORTED: isize = 3328;

/// What to tell the caller for a failed move. A missing entry is worded as `delete_path` words it, so a caller treats
/// both alike; the rest say what happened and whether the entry is still there (it always is).
pub(crate) fn trash_error_message(path: &Path, code: isize, description: &str) -> String {
    let shown = path.display();
    match code {
        NO_SUCH_FILE | NO_SUCH_FILE_READ => format!("No such file or directory (os error 2): {shown}"),
        WRITE_NO_PERMISSION => format!("Permission denied: {shown} could not be moved to the Trash, and was not deleted"),
        FEATURE_UNSUPPORTED => format!("The Trash is not available for {shown} (its volume has none), and it was not deleted"),
        _ => format!("{shown} could not be moved to the Trash and was not deleted: {description} (code {code})"),
    }
}

/// Moves `path` to the Trash and returns where it now is.
#[cfg(target_os = "macos")]
pub(crate) fn move_to_trash(path: &Path) -> Result<PathBuf, String> {
    use objc2_foundation::{NSFileManager, NSString, NSURL};

    let location = NSString::from_str(&path.to_string_lossy());
    let url = NSURL::fileURLWithPath(&location);
    // One manager per call: the shared one is not for use from several threads.
    let manager = NSFileManager::new();
    let mut trashed = None;
    match manager.trashItemAtURL_resultingItemURL_error(&url, Some(&mut trashed)) {
        Ok(()) => Ok(trashed
            .and_then(|url| url.path())
            .map(|moved| PathBuf::from(moved.to_string()))
            .unwrap_or_else(|| path.to_path_buf())),
        Err(error) => Err(trash_error_message(path, error.code(), &error.localizedDescription().to_string())),
    }
}

/// There is no Trash to move to here, and the entry is never deleted instead.
#[cfg(not(target_os = "macos"))]
pub(crate) fn move_to_trash(path: &Path) -> Result<PathBuf, String> {
    Err(format!("Moving to the Trash is only supported on macOS: {} was not deleted", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_entry_is_worded_as_delete_path_words_it() {
        for code in [NO_SUCH_FILE, NO_SUCH_FILE_READ] {
            assert!(trash_error_message(Path::new("/s/a.md"), code, "x").contains("No such file or directory"));
        }
    }

    #[test]
    fn every_other_failure_says_the_entry_was_not_deleted() {
        for code in [WRITE_NO_PERMISSION, FEATURE_UNSUPPORTED, 99] {
            let message = trash_error_message(Path::new("/s/a.md"), code, "why");
            assert!(message.contains("/s/a.md") && message.contains("not deleted"), "{message}");
        }
        assert!(trash_error_message(Path::new("/s/a.md"), WRITE_NO_PERMISSION, "").contains("Permission denied"));
        assert!(trash_error_message(Path::new("/s/a.md"), FEATURE_UNSUPPORTED, "").contains("Trash is not available"));
        assert!(trash_error_message(Path::new("/s/a.md"), 99, "why").contains("why (code 99)"));
    }

    #[cfg(not(target_os = "macos"))]
    #[test]
    fn off_macos_nothing_is_moved_or_deleted() {
        assert!(move_to_trash(Path::new("/s/a.md")).unwrap_err().contains("only supported on macOS"));
    }
}
