use std::{fs::{self, OpenOptions}, io::Write, os::unix::fs::OpenOptionsExt, sync::{Arc, Mutex}};
use serde_json::{Value,json};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
struct Guard { allow:bool, pending:Option<String>, count:u64 }
fn record(config:&Value,event:&str,safe:Option<bool>) {
 let mut v=json!({"host":"H-T","event":event});if let Some(s)=safe{v["safe"]=json!(s);}
 if let Some(path)=config["report"].as_str(){if let Ok(mut f)=OpenOptions::new().create(true).append(true).mode(0o600).open(path){let _=writeln!(f,"{}",v);}}
}
fn main(){
 let args:Vec<String>=std::env::args().collect();let i=args.iter().position(|s|s=="--host-config").expect("HOST_CONFIG_REQUIRED");
 let bytes=fs::read(args.get(i+1).expect("HOST_CONFIG_REQUIRED")).expect("HOST_CONFIG_READ");assert!(bytes.len()<1048576);
 let config:Value=serde_json::from_slice(&bytes).expect("HOST_CONFIG_JSON");let address=config["url"].as_str().expect("HOST_URL").to_owned();
 let url:tauri::Url=address.parse().expect("HOST_URL");assert_eq!(url.scheme(),"http");assert_eq!(url.host_str(),Some("127.0.0.1"));
 let config=Arc::new(config);let guard=Arc::new(Mutex::new(Guard{allow:false,pending:None,count:0}));let exit_guard=guard.clone();
 tauri::Builder::default().setup(move|app|{
  let nav_config=config.clone();let nav_guard=guard.clone();let app_handle=app.handle().clone();let allowed_address=address.clone();
  let window=WebviewWindowBuilder::new(app,"main",WebviewUrl::External(url.clone())).title("Clutter H-T · build smoke").inner_size(1024.,768.).resizable(false).incognito(true)
   .initialization_script(config["script"].as_str().expect("HOST_SCRIPT"))
   .on_navigation(move|u|{
    if u.scheme()=="clutter-host34" && u.host_str()==Some("event") {
     if let Some((_,body))=u.query_pairs().find(|(k,_)|k=="m") {if body.len()<=8192 {if let Ok(m)=serde_json::from_str::<Value>(&body) {if m["bootNonce"]==nav_config["bootNonce"] {
      match m["event"].as_str().unwrap_or("") {
       "close"=>{let mut g=nav_guard.lock().unwrap();if m["guardNonce"].as_str()==g.pending.as_deref() && g.pending.is_some(){g.pending=None;let safe=m["safe"]==true;g.allow=safe;record(&nav_config,"close-guard",Some(safe));drop(g);if safe {if let Some(w)=app_handle.get_webview_window("main"){std::thread::spawn(move||{let _=w.close();});}}}},
       "ready"|"error"|"pdf-not-qualified"=>record(&nav_config,m["event"].as_str().unwrap(),None),_=>{}
      }
     }}}}return false;
    }
    u.as_str()==allowed_address
   }).build()?;
  let close_guard=guard.clone();let close_window=window.clone();
  window.on_window_event(move|event|{if let tauri::WindowEvent::CloseRequested{api,..}=event{
   let mut g=close_guard.lock().unwrap();if g.allow{return;}api.prevent_close();if g.pending.is_some(){return;}g.count+=1;let nonce=g.count.to_string();g.pending=Some(nonce.clone());drop(g);
   let script=format!("globalThis.__host34Close?.({});",serde_json::to_string(&nonce).unwrap());
   if close_window.eval(&script).is_err(){close_guard.lock().unwrap().pending=None;}
  }});Ok(())
 }).build(tauri::generate_context!()).expect("H_T_BUILD")
 .run(move|app,event|{if let tauri::RunEvent::ExitRequested{api,..}=event{if !exit_guard.lock().unwrap().allow{api.prevent_exit();if let Some(w)=app.get_webview_window("main"){let _=w.close();}}}});
}
