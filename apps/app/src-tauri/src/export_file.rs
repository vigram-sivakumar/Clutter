//! Exporting a file or some bytes to a place the user chose: Download image, Download file, Download code block.
//!
//! An export is the one legitimate way Clutter writes a file that may already exist and is not in its own control
//! (the user chose "Replace" in the system's Save panel). It used to go through the fs plugin's `copy_file` and
//! `write_file`, which meant those two overwriting commands had to stay granted to the whole webview, for **any**
//! path inside `$HOME`, Spaces included. Nothing about them tied the destination to a Save panel.
//!
//! These commands tie it. The destination is never supplied by the caller:
//!
//! 1. `export_pick_destination` opens the system Save panel itself and keeps the path the user chose. The webview
//!    receives only an opaque, single-use ticket for it, never a path it could substitute.
//! 2. `export_copy_file` / `export_write_file` redeem the ticket: they write to the path the user chose, once.
//!
//! So script in the webview can no longer name a file in a Space (or anywhere) and overwrite it: it can only write to
//! a place the user has just picked in a panel the webview cannot drive, and a name that already exists there is one
//! the user has just been asked about by the system. The fs plugin's `copy_file`, `write_file` (and `create`,
//! `truncate`, `write`) are no longer granted to the webview (`capabilities/default.json`).
//!
//! The source of a copy is authorized like any other path the webview names (`fs_authorization`: inside the runtime
//! fs scope, real path), so an export cannot be used to read a file the webview has no access to. Nothing is added to
//! the fs scope for the chosen destination (the plugin's `save` command added every exported path to the scope, and
//! the persisted-scope plugin then kept it for good).
//!
//! Limits, stated rather than hidden:
//! * A destination the user picks inside a Space *can* replace a file there, after the system's own confirmation.
//!   That replacement does not go through the Persistence Gate; the Space's watcher sees it as an outside change.
//! * The write is a plain truncating write to the chosen file, as the plugin's was: it is not staged, because the
//!   sandbox grants a Save panel's file, not its folder, so a sibling temporary file could not be created there.
//!   An interruption mid-export can leave that one chosen file incomplete; nothing else is touched.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Manager, Runtime, Window};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::FsExt;

use crate::fs_authorization::authorize;

/// How many chosen destinations wait to be used. More than one export is never in flight at a time; the bound only
/// keeps a script that opens panels and abandons the tickets from growing the map.
const MAX_PENDING: usize = 4;

#[derive(Default)]
struct Pending {
    next: u64,
    chosen: BTreeMap<u64, PathBuf>,
}

/// The destinations the user has chosen in a Save panel and not yet written to. Managed state.
#[derive(Default)]
pub struct ExportTickets(Mutex<Pending>);

impl ExportTickets {
    /// Keeps `destination` and returns the ticket for it. The oldest unused ticket is dropped when the bound is hit.
    pub fn issue(&self, destination: PathBuf) -> u64 {
        let mut pending = self.0.lock().unwrap();
        pending.next += 1;
        let id = pending.next;
        while pending.chosen.len() >= MAX_PENDING {
            let Some(oldest) = pending.chosen.keys().next().copied() else { break };
            pending.chosen.remove(&oldest);
        }
        pending.chosen.insert(id, destination);
        id
    }

    /// The destination a ticket stands for. A ticket works once: whatever happens next, it is spent.
    pub fn redeem(&self, id: u64) -> Result<PathBuf, String> {
        self.0.lock().unwrap().chosen.remove(&id).ok_or_else(|| "that export destination was not chosen, or was already used".to_string())
    }
}

/// The file name offered in the Save panel: only a name, never a folder, whatever the caller passed.
fn suggested_name(requested: &str) -> String {
    Path::new(requested)
        .file_name()
        .map(|name| name.to_string_lossy().replace('\0', ""))
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "export".to_string())
}

fn refuse_a_folder(destination: &Path) -> Result<(), String> {
    match fs::metadata(destination) {
        Ok(info) if info.is_dir() => Err("the chosen destination is a folder, not a file".into()),
        _ => Ok(()),
    }
}

#[cfg(unix)]
fn is_same_file(a: &Path, b: &Path) -> bool {
    use std::os::unix::fs::MetadataExt;
    match (fs::metadata(a), fs::metadata(b)) {
        (Ok(a), Ok(b)) => a.dev() == b.dev() && a.ino() == b.ino(),
        _ => false,
    }
}

#[cfg(not(unix))]
fn is_same_file(a: &Path, b: &Path) -> bool {
    matches!((fs::canonicalize(a), fs::canonicalize(b)), (Ok(a), Ok(b)) if a == b)
}

/// Copies the file `from` over the destination the user chose. `from` is only read. Copying a file onto itself would
/// truncate it first, so it is refused.
pub fn copy_export(from: &Path, destination: &Path) -> Result<(), String> {
    if !fs::metadata(from).map_err(|error| error.to_string())?.is_file() {
        return Err("the source is not a file".into());
    }
    refuse_a_folder(destination)?;
    if is_same_file(from, destination) {
        return Err("the chosen destination is the file being exported".into());
    }
    fs::copy(from, destination).map(|_| ()).map_err(|error| error.to_string())
}

/// Writes `bytes` to the destination the user chose.
pub fn write_export(destination: &Path, bytes: &[u8]) -> Result<(), String> {
    refuse_a_folder(destination)?;
    fs::write(destination, bytes).map_err(|error| error.to_string())
}

/// Opens the system Save panel (blocking until it closes) and keeps what the user chose. `None`: cancelled.
#[tauri::command]
pub async fn export_pick_destination<R: Runtime>(app: AppHandle<R>, window: Window<R>, default_name: String) -> Result<Option<u64>, String> {
    let name = suggested_name(&default_name);
    let panel_app = app.clone();
    let chosen = tauri::async_runtime::spawn_blocking(move || panel_app.dialog().file().set_parent(&window).set_file_name(name).blocking_save_file())
        .await
        .map_err(|error| error.to_string())?;
    let Some(chosen) = chosen else { return Ok(None) };
    let destination = chosen.into_path().map_err(|error| error.to_string())?;
    if !destination.is_absolute() {
        return Err("the chosen destination is not an absolute path".into());
    }
    Ok(Some(app.state::<ExportTickets>().issue(destination)))
}

/// Copies the file `from` (which must be inside the fs scope) to the destination behind `ticket`.
#[tauri::command]
pub async fn export_copy_file<R: Runtime>(app: AppHandle<R>, ticket: u64, from: String) -> Result<(), String> {
    let destination = app.state::<ExportTickets>().redeem(ticket)?;
    let scope = app.fs_scope();
    tauri::async_runtime::spawn_blocking(move || {
        let from = authorize(&from, &|path: &Path| scope.is_allowed(path), &|path: &Path| scope.is_forbidden(path))?;
        copy_export(&from, &destination)
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Writes the request body to the destination behind the `ticket` header.
#[tauri::command]
pub async fn export_write_file<R: Runtime>(app: AppHandle<R>, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let ticket = request
        .headers()
        .get("ticket")
        .and_then(|value| value.to_str().ok())
        .and_then(|text| text.parse::<u64>().ok())
        .ok_or_else(|| "missing or invalid export ticket".to_string())?;
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => bytes.clone(),
        _ => return Err("unexpected invoke body".into()),
    };
    let destination = app.state::<ExportTickets>().redeem(ticket)?;
    tauri::async_runtime::spawn_blocking(move || write_export(&destination, &bytes)).await.map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    use serde_json::{json, Value};
    use tauri::ipc::{CallbackFn, InvokeBody};
    use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, INVOKE_KEY};
    use tauri::webview::InvokeRequest;

    struct Scratch(PathBuf);

    impl Scratch {
        fn new(label: &str) -> Self {
            let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
            let base = fs::canonicalize(std::env::temp_dir()).unwrap().join(format!("clutter-export-{label}-{}-{nanos}", std::process::id()));
            fs::create_dir_all(&base).unwrap();
            Scratch(base)
        }
        fn path(&self, name: &str) -> PathBuf {
            self.0.join(name)
        }
        fn names(&self) -> Vec<String> {
            let mut names: Vec<String> = fs::read_dir(&self.0).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
            names.sort();
            names
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    // ---- tickets -------------------------------------------------------------------------------------

    #[test]
    fn a_ticket_stands_for_the_chosen_path_and_works_once() {
        let tickets = ExportTickets::default();
        let id = tickets.issue(PathBuf::from("/chosen/by/the/user.png"));

        assert_eq!(tickets.redeem(id).unwrap(), PathBuf::from("/chosen/by/the/user.png"));
        assert!(tickets.redeem(id).is_err(), "spent");
    }

    #[test]
    fn a_ticket_nobody_issued_is_worth_nothing() {
        let tickets = ExportTickets::default();
        let id = tickets.issue(PathBuf::from("/a"));

        assert!(tickets.redeem(id + 1).is_err());
        assert!(tickets.redeem(0).is_err());
        assert!(tickets.redeem(u64::MAX).is_err());
        assert_eq!(tickets.redeem(id).unwrap(), PathBuf::from("/a"), "a wrong guess spends nothing");
    }

    #[test]
    fn abandoned_tickets_are_bounded_and_the_oldest_is_dropped_first() {
        let tickets = ExportTickets::default();
        let ids: Vec<u64> = (0..MAX_PENDING + 2).map(|n| tickets.issue(PathBuf::from(format!("/p{n}")))).collect();

        assert!(tickets.redeem(ids[0]).is_err());
        assert!(tickets.redeem(ids[1]).is_err());
        assert_eq!(tickets.redeem(*ids.last().unwrap()).unwrap(), PathBuf::from(format!("/p{}", MAX_PENDING + 1)));
    }

    #[test]
    fn the_name_offered_in_the_panel_is_only_ever_a_file_name() {
        assert_eq!(suggested_name("photo.png"), "photo.png");
        assert_eq!(suggested_name("/Users/me/Space/Assets/photo.png"), "photo.png");
        assert_eq!(suggested_name("../../etc/passwd"), "passwd");
        assert_eq!(suggested_name(""), "export");
        assert_eq!(suggested_name("/"), "export");
        assert_eq!(suggested_name("a\0b.png"), "ab.png");
    }

    // ---- the operations ------------------------------------------------------------------------------

    #[test]
    fn exporting_a_file_to_a_new_name_copies_it_whole_and_leaves_the_source() {
        let dir = Scratch::new("copy-new");
        fs::write(dir.path("source.png"), b"image bytes").unwrap();

        copy_export(&dir.path("source.png"), &dir.path("exported.png")).unwrap();

        assert_eq!(fs::read(dir.path("exported.png")).unwrap(), b"image bytes");
        assert_eq!(fs::read(dir.path("source.png")).unwrap(), b"image bytes");
        assert_eq!(dir.names(), vec!["exported.png", "source.png"]);
    }

    #[test]
    fn exporting_over_a_file_the_user_chose_to_replace_replaces_it() {
        let dir = Scratch::new("copy-replace");
        fs::write(dir.path("source.png"), b"new image").unwrap();
        fs::write(dir.path("earlier-export.png"), b"older export").unwrap();

        copy_export(&dir.path("source.png"), &dir.path("earlier-export.png")).unwrap();
        write_export(&dir.path("earlier-export.png"), b"newest").unwrap();

        assert_eq!(fs::read(dir.path("earlier-export.png")).unwrap(), b"newest");
        assert_eq!(fs::read(dir.path("source.png")).unwrap(), b"new image");
    }

    #[test]
    fn exporting_a_file_onto_itself_is_refused_and_never_empties_it() {
        let dir = Scratch::new("copy-self");
        fs::write(dir.path("note.png"), b"original").unwrap();
        std::os::unix::fs::symlink(dir.path("note.png"), dir.path("alias.png")).unwrap();

        assert!(copy_export(&dir.path("note.png"), &dir.path("note.png")).is_err());
        assert!(copy_export(&dir.path("note.png"), &dir.path("alias.png")).is_err(), "a link to the source is the source");

        assert_eq!(fs::read(dir.path("note.png")).unwrap(), b"original");
    }

    #[test]
    fn a_folder_is_never_a_source_or_a_destination() {
        let dir = Scratch::new("folders");
        fs::create_dir(dir.path("Folder")).unwrap();
        fs::write(dir.path("a.png"), b"a").unwrap();

        assert!(copy_export(&dir.path("Folder"), &dir.path("out.png")).is_err());
        assert!(copy_export(&dir.path("a.png"), &dir.path("Folder")).is_err());
        assert!(write_export(&dir.path("Folder"), b"x").is_err());
        assert!(copy_export(&dir.path("missing.png"), &dir.path("out.png")).is_err());
        assert_eq!(dir.names(), vec!["Folder", "a.png"]);
    }

    #[test]
    fn exporting_bytes_writes_them_whole() {
        let dir = Scratch::new("write");

        write_export(&dir.path("snippet.rs"), b"fn main() {}").unwrap();

        assert_eq!(fs::read(dir.path("snippet.rs")).unwrap(), b"fn main() {}");
        assert!(write_export(&dir.path("missing-folder/snippet.rs"), b"x").is_err());
    }

    // ---- the command boundary (mock runtime, real IPC dispatch, real fs-plugin scope) ------------------

    type MockApp = tauri::App<tauri::test::MockRuntime>;

    fn app_with_scope(allowed: &[&Path]) -> (MockApp, tauri::WebviewWindow<tauri::test::MockRuntime>) {
        let app = mock_builder()
            .plugin(tauri_plugin_fs::init())
            .manage(ExportTickets::default())
            .invoke_handler(tauri::generate_handler![export_copy_file, export_write_file])
            .build(mock_context(noop_assets()))
            .expect("the mock app builds");
        for directory in allowed {
            app.fs_scope().allow_directory(directory, true).unwrap();
        }
        let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default()).build().unwrap();
        (app, window)
    }

    fn invoke(window: &tauri::WebviewWindow<tauri::test::MockRuntime>, command: &str, body: InvokeBody, ticket_header: Option<&str>) -> Result<Value, Value> {
        let mut headers = tauri::http::HeaderMap::new();
        if let Some(ticket) = ticket_header {
            headers.insert("ticket", ticket.parse().unwrap());
        }
        get_ipc_response(
            window,
            InvokeRequest {
                cmd: command.into(),
                callback: CallbackFn(0),
                error: CallbackFn(1),
                url: "tauri://localhost".parse().unwrap(),
                body,
                headers,
                invoke_key: INVOKE_KEY.to_string(),
            },
        )
        .map(|body| body.deserialize::<Value>().unwrap())
    }

    /// What the Save panel does: the user picked `destination`.
    fn user_picks(app: &MockApp, destination: &Path) -> u64 {
        app.state::<ExportTickets>().issue(destination.to_path_buf())
    }

    #[test]
    fn a_vault_file_cannot_be_overwritten_by_naming_it_the_command_takes_no_path_and_a_guessed_ticket_is_refused() {
        let vault = Scratch::new("ipc-vault");
        fs::write(vault.path("Note.md"), b"my note").unwrap();
        fs::write(vault.path("photo.png"), b"my photo").unwrap();
        let (app, window) = app_with_scope(&[&vault.0]);
        // The user has picked one unrelated place; a script can only hold tickets the user's picks produced.
        let elsewhere = Scratch::new("ipc-elsewhere");
        let real_ticket = user_picks(&app, &elsewhere.path("export.png"));

        // A script that tries to point the export at a vault file by passing a path where a ticket belongs, by
        // guessing a ticket, or by adding a destination argument: every attempt is refused, nothing is written.
        for attempt in [
            InvokeBody::Json(json!({ "ticket": vault.path("photo.png"), "from": vault.path("Note.md") })),
            InvokeBody::Json(json!({ "ticket": real_ticket + 100, "from": vault.path("Note.md") })),
            InvokeBody::Json(json!({ "ticket": 0, "from": vault.path("Note.md") })),
            InvokeBody::Json(json!({ "from": vault.path("Note.md"), "destination": vault.path("photo.png") })),
        ] {
            assert!(invoke(&window, "export_copy_file", attempt, None).is_err());
        }
        let path_as_ticket = vault.path("photo.png").to_string_lossy().into_owned();
        for header in [None, Some("not-a-number"), Some("-1"), Some(path_as_ticket.as_str())] {
            assert!(invoke(&window, "export_write_file", InvokeBody::Raw(b"OVERWRITTEN".to_vec()), header).is_err());
        }
        let forged = (real_ticket + 1).to_string();
        assert!(invoke(&window, "export_write_file", InvokeBody::Raw(b"OVERWRITTEN".to_vec()), Some(&forged)).is_err());

        assert_eq!(fs::read(vault.path("Note.md")).unwrap(), b"my note");
        assert_eq!(fs::read(vault.path("photo.png")).unwrap(), b"my photo");
        assert_eq!(vault.names(), vec!["Note.md", "photo.png"]);
        assert!(elsewhere.names().is_empty(), "the one real ticket was not spent by the failed attempts");
        assert!(app.state::<ExportTickets>().redeem(real_ticket).is_ok());
    }

    #[test]
    fn a_legitimate_export_through_the_commands_writes_to_exactly_the_chosen_place_once() {
        let vault = Scratch::new("ipc-export-vault");
        let desktop = Scratch::new("ipc-export-desktop");
        fs::write(vault.path("photo.png"), b"my photo").unwrap();
        fs::write(desktop.path("previous.png"), b"previous export").unwrap();
        let (app, window) = app_with_scope(&[&vault.0]);

        // Copy a vault file to a place outside every granted folder, which the user picked.
        let ticket = user_picks(&app, &desktop.path("photo-export.png"));
        let copied = invoke(&window, "export_copy_file", InvokeBody::Json(json!({ "ticket": ticket, "from": vault.path("photo.png") })), None);
        assert!(copied.is_ok(), "{copied:?}");
        assert_eq!(fs::read(desktop.path("photo-export.png")).unwrap(), b"my photo");
        assert_eq!(fs::read(vault.path("photo.png")).unwrap(), b"my photo", "the source is untouched");

        // The ticket is spent: the same ticket cannot write again, to anywhere.
        let again = invoke(&window, "export_copy_file", InvokeBody::Json(json!({ "ticket": ticket, "from": vault.path("photo.png") })), None);
        assert!(again.is_err());

        // Bytes, to a name the user chose to replace.
        let ticket = user_picks(&app, &desktop.path("previous.png"));
        let written = invoke(&window, "export_write_file", InvokeBody::Raw(b"code block text".to_vec()), Some(&ticket.to_string()));
        assert!(written.is_ok(), "{written:?}");
        assert_eq!(fs::read(desktop.path("previous.png")).unwrap(), b"code block text");
        assert_eq!(desktop.names(), vec!["photo-export.png", "previous.png"]);
    }

    #[test]
    fn an_export_cannot_read_a_file_the_webview_has_no_access_to() {
        let vault = Scratch::new("ipc-read-vault");
        let outside = Scratch::new("ipc-read-outside");
        let desktop = Scratch::new("ipc-read-desktop");
        fs::write(outside.path("secret.txt"), b"TOP SECRET CONTENT").unwrap();
        std::os::unix::fs::symlink(outside.path("secret.txt"), vault.path("innocent.png")).unwrap();
        let (app, window) = app_with_scope(&[&vault.0]);

        for from in [outside.path("secret.txt"), vault.path("innocent.png")] {
            let ticket = user_picks(&app, &desktop.path("stolen.txt"));
            let result = invoke(&window, "export_copy_file", InvokeBody::Json(json!({ "ticket": ticket, "from": from })), None);
            let error = result.unwrap_err().to_string();
            assert!(error.contains("forbidden path"), "{error}");
            assert!(!error.contains("TOP SECRET"));
        }
        // A relative path and a `..` path are nothing either.
        for from in ["secret.txt".to_string(), format!("{}/../{}/secret.txt", vault.0.display(), outside.0.file_name().unwrap().to_string_lossy())] {
            let ticket = user_picks(&app, &desktop.path("stolen.txt"));
            assert!(invoke(&window, "export_copy_file", InvokeBody::Json(json!({ "ticket": ticket, "from": from })), None).is_err());
        }
        assert!(desktop.names().is_empty());
    }

    #[test]
    fn an_export_to_a_destination_that_has_since_become_a_folder_or_the_source_changes_nothing() {
        let vault = Scratch::new("ipc-edge-vault");
        fs::write(vault.path("photo.png"), b"my photo").unwrap();
        fs::create_dir(vault.path("Folder")).unwrap();
        let (app, window) = app_with_scope(&[&vault.0]);

        let onto_folder = user_picks(&app, &vault.path("Folder"));
        assert!(invoke(&window, "export_copy_file", InvokeBody::Json(json!({ "ticket": onto_folder, "from": vault.path("photo.png") })), None).is_err());
        let onto_itself = user_picks(&app, &vault.path("photo.png"));
        assert!(invoke(&window, "export_copy_file", InvokeBody::Json(json!({ "ticket": onto_itself, "from": vault.path("photo.png") })), None).is_err());

        assert_eq!(fs::read(vault.path("photo.png")).unwrap(), b"my photo");
        assert_eq!(vault.names(), vec!["Folder", "photo.png"]);
    }
}
