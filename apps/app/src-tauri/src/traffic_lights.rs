//! Align only the native standard buttons to the existing WebView header.
use tauri::WebviewWindow;

fn valid_geometry(center_y: f64, viewport_height: f64) -> bool {
    center_y.is_finite() && viewport_height.is_finite()
        && viewport_height > 0.0 && center_y >= 0.0
        && center_y <= 100.0 && center_y < viewport_height
}

#[tauri::command]
pub fn align_traffic_lights(window: WebviewWindow, center_y: f64, viewport_height: f64) -> Result<(), String> {
    eprintln!("[clutter-traffic] request center={center_y:.3} viewport={viewport_height:.3}");
    if !valid_geometry(center_y, viewport_height) {
        eprintln!("[clutter-traffic] rejected geometry");
        return Err("Invalid titlebar geometry".into());
    }
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::{NSView, NSWindow, NSWindowButton, NSWindowStyleMask};
        window.with_webview(move |webview| {
            // Tauri executes this callback on the main thread. WKWebView is an NSView.
            let view = unsafe { &*webview.inner().cast::<NSView>() };
            let native = unsafe { &*webview.ns_window().cast::<NSWindow>() };
            if native.styleMask().contains(NSWindowStyleMask::FullScreen) {
                eprintln!("[clutter-traffic] fullscreen: skipped");
                return; // AppKit owns the fullscreen titlebar.
            }
            let bounds = view.bounds();
            eprintln!("[clutter-traffic] webview bounds={bounds:?} flipped={}", view.isFlipped());
            if bounds.size.height <= 0.0 { return; }
            // DOM coordinates run down from the viewport top. Use the actual
            // WebView height in points, not Retina backing pixels.
            let offset = center_y * bounds.size.height / viewport_height;
            let mut point = bounds.origin;
            point.y += if view.isFlipped() { offset } else { bounds.size.height - offset };
            for (index, kind) in [NSWindowButton::CloseButton, NSWindowButton::MiniaturizeButton, NSWindowButton::ZoomButton].into_iter().enumerate() {
                let Some(button) = native.standardWindowButton(kind) else { eprintln!("[clutter-traffic] button {index} missing"); continue; };
                let Some(parent) = button.superview() else { eprintln!("[clutter-traffic] button {index} parent missing"); continue; };
                let target = parent.convertPoint_fromView(point, Some(view));
                let frame = button.frame();
                let mut origin = frame.origin;
                origin.y = target.y - frame.size.height / 2.0;
                eprintln!("[clutter-traffic] button {index} parent target={:.3} before={:.3} requested origin={:.3}", target.y, frame.origin.y + frame.size.height / 2.0, origin.y);
                // Preserve native horizontal spacing, sizes, and actions.
                if (origin.y - frame.origin.y).abs() > 0.01 {
                    button.setFrameOrigin(origin);
                }
                let after = button.frame();
                let mut midpoint = after.origin;
                midpoint.x += after.size.width / 2.0;
                midpoint.y += after.size.height / 2.0;
                let actual = parent.convertPoint_toView(midpoint, Some(view));
                let actual_css = if view.isFlipped() { actual.y - bounds.origin.y } else { bounds.origin.y + bounds.size.height - actual.y };
                eprintln!("[clutter-traffic] button {index} after={:.3} actual CSS center={:.3}", after.origin.y + after.size.height / 2.0, actual_css * viewport_height / bounds.size.height);
            }
        }).map_err(|error| error.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    let _ = window;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_finite_header_coordinates_are_accepted() {
        assert!(valid_geometry(32.0, 920.0));
        assert!(!valid_geometry(f64::NAN, 920.0));
        assert!(!valid_geometry(32.0, 0.0));
        assert!(!valid_geometry(150.0, 920.0));
        assert!(!valid_geometry(-1.0, 920.0));
    }
}
