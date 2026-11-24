//! Narrow IPC bridge for the opt-in Sparkle integration build. No updater in App Store builds.
#[tauri::command]
pub async fn sparkle_update(action: String) -> Result<serde_json::Value, String> {
    #[cfg(all(target_os = "macos", feature = "sparkle-updates"))]
    {
        if !matches!(action.as_str(), "start" | "status" | "check" | "restart" | "cancel_restart" | "commit_restart") {
            return Err("Unknown Sparkle action".into());
        }
        tauri::async_runtime::spawn_blocking(move || {
            use std::ffi::{CStr, CString};
            use std::os::raw::c_char;
            extern "C" {
                fn clutter_sparkle_action(action: *const c_char) -> *mut c_char;
                fn clutter_sparkle_free(value: *mut c_char);
            }
            let command = CString::new(action).map_err(|e| e.to_string())?;
            // Native code serializes all Sparkle calls onto the AppKit main thread.
            let value = unsafe { clutter_sparkle_action(command.as_ptr()) };
            if value.is_null() { return Err("Sparkle returned no state".into()); }
            let bytes = unsafe { CStr::from_ptr(value) }.to_bytes().to_vec();
            unsafe { clutter_sparkle_free(value) };
            let state: serde_json::Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
            validate_snapshot(state)
        }).await.map_err(|e| e.to_string())?
    }
    #[cfg(not(all(target_os = "macos", feature = "sparkle-updates")))]
    {
        let _ = action;
        Err("Sparkle is unavailable in this build".into())
    }
}

#[cfg(any(test, all(target_os = "macos", feature = "sparkle-updates")))]
fn validate_snapshot(state: serde_json::Value) -> Result<serde_json::Value, String> {
    match state["ok"].as_bool() {
        Some(true) => Ok(state),
        Some(false) => Err(state["error"].as_str().filter(|s| !s.trim().is_empty())
            .unwrap_or("Sparkle action failed without a description").to_owned()),
        None => Err(format!("Invalid Sparkle IPC response: expected boolean ok, received {}", state["ok"])),
    }
}

#[cfg(test)]
mod tests {
    use super::validate_snapshot;
    use serde_json::json;

    #[test]
    fn successful_boolean_response_is_accepted() {
        assert!(validate_snapshot(json!({"ok":true,"phase":"idle","error":""})).is_ok());
    }

    #[test]
    fn integer_status_never_becomes_an_empty_error() {
        let error = validate_snapshot(json!({"ok":1,"error":""})).unwrap_err();
        assert!(error.contains("expected boolean ok"));
    }

    #[test]
    fn failed_response_preserves_nonempty_error() {
        assert_eq!(validate_snapshot(json!({"ok":false,"error":"Cannot start"})).unwrap_err(), "Cannot start");
        assert!(!validate_snapshot(json!({"ok":false,"error":""})).unwrap_err().is_empty());
    }
}
