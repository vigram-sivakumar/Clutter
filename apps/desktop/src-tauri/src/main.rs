// Tauri-only window/navigation/close bridge. Core and UI own all product policy.
use serde_json::Value;
use std::{fs, sync::{Arc, Mutex}};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
struct Guard { allow: bool, pending: Option<String>, count: u64, first_navigation: bool }
fn main() {
    let args: Vec<String> = std::env::args().collect();
    let index = args.iter().position(|a| a == "--host-config").expect("HOST_CONFIG_REQUIRED");
    let path = args.get(index + 1).expect("HOST_CONFIG_REQUIRED");
    assert!(fs::metadata(path).expect("HOST_CONFIG_READ").len() < 1048576);
    let config: Value = serde_json::from_slice(&fs::read(path).expect("HOST_CONFIG_READ")).expect("HOST_CONFIG_JSON");
    let address = config["url"].as_str().expect("HOST_URL").to_owned();
    let url: tauri::Url = address.parse().expect("HOST_URL");
    assert_eq!(url.scheme(), "http"); assert_eq!(url.host_str(), Some("127.0.0.1"));
    assert_eq!(url.path(), "/"); assert!(url.query().is_none() && url.fragment().is_none());
    let config = Arc::new(config);
    let guard = Arc::new(Mutex::new(Guard { allow: false, pending: None, count: 0, first_navigation: true }));
    let exit_guard = guard.clone();
    tauri::Builder::default().setup(move |app| {
        let nav_guard = guard.clone(); let nav_config = config.clone(); let handle = app.handle().clone();
        let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url.clone()))
            .title("Clutter Structured").inner_size(1100., 780.).incognito(true)
            .initialization_script(config["script"].as_str().expect("HOST_SCRIPT"))
            .on_navigation(move |u| {
                if u.scheme() == "clutter-structured53" && u.host_str() == Some("event") {
                    if let Some((_, body)) = u.query_pairs().find(|(k, _)| k == "m") {
                        if body.len() <= 8192 {
                            if let Ok(m) = serde_json::from_str::<Value>(&body) {
                                if m["bootNonce"] == nav_config["bootNonce"] && m["event"] == "close" {
                                    let mut g = nav_guard.lock().unwrap();
                                    if g.pending.is_some() && m["guardNonce"].as_str() == g.pending.as_deref() {
                                        g.pending = None; g.allow = m["safe"] == true; let safe = g.allow; drop(g);
                                        if safe { if let Some(w) = handle.get_webview_window("main") { std::thread::spawn(move || { let _ = w.close(); }); } }
                                    }
                                }
                            }
                        }
                    }
                    return false;
                }
                let mut g = nav_guard.lock().unwrap();
                if g.first_navigation && u.as_str() == address { g.first_navigation = false; return true; }
                false // Raw reload/navigation may not discard an unprotected editor.
            }).build()?;
        let close_guard = guard.clone(); let close_window = window.clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let mut g = close_guard.lock().unwrap(); if g.allow { return; } api.prevent_close();
                if g.pending.is_some() { return; } g.count += 1; let nonce = g.count.to_string(); g.pending = Some(nonce.clone()); drop(g);
                let script = format!("globalThis.__clutterClose?.({});", serde_json::to_string(&nonce).unwrap());
                if close_window.eval(&script).is_err() { close_guard.lock().unwrap().pending = None; }
            }
        });
        Ok(())
    }).build(tauri::generate_context!()).expect("FOUNDATION_TAURI_BUILD")
    .run(move |app, event| { if let tauri::RunEvent::ExitRequested { api, .. } = event { if !exit_guard.lock().unwrap().allow { api.prevent_exit(); if let Some(w) = app.get_webview_window("main") { let _ = w.close(); } } } });
}
