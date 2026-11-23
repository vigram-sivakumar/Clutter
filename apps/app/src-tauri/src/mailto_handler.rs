//! Detects whether the default macOS `mailto:` handler is a browser.
//!
//! This uses Launch Services through NSWorkspace and only examines the
//! application URL returned by the system. It does not read another
//! application's bundle, files, or preferences.

use objc2_app_kit::NSWorkspace;
use objc2_foundation::{NSString, NSURL};

const SUPPORT_MAILTO_URL: &str = "mailto:support.clutter@gmail.com";

/// Returns true when Clutter should open Gmail's web compose page instead of
/// asking the system to open a `mailto:` URL.
#[tauri::command]
pub(crate) fn should_use_gmail_for_support_email() -> bool {
    let Some(mailto_url) =
        (unsafe { NSURL::URLWithString(&NSString::from_str(SUPPORT_MAILTO_URL)) })
    else {
        return true;
    };

    let workspace = NSWorkspace::sharedWorkspace();
    let Some(application_url) = workspace.URLForApplicationToOpenURL(&mailto_url) else {
        // No registered handler: avoid sending the URL to a browser fallback.
        return true;
    };
    let Some(application_name) = application_url.lastPathComponent() else {
        return false;
    };

    is_browser_application_name(&application_name.to_string())
}

fn is_browser_application_name(application_name: &str) -> bool {
    let Some(name) = application_name.strip_suffix(".app") else {
        return false;
    };
    const BROWSER_APP_NAMES: &[&str] = &[
        "safari",
        "google chrome",
        "google chrome beta",
        "google chrome dev",
        "google chrome canary",
        "firefox",
        "firefox developer edition",
        "firefox nightly",
        "microsoft edge",
        "microsoft edge beta",
        "microsoft edge dev",
        "microsoft edge canary",
        "brave browser",
        "arc",
        "vivaldi",
        "opera",
        "opera gx",
        "orion",
        "duckduckgo",
        "zen",
    ];

    BROWSER_APP_NAMES.contains(&name.to_ascii_lowercase().as_str())
}

#[cfg(test)]
mod tests {
    use super::is_browser_application_name;

    #[test]
    fn recognises_common_macos_browsers() {
        for name in [
            "Safari.app",
            "Google Chrome.app",
            "Firefox.app",
            "Microsoft Edge.app",
            "Brave Browser.app",
            "Arc.app",
            "Vivaldi.app",
        ] {
            assert!(is_browser_application_name(name), "{name}");
        }
    }

    #[test]
    fn does_not_classify_mail_clients_as_browsers() {
        for name in ["Mail.app", "Microsoft Outlook.app", "Spark Desktop.app"] {
            assert!(!is_browser_application_name(name), "{name}");
        }
    }
}
