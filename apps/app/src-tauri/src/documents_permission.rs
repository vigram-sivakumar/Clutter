//! Direct-distribution macOS Documents privacy recovery. No filesystem grants are changed.
use tauri::AppHandle;

#[cfg(target_os = "macos")]
fn is_documents_space(path: &std::path::Path, documents: &std::path::Path) -> bool {
    path.strip_prefix(documents).is_ok_and(|relative| {
        relative.components().all(|component| matches!(component, std::path::Component::Normal(_)))
    })
}

#[cfg(target_os = "macos")]
fn classify_probe(result: std::io::Result<std::fs::ReadDir>) -> &'static str {
    match result {
        Ok(_) => "allowed",
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => "denied",
        Err(_) => "unknown",
    }
}

/// Only inspect the real Documents directory, only for a Space inside it and
/// only outside the sandbox. No arbitrary filesystem inspection or grant.
#[tauri::command]
pub async fn documents_permission_status(app: AppHandle, path: String) -> Result<&'static str, String> {
    #[cfg(target_os = "macos")]
    {
        if crate::space_access::is_sandboxed() {
            return Ok("unknown");
        }
        let documents = crate::space_access::documents_dir(&app)?;
        if !is_documents_space(std::path::Path::new(&path), &documents) {
            return Ok("unknown");
        }
        return tauri::async_runtime::spawn_blocking(move || classify_probe(std::fs::read_dir(documents)))
            .await.map_err(|error| error.to_string());
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, path);
        Ok("unknown")
    }
}

/// Uses the platform-native dialog rather than a WebView modal.
/// Settings is opened only on explicit selection, using a fixed destination.
#[tauri::command]
pub async fn show_documents_permission_alert(app: AppHandle) -> Result<&'static str, String> {
    #[cfg(target_os = "macos")]
    {
        use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
        return tauri::async_runtime::spawn_blocking(move || {
            let settings = app.dialog()
                .message("Clutter needs access to your Documents folder to open your Space. Allow access in System Settings to continue.")
                .title("Folder access required")
                .kind(MessageDialogKind::Warning)
                .buttons(MessageDialogButtons::OkCancelCustom("Open System Settings".into(), "Quit Clutter".into()))
                .blocking_show();
            if !settings {
                return Ok("quit");
            }
            let status = std::process::Command::new("/usr/bin/open")
                .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders")
                .status().map_err(|error| error.to_string())?;
            if !status.success() {
                return Err("Could not open System Settings".into());
            }
            Ok("settings")
        }).await.map_err(|error| error.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Err("Documents permission recovery is available on macOS only".into())
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn only_documents_and_its_descendants_qualify() {
        let docs = Path::new("/Users/test/Documents");
        assert!(is_documents_space(docs, docs));
        assert!(is_documents_space(Path::new("/Users/test/Documents/Notes"), docs));
        assert!(!is_documents_space(Path::new("/Users/test/DocumentsOther/Notes"), docs));
        assert!(!is_documents_space(Path::new("/Users/test/Documents/../Desktop"), docs));
    }

    #[test]
    fn only_permission_errors_are_denials() {
        assert_eq!(classify_probe(Err(std::io::Error::from_raw_os_error(1))), "denied");
        assert_eq!(classify_probe(Err(std::io::Error::from_raw_os_error(13))), "denied");
        assert_eq!(classify_probe(Err(std::io::Error::from_raw_os_error(2))), "unknown");
        assert_eq!(classify_probe(Err(std::io::Error::from_raw_os_error(5))), "unknown");
    }
}
