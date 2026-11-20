use tauri::AppHandle;

#[tauri::command]
pub(crate) fn set_dock_badge(app: AppHandle, count: u32) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use objc2::MainThreadMarker;
        use objc2_app_kit::NSApplication;
        use objc2_foundation::NSString;

        app.run_on_main_thread(move || {
            let mtm = MainThreadMarker::new().expect("Dock badge updates run on the main thread");
            let application = NSApplication::sharedApplication(mtm);
            let dock_tile = application.dockTile();
            let label = (count > 0).then(|| NSString::from_str(&count.to_string()));
            dock_tile.setBadgeLabel(label.as_deref());
        })
        .map_err(|error| error.to_string())?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, count);
    }

    Ok(())
}
