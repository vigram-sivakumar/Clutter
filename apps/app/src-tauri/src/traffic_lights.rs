//! Align only the native standard buttons to the existing WebView header.
use tauri::WebviewWindow;

fn valid_geometry(center_y: f64, viewport_height: f64) -> bool {
    center_y.is_finite() && viewport_height.is_finite()
        && viewport_height > 0.0 && center_y >= 0.0
        && center_y <= 100.0 && center_y < viewport_height
}

#[tauri::command]
pub fn align_traffic_lights(window: WebviewWindow, center_y: f64, viewport_height: f64) -> Result<(), String> {
    if !valid_geometry(center_y, viewport_height) {
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
                return; // AppKit owns the fullscreen titlebar.
            }
            let bounds = view.bounds();
            if bounds.size.height <= 0.0 { return; }
            // DOM coordinates run down from the viewport top. Use the actual
            // WebView height in points, not Retina backing pixels.
            let offset = center_y * bounds.size.height / viewport_height;
            let mut point = bounds.origin;
            point.y += if view.isFlipped() { offset } else { bounds.size.height - offset };
            for kind in [NSWindowButton::CloseButton, NSWindowButton::MiniaturizeButton, NSWindowButton::ZoomButton] {
                let Some(button) = native.standardWindowButton(kind) else { continue; };
                let Some(parent) = button.superview() else { continue; };
                let target = parent.convertPoint_fromView(point, Some(view));
                let frame = button.frame();
                let mut origin = frame.origin;
                origin.y = target.y - frame.size.height / 2.0;
                // Preserve native horizontal spacing, sizes, and actions.
                if (origin.y - frame.origin.y).abs() > 0.01 {
                    button.setFrameOrigin(origin);
                }
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
