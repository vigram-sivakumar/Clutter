//! Native macOS Launch at Login support backed by ServiceManagement's SMAppService.mainApp.
//! This registers Clutter itself, so it appears as a normal app in System Settings > General > Login Items.

#[cfg(target_os = "macos")]
use objc2_service_management::{SMAppService, SMAppServiceStatus};

#[cfg(target_os = "macos")]
fn current_status() -> &'static str {
    let service = unsafe { SMAppService::mainAppService() };
    let status = unsafe { service.status() };

    if status == SMAppServiceStatus::Enabled {
        "enabled"
    } else if status == SMAppServiceStatus::RequiresApproval {
        "requires-approval"
    } else if status == SMAppServiceStatus::NotRegistered {
        "not-registered"
    } else {
        "not-found"
    }
}

#[tauri::command]
pub fn get_launch_at_login_status() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(current_status().to_string())
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok("unsupported".to_string())
    }
}

#[tauri::command]
pub fn set_launch_at_login_enabled(enabled: bool) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let service = unsafe { SMAppService::mainAppService() };
        let status = unsafe { service.status() };

        if enabled {
            if status == SMAppServiceStatus::Enabled {
                return Ok("enabled".to_string());
            }
            if status == SMAppServiceStatus::RequiresApproval {
                return Ok("requires-approval".to_string());
            }
            unsafe { service.registerAndReturnError() }
                .map_err(|error| format!("macOS could not enable Launch at Login: {error:?}"))?;
        } else {
            if status == SMAppServiceStatus::NotRegistered {
                return Ok("not-registered".to_string());
            }
            unsafe { service.unregisterAndReturnError() }
                .map_err(|error| format!("macOS could not disable Launch at Login: {error:?}"))?;
        }

        Ok(current_status().to_string())
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = enabled;
        Err("Launch at Login is only supported on macOS.".to_string())
    }
}

#[tauri::command]
pub fn open_login_items_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        unsafe { SMAppService::openSystemSettingsLoginItems() };
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Login Items settings are only available on macOS.".to_string())
    }
}
