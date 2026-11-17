// Native window/navigation/close mechanism only. Shared UI/Core owns semantics.
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs::{self, File, OpenOptions},
    io::Write,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

struct Guard {
    allow: bool,
    pending: Option<String>,
    count: u64,
    first_navigation: bool,
}
#[derive(Default)]
struct Windows {
    guards: HashMap<String, Guard>,
    requests: HashMap<(String, String), Value>,
    next: u64,
    quitting: bool,
}
type SharedWindows = Arc<Mutex<Windows>>;
fn id(value: &str) -> bool {
    !value.is_empty() && value.len() <= 128
        && value.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}
fn respond(app: &AppHandle, label: &str, request: &str, result: Value) {
    if let Some(window) = app.get_webview_window(label) {
        let message = json!({"requestId":request,"ok":result["ok"],"value":result["value"]});
        let _ = window.eval(&format!("globalThis.__clutterHostReply?.({message});"));
    }
}
// Private developer locator: IDs only, no token/body/save policy. Persist before reveal.
fn record_window(config: &Value, window_id: &str, page: &str) -> Result<(), String> {
    let directory = PathBuf::from(config["windowsDirectory"].as_str().ok_or("WINDOW_DIRECTORY_REQUIRED")?);
    let path = directory.join(format!("{window_id}.json"));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)] {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path).map_err(|_| "WINDOW_RECORD_CREATE")?;
    let bytes = serde_json::to_vec(&json!({"windowId":window_id,"initialPageId":page}))
        .map_err(|_| "WINDOW_RECORD_JSON")?;
    file.write_all(&bytes).map_err(|_| "WINDOW_RECORD_WRITE")?;
    file.sync_all().map_err(|_| "WINDOW_RECORD_SYNC")?;
    File::open(directory).and_then(|f| f.sync_all()).map_err(|_| "WINDOW_DIRECTORY_SYNC")?;
    Ok(())
}
fn close_reply(app: &AppHandle, label: &str, message: &Value, windows: &SharedWindows) {
    let mut state = windows.lock().unwrap();
    let Some(guard) = state.guards.get_mut(label) else { return; };
    if guard.pending.is_none() || message["guardNonce"].as_str() != guard.pending.as_deref() {
        return;
    }
    guard.pending = None;
    let safe = message["safe"] == true;
    guard.allow = safe;
    if state.quitting {
        if !safe {
            state.quitting = false;
            for guard in state.guards.values_mut() {
                guard.allow = false;
                guard.pending = None;
            }
            drop(state);
            // A refused app quit must thaw peers that already prepared successfully.
            for window in app.webview_windows().values() {
                let _ = window.eval("globalThis.__clutterResume?.();");
            }
        } else if state.guards.values().all(|guard| guard.allow) {
            drop(state);
            let handle = app.clone();
            std::thread::spawn(move || handle.exit(0));
        }
    } else if safe {
        drop(state);
        if let Some(window) = app.get_webview_window(label) {
            std::thread::spawn(move || { let _ = window.close(); });
        }
    }
}
fn open_child(app: &AppHandle, source: &str, message: &Value, config: &Arc<Value>, windows: &SharedWindows) {
    let page = message["pageId"].as_str().unwrap_or("").to_owned();
    let request = message["requestId"].as_str().unwrap_or("").to_owned();
    if !id(&page) || !id(&request) { return; }
    let key = (source.to_owned(), request.clone());
    let mut state = windows.lock().unwrap();
    if let Some(prior) = state.requests.get(&key) {
        let response = prior.clone();
        drop(state);
        respond(app, source, &request, response);
        return;
    }
    let pending = state.requests.values().filter(|r| r["pending"] == true).count();
    if state.quitting || state.guards.len() + pending >= 64 || state.requests.len() >= 4096 {
        drop(state);
        respond(app, source, &request, json!({"ok":false}));
        return;
    }
    state.next += 1;
    let number = state.next;
    // Reserve before dispatch so repeated request delivery cannot duplicate a window.
    state.requests.insert(key.clone(), json!({"ok":false,"pending":true}));
    drop(state);
    let app = app.clone();
    let shared = windows.clone();
    let mut child = (**config).clone();
    let source = source.to_owned();
    // Tauri window creation stays off synchronous navigation callbacks.
    std::thread::spawn(move || {
        let root_nonce = child["rootNonce"].as_str()
            .unwrap_or(child["bootNonce"].as_str().unwrap()).to_owned();
        let child_id = format!("window_{root_nonce}_{number}");
        child["windowId"] = json!(child_id);
        child["bootNonce"] = json!(format!("{root_nonce}_{number}"));
        child["initialPageId"] = json!(page);
        child["rootNonce"] = json!(root_nonce);
        let result = record_window(&child, &child_id, child["initialPageId"].as_str().unwrap())
            .and_then(|_| create_window(&app, format!("window_{number}"), Arc::new(child), shared.clone()));
        let response = match result {
            Ok(()) => json!({"ok":true,"value":{"windowId":child_id}}),
            Err(_) => json!({"ok":false}),
        };
        shared.lock().unwrap().requests.insert(key, response.clone());
        respond(&app, &source, &request, response);
    });
}
fn create_window(app: &AppHandle, label: String, config: Arc<Value>, windows: SharedWindows) -> Result<(), String> {
    let address = config["url"].as_str().ok_or("HOST_URL")?.to_owned();
    let url: tauri::Url = address.parse().map_err(|_| "HOST_URL")?;
    let window_id = config["windowId"].as_str().ok_or("WINDOW_ID")?.to_owned();
    let boot = config["bootNonce"].as_str().ok_or("BOOT_NONCE")?.to_owned();
    let public = json!({
        "url":url.origin().ascii_serialization(), "token":config["token"],
        "spaceId":config["spaceId"], "windowId":window_id, "bootNonce":boot,
        "initialPageId":config["initialPageId"],
        "allowDuplicateNoteInTab":config["allowDuplicateNoteInTab"].as_bool().unwrap_or(false)
    });
    let script = format!(
        "Object.defineProperty(globalThis,'__clutterNativeWindowConfig',{{value:{public}}});\n{}",
        config["script"].as_str().ok_or("HOST_SCRIPT")?
    );
    let handle = app.clone();
    let nav_label = label.clone();
    let nav_windows = windows.clone();
    let nav_config = config.clone();
    windows.lock().unwrap().guards.insert(label.clone(), Guard {
        allow: false, pending: None, count: 0, first_navigation: true,
    });
    let built = WebviewWindowBuilder::new(app, label.clone(), WebviewUrl::External(url))
        .title("Clutter Structured").inner_size(1100., 780.).visible(false)
        .incognito(true).initialization_script(script)
        .on_navigation(move |url| {
            if url.scheme() == "clutter-structured53" && url.host_str() == Some("event") {
                if let Some((_, body)) = url.query_pairs().find(|(key, _)| key == "m") {
                    if body.len() <= 8192 {
                        if let Ok(message) = serde_json::from_str::<Value>(&body) {
                            if message["bootNonce"] != boot || message["windowId"] != window_id { return false; }
                            match message["event"].as_str() {
                                Some("ready" | "error") => {
                                    if let Some(window) = handle.get_webview_window(&nav_label) {
                                        let _ = window.show();
                                        let _ = window.set_focus();
                                    }
                                }
                                Some("open-window") => open_child(&handle, &nav_label, &message, &nav_config, &nav_windows),
                                Some("close") => close_reply(&handle, &nav_label, &message, &nav_windows),
                                _ => {}
                            }
                        }
                    }
                }
                return false;
            }
            let mut state = nav_windows.lock().unwrap();
            if let Some(guard) = state.guards.get_mut(&nav_label) {
                if guard.first_navigation && url.as_str() == address {
                    guard.first_navigation = false;
                    return true;
                }
            }
            false // Raw navigation/reload cannot discard an unprotected editor.
        }).build();
    let window = match built {
        Ok(window) => window,
        Err(_) => {
            windows.lock().unwrap().guards.remove(&label);
            return Err("NATIVE_WINDOW_BUILD".into());
        }
    };
    let close_windows = windows.clone();
    let close_window = window.clone();
    let close_label = label.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            close_windows.lock().unwrap().guards.remove(&close_label);
        }
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            let mut state = close_windows.lock().unwrap();
            let Some(guard) = state.guards.get_mut(&close_label) else { api.prevent_close(); return; };
            if guard.allow { return; }
            api.prevent_close();
            if guard.pending.is_some() { return; }
            guard.count += 1;
            let nonce = guard.count.to_string();
            guard.pending = Some(nonce.clone());
            drop(state);
            let script = format!("globalThis.__clutterClose?.({});", serde_json::to_string(&nonce).unwrap());
            if close_window.eval(&script).is_err() {
                if let Some(guard) = close_windows.lock().unwrap().guards.get_mut(&close_label) { guard.pending = None; }
            }
        }
    });
    // An opening request may have preceded a quit, but completed after its snapshot.
    if windows.lock().unwrap().quitting {
        let window = window.clone();
        std::thread::spawn(move || { let _ = window.close(); });
    }
    Ok(())
}
fn main() {
    let args: Vec<String> = std::env::args().collect();
    let index = args.iter().position(|a| a == "--host-config").expect("HOST_CONFIG_REQUIRED");
    let path = args.get(index + 1).expect("HOST_CONFIG_REQUIRED");
    assert!(fs::metadata(path).expect("HOST_CONFIG_READ").len() < 1048576);
    let config: Value = serde_json::from_slice(&fs::read(path).expect("HOST_CONFIG_READ")).expect("HOST_CONFIG_JSON");
    let url: tauri::Url = config["url"].as_str().expect("HOST_URL").parse().expect("HOST_URL");
    assert_eq!(url.scheme(), "http");
    assert_eq!(url.host_str(), Some("127.0.0.1"));
    assert_eq!(url.path(), "/");
    assert!(url.query().is_none() && url.fragment().is_none() && url.username().is_empty() && url.password().is_none());
    let config = Arc::new(config);
    let windows = Arc::new(Mutex::new(Windows::default()));
    let exit_windows = windows.clone();
    tauri::Builder::default().setup(move |app| {
        create_window(app.handle(), "main".to_owned(), config.clone(), windows.clone())
            .map_err(std::io::Error::other)?;
        Ok(())
    }).build(tauri::generate_context!()).expect("STRUCTURED_TAURI_BUILD")
    .run(move |app, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            let mut state = exit_windows.lock().unwrap();
            if state.guards.values().all(|guard| guard.allow) { return; }
            api.prevent_exit();
            if state.quitting { return; }
            state.quitting = true;
            drop(state);
            for window in app.webview_windows().values() { let _ = window.close(); }
        }
    });
}
