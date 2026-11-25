use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::sync::mpsc;
use std::time::Duration;

use serde_json::{json, Value};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{get_ipc_response, mock_builder, INVOKE_KEY};
use tauri::webview::InvokeRequest;

/// The real native HTTP plugin checks every hop using the shipped capability. A disposable HTTP
/// proxy plays both allowed standard-port hosts without needing DNS or a privileged listener.
#[test]
fn native_http_allows_in_scope_redirects_and_refuses_out_of_scope_hops() {
    let proxy = TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let proxy_url = format!("http://{}", proxy.local_addr().unwrap());
    let (requests, seen) = mpsc::channel();
    std::thread::spawn(move || {
        for stream in proxy.incoming().take(3) {
            let mut stream = stream.unwrap();
            stream.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
            let mut reader = BufReader::new(&stream);
            let mut line = String::new();
            reader.read_line(&mut line).unwrap();
            let target = line.split_whitespace().nth(1).unwrap().to_string();
            loop {
                line.clear();
                if reader.read_line(&mut line).unwrap() == 0 || line == "\r\n" {
                    break;
                }
            }
            requests.send(target.clone()).unwrap();
            let response = match target.as_str() {
                "http://origin.invalid/allowed" => {
                    "HTTP/1.1 302 Found\r\nLocation: http://cdn.invalid/image.png\r\n"
                }
                "http://origin.invalid/denied" => {
                    "HTTP/1.1 302 Found\r\nLocation: http://cdn.invalid:8080/image.png\r\n"
                }
                "http://cdn.invalid/image.png" => "HTTP/1.1 200 OK\r\n",
                _ => "HTTP/1.1 404 Not Found\r\n",
            };
            write!(stream, "{response}Content-Length: 0\r\nConnection: close\r\n\r\n").unwrap();
        }
    });

    let app = mock_builder()
        .plugin(tauri_plugin_http::init())
        .build(tauri::generate_context!())
        .unwrap();
    let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let invoke = |cmd: &str, body| {
        get_ipc_response(
            &window,
            InvokeRequest {
                cmd: format!("plugin:http|{cmd}"),
                callback: CallbackFn(0),
                error: CallbackFn(1),
                url: "tauri://localhost".parse().unwrap(),
                body: InvokeBody::Json(body),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.to_string(),
            },
        )
        .map(|body| body.deserialize::<Value>().unwrap())
    };
    let fetch = |url: &str| {
        let request = invoke(
            "fetch",
            json!({ "clientConfig": {
                "method": "GET", "url": url, "headers": [], "proxy": { "http": proxy_url },
                "connectTimeout": 2_000
            } }),
        )?;
        invoke("fetch_send", json!({ "rid": request }))
    };

    let response = fetch("http://origin.invalid/allowed").unwrap();
    assert_eq!(response["status"], 200);
    assert_eq!(response["url"], "http://cdn.invalid/image.png");
    for url in ["http://cdn.invalid:8080/image.png", "http://origin.invalid/denied"] {
        let error = fetch(url).unwrap_err();
        assert!(error.to_string().contains("url not allowed"), "{error}");
    }
    assert_eq!(
        seen.iter().collect::<Vec<_>>(),
        [
            "http://origin.invalid/allowed",
            "http://cdn.invalid/image.png",
            "http://origin.invalid/denied",
        ]
    );
}
