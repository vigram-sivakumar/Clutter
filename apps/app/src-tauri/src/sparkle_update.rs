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
            if state["ok"].as_bool() != Some(true) {
                return Err(state["error"].as_str().unwrap_or("Sparkle action failed").to_owned());
            }
            Ok(state)
        }).await.map_err(|e| e.to_string())?
    }
    #[cfg(not(all(target_os = "macos", feature = "sparkle-updates")))]
    {
        let _ = action;
        Err("Sparkle is unavailable in this build".into())
    }
}
