//! Creating a file that must not exist yet: `copyFile` and `writeBinaryFile` for the local filesystem.
//!
//! The fs plugin's `copy_file` and `write_file` replace whatever is at the destination (`std::fs::copy` and a
//! truncating open). Asset import, remote-image saving and Duplicate all pick a free name first and then write, and
//! a file another process creates in between would be silently replaced. These commands close that window the way
//! `move_no_clobber` does for moves, with the operating system deciding, not a prior `exists` check:
//!
//! 1. the content is staged in a hidden temporary file next to the destination, created exclusively
//!    (`create_new`), so it can never be an existing file;
//! 2. the temporary file is flushed, then published with `move_no_clobber`: the destination name is claimed with a
//!    hard link, which fails if the name exists, and only then is the temporary name removed.
//!
//! So a reader sees either no file or the whole file at the destination, never a truncated one, and an existing
//! destination is never touched. On a collision or any failure the source is left alone, the destination is left as
//! it was and the temporary file is removed. A collision answers `EEXIST: ...` (the frontend turns it into a
//! `DestinationExistsError` and picks another name).
//!
//! Limits, stated rather than hidden:
//! * On a volume without hard links `move_no_clobber` falls back to a check followed by a rename, which has a small
//!   window. Clutter only supports APFS (hard links are available there).
//! * A crash between staging and publishing leaves a `.clutter-tmp.asset.*` file. The watcher ignores it; nothing
//!   sweeps it yet (the same open item as the atomic writer's temporaries).
//! * The destination's folder must already exist; nothing creates parents.
//!
//! Scope: the same fs scope the plugin commands these replace were held to. The paths are resolved first (a symlinked
//! parent or a `..` cannot lead out of the granted folder) and a hidden entry such as `.folder.md` is judged the way
//! Clutter configures the plugin (`requireLiteralLeadingDot: false`): as the same entry without the dot would be.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

use tauri::{AppHandle, Runtime};
use tauri_plugin_fs::FsExt;

use crate::fs_authorization::authorize;
use crate::move_no_clobber::move_no_clobber;

/// The shared prefix of every hidden temporary file Clutter stages (the watcher ignores names that start with it).
const TEMP_PREFIX: &str = ".clutter-tmp.asset.";

static NEXT_TEMP: AtomicU64 = AtomicU64::new(0);

fn temp_name() -> String {
    let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    format!("{TEMP_PREFIX}{}.{}.{nanos:x}", std::process::id(), NEXT_TEMP.fetch_add(1, Ordering::Relaxed))
}

fn exists_error(to: &Path) -> String {
    format!("EEXIST: destination already exists: {}", to.display())
}

/// Stages content in a fresh temporary file beside `to` (`fill` receives the exclusively created file's path and an
/// open handle to it) and publishes it at `to` without replacing anything. The temporary file never outlives the call.
fn stage_and_publish(to: &Path, fill: impl FnOnce(&Path, &mut File) -> std::io::Result<()>) -> Result<(), String> {
    let parent = to.parent().filter(|parent| !parent.as_os_str().is_empty()).ok_or_else(|| "the destination has no folder".to_string())?;
    // An early answer so a large copy is not made for a name that is plainly taken. Advisory only: the claim below decides.
    if fs::symlink_metadata(to).is_ok() {
        return Err(exists_error(to));
    }
    let temp = parent.join(temp_name());
    let mut staged = OpenOptions::new().write(true).create_new(true).open(&temp).map_err(|error| error.to_string())?;

    let published = fill(&temp, &mut staged)
        // Flushed by name, not through `staged`: a copy that replaced the staged file's inode must be flushed too.
        .and_then(|()| File::open(&temp)?.sync_all())
        .map_err(|error| error.to_string())
        .and_then(|()| move_no_clobber(&temp, to));
    // Published: the temporary name is already gone. Anything else: remove what this call staged.
    if published.is_err() {
        let _ = fs::remove_file(&temp);
    }
    published
}

/// Copies the file `from` to `to`, which must not exist. `from` is only ever read.
pub fn copy_no_clobber(from: &Path, to: &Path) -> Result<(), String> {
    if !fs::metadata(from).map_err(|error| error.to_string())?.is_file() {
        return Err("the source is not a file".into());
    }
    // `std::fs::copy` into the staged file (which this call created, so it is ours to overwrite): the same copy,
    // permissions and extended attributes the plugin's copy made.
    stage_and_publish(to, |temp, _staged| fs::copy(from, temp).map(|_| ()))
}

/// Writes `bytes` to a new file `to`, which must not exist.
pub fn write_no_clobber(to: &Path, bytes: &[u8]) -> Result<(), String> {
    stage_and_publish(to, |_temp, staged| staged.write_all(bytes))
}

// ---------------------------------------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------------------------------------

/// `copyFile(from, to)` that never replaces `to`. Both paths must be inside the fs scope.
#[tauri::command]
pub async fn copy_file_no_clobber<R: Runtime>(app: AppHandle<R>, from: String, to: String) -> Result<(), String> {
    let scope = app.fs_scope();
    tauri::async_runtime::spawn_blocking(move || {
        let (allowed, forbidden) = (|path: &Path| scope.is_allowed(path), |path: &Path| scope.is_forbidden(path));
        let from = authorize(&from, &allowed, &forbidden)?;
        let to = authorize(&to, &allowed, &forbidden)?;
        copy_no_clobber(&from, &to)
    })
    .await
    .map_err(|error| error.to_string())?
}

/// `writeBinaryFile(path, bytes)` that never replaces `path`. The request body is the raw bytes and the `path` header
/// the percent-encoded destination, as the plugin's own `write_file` receives them.
#[tauri::command]
pub async fn write_file_no_clobber<R: Runtime>(app: AppHandle<R>, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let path = request
        .headers()
        .get("path")
        .ok_or_else(|| "missing file path".to_string())
        .and_then(|value| {
            percent_encoding::percent_decode(value.as_bytes()).decode_utf8().map(|text| text.into_owned()).map_err(|_| "path is not valid UTF-8".to_string())
        })?;
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => bytes.clone(),
        _ => return Err("unexpected invoke body".into()),
    };
    let scope = app.fs_scope();
    tauri::async_runtime::spawn_blocking(move || {
        let to = authorize(&path, &|path: &Path| scope.is_allowed(path), &|path: &Path| scope.is_forbidden(path))?;
        write_no_clobber(&to, &bytes)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    use serde_json::{json, Value};
    use tauri::ipc::{CallbackFn, InvokeBody};
    use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, INVOKE_KEY};
    use tauri::webview::InvokeRequest;

    struct Scratch(PathBuf);

    impl Scratch {
        fn new(label: &str) -> Self {
            let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
            let base = fs::canonicalize(std::env::temp_dir()).unwrap().join(format!("clutter-new-file-{label}-{}-{nanos}", std::process::id()));
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

    // ---- the operations ------------------------------------------------------------------------------

    #[test]
    fn a_copy_to_a_free_name_arrives_whole_and_leaves_the_source_and_no_temporary_file() {
        let dir = Scratch::new("copy-free");
        fs::write(dir.path("source.png"), b"source bytes").unwrap();

        copy_no_clobber(&dir.path("source.png"), &dir.path("copy.png")).unwrap();

        assert_eq!(fs::read(dir.path("copy.png")).unwrap(), b"source bytes");
        assert_eq!(fs::read(dir.path("source.png")).unwrap(), b"source bytes");
        assert_eq!(dir.names(), vec!["copy.png", "source.png"]);
    }

    #[test]
    fn a_copy_onto_an_existing_file_is_refused_and_both_files_keep_their_contents() {
        let dir = Scratch::new("copy-collision");
        fs::write(dir.path("source.png"), b"source bytes").unwrap();
        fs::write(dir.path("taken.png"), b"someone else's file").unwrap();

        let error = copy_no_clobber(&dir.path("source.png"), &dir.path("taken.png")).unwrap_err();

        assert!(error.starts_with("EEXIST"), "{error}");
        assert_eq!(fs::read(dir.path("taken.png")).unwrap(), b"someone else's file");
        assert_eq!(fs::read(dir.path("source.png")).unwrap(), b"source bytes");
        assert_eq!(dir.names(), vec!["source.png", "taken.png"], "no temporary file is left behind");
    }

    #[test]
    fn a_name_claimed_after_the_early_check_is_still_never_replaced() {
        // Drives the publishing step directly, with the destination appearing after staging (the window an
        // `exists` check cannot close): the claim itself must refuse.
        let dir = Scratch::new("copy-race");
        let to = dir.path("raced.png");

        let result = stage_and_publish(&to, |_temp, staged| {
            staged.write_all(b"mine")?;
            fs::write(&to, b"the other process won")
        });

        assert!(result.unwrap_err().starts_with("EEXIST"));
        assert_eq!(fs::read(&to).unwrap(), b"the other process won");
        assert_eq!(dir.names(), vec!["raced.png"], "the staged file was removed");
    }

    #[test]
    fn a_copy_onto_a_symlink_or_a_directory_is_refused_and_nothing_behind_it_is_touched() {
        let dir = Scratch::new("copy-link");
        fs::write(dir.path("source.png"), b"source bytes").unwrap();
        fs::write(dir.path("target.txt"), b"target").unwrap();
        symlink(dir.path("target.txt"), dir.path("link.png")).unwrap();
        symlink(dir.path("missing.txt"), dir.path("dangling.png")).unwrap();
        fs::create_dir(dir.path("folder.png")).unwrap();

        for name in ["link.png", "dangling.png", "folder.png"] {
            let error = copy_no_clobber(&dir.path("source.png"), &dir.path(name)).unwrap_err();
            assert!(error.starts_with("EEXIST"), "{name}: {error}");
        }
        assert_eq!(fs::read(dir.path("target.txt")).unwrap(), b"target");
        assert!(!dir.path("missing.txt").exists());
        assert!(dir.names().iter().all(|name| !name.starts_with(".clutter-tmp")));
    }

    #[test]
    fn a_failed_copy_leaves_no_temporary_file_and_no_destination() {
        let dir = Scratch::new("copy-failure");

        let missing = copy_no_clobber(&dir.path("nope.png"), &dir.path("copy.png")).unwrap_err();
        assert!(!missing.starts_with("EEXIST"), "{missing}");

        fs::create_dir(dir.path("a-folder")).unwrap();
        assert!(copy_no_clobber(&dir.path("a-folder"), &dir.path("copy.png")).is_err());

        assert_eq!(dir.names(), vec!["a-folder"]);
    }

    #[test]
    fn a_write_to_a_free_name_arrives_whole_with_no_temporary_file() {
        let dir = Scratch::new("write-free");

        write_no_clobber(&dir.path("new.png"), b"\x89PNG\r\n\x00\xff bytes").unwrap();

        assert_eq!(fs::read(dir.path("new.png")).unwrap(), b"\x89PNG\r\n\x00\xff bytes");
        assert_eq!(dir.names(), vec!["new.png"]);
    }

    #[test]
    fn a_write_onto_an_existing_file_is_refused_and_it_keeps_its_contents() {
        let dir = Scratch::new("write-collision");
        fs::write(dir.path("taken.png"), b"someone else's file").unwrap();

        let error = write_no_clobber(&dir.path("taken.png"), b"new bytes").unwrap_err();

        assert!(error.starts_with("EEXIST"), "{error}");
        assert_eq!(fs::read(dir.path("taken.png")).unwrap(), b"someone else's file");
        assert_eq!(dir.names(), vec!["taken.png"]);
    }

    #[test]
    fn a_write_into_a_folder_that_does_not_exist_creates_nothing() {
        let dir = Scratch::new("write-no-folder");

        assert!(write_no_clobber(&dir.path("missing/new.png"), b"x").is_err());

        assert!(dir.names().is_empty());
    }

    #[test]
    fn of_two_writers_to_one_name_exactly_one_wins_and_the_loser_is_refused_whole() {
        let dir = Scratch::new("write-two");
        let to = dir.path("same.png");
        let threads: Vec<_> = (0..8)
            .map(|index| {
                let to = to.clone();
                std::thread::spawn(move || write_no_clobber(&to, format!("writer {index}").as_bytes()))
            })
            .collect();
        let results: Vec<_> = threads.into_iter().map(|thread| thread.join().unwrap()).collect();

        assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
        assert!(results.iter().filter_map(|result| result.as_ref().err()).all(|error| error.starts_with("EEXIST")));
        let winner = String::from_utf8(fs::read(&to).unwrap()).unwrap();
        assert!(winner.starts_with("writer "), "{winner}");
        assert_eq!(dir.names(), vec!["same.png"]);
    }

    // ---- the real command boundary (mock runtime, real IPC dispatch, real fs-plugin scope) -------------

    type MockApp = tauri::App<tauri::test::MockRuntime>;

    fn app_with_scope(allowed: &[&Path]) -> (MockApp, tauri::WebviewWindow<tauri::test::MockRuntime>) {
        let app = mock_builder()
            .plugin(tauri_plugin_fs::init())
            .invoke_handler(tauri::generate_handler![copy_file_no_clobber, write_file_no_clobber])
            .build(mock_context(noop_assets()))
            .expect("the mock app builds");
        for directory in allowed {
            app.fs_scope().allow_directory(directory, true).unwrap();
        }
        let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default()).build().unwrap();
        (app, window)
    }

    fn invoke(window: &tauri::WebviewWindow<tauri::test::MockRuntime>, command: &str, body: InvokeBody, path_header: Option<&Path>) -> Result<Value, Value> {
        let mut headers = tauri::http::HeaderMap::new();
        if let Some(path) = path_header {
            let encoded: String = path.to_string_lossy().bytes().map(|byte| format!("%{byte:02X}")).collect();
            headers.insert("path", encoded.parse().unwrap());
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

    #[test]
    fn through_the_real_command_boundary_a_collision_is_refused_and_scope_is_enforced() {
        let vault = Scratch::new("ipc-vault");
        let outside = Scratch::new("ipc-outside");
        fs::write(vault.path("existing.png"), b"keep me").unwrap();
        fs::write(outside.path("picked.png"), b"picked image").unwrap();
        fs::write(outside.path("secret.png"), b"secret").unwrap();
        let (app, window) = app_with_scope(&[&vault.0]);
        // What the native picker does for a chosen file.
        app.fs_scope().allow_file(outside.path("picked.png")).unwrap();

        // A picked file is copied into the vault.
        let copied = invoke(&window, "copy_file_no_clobber", InvokeBody::Json(json!({ "from": outside.path("picked.png"), "to": vault.path("Photo.png") })), None);
        assert!(copied.is_ok(), "{copied:?}");
        assert_eq!(fs::read(vault.path("Photo.png")).unwrap(), b"picked image");

        // The same name again, and an existing file: refused with EEXIST, contents unchanged.
        for name in ["Photo.png", "existing.png"] {
            let refused = invoke(&window, "copy_file_no_clobber", InvokeBody::Json(json!({ "from": outside.path("picked.png"), "to": vault.path(name) })), None);
            assert!(refused.unwrap_err().as_str().unwrap().starts_with("EEXIST"));
        }
        assert_eq!(fs::read(vault.path("existing.png")).unwrap(), b"keep me");
        assert_eq!(fs::read(vault.path("Photo.png")).unwrap(), b"picked image");

        // A source that was never granted, and a destination outside the vault, are refused.
        let ungranted = invoke(&window, "copy_file_no_clobber", InvokeBody::Json(json!({ "from": outside.path("secret.png"), "to": vault.path("Stolen.png") })), None);
        assert!(ungranted.unwrap_err().as_str().unwrap().contains("forbidden path"));
        assert!(!vault.path("Stolen.png").exists());
        let escaping = invoke(&window, "copy_file_no_clobber", InvokeBody::Json(json!({ "from": outside.path("picked.png"), "to": outside.path("Planted.png") })), None);
        assert!(escaping.unwrap_err().as_str().unwrap().contains("forbidden path"));
        assert!(!outside.path("Planted.png").exists());

        // Bytes: written to a free name, refused for an existing one, refused outside the vault.
        let written = invoke(&window, "write_file_no_clobber", InvokeBody::Raw(b"fresh bytes".to_vec()), Some(&vault.path("Pasted.png")));
        assert!(written.is_ok(), "{written:?}");
        assert_eq!(fs::read(vault.path("Pasted.png")).unwrap(), b"fresh bytes");
        let again = invoke(&window, "write_file_no_clobber", InvokeBody::Raw(b"other".to_vec()), Some(&vault.path("existing.png")));
        assert!(again.unwrap_err().as_str().unwrap().starts_with("EEXIST"));
        assert_eq!(fs::read(vault.path("existing.png")).unwrap(), b"keep me");
        let outside_write = invoke(&window, "write_file_no_clobber", InvokeBody::Raw(b"x".to_vec()), Some(&outside.path("Planted.png")));
        assert!(outside_write.unwrap_err().as_str().unwrap().contains("forbidden path"));
        assert!(!outside.path("Planted.png").exists());
        let no_header = invoke(&window, "write_file_no_clobber", InvokeBody::Raw(b"x".to_vec()), None);
        assert!(no_header.is_err());
        let json_body = invoke(&window, "write_file_no_clobber", InvokeBody::Json(json!([1, 2, 3])), Some(&vault.path("Json.png")));
        assert!(json_body.is_err());
        assert!(!vault.path("Json.png").exists());

        assert!(vault.names().iter().all(|name| !name.starts_with(".clutter-tmp")));
    }

    #[test]
    fn through_the_real_command_boundary_a_hidden_file_in_a_granted_folder_can_be_copied() {
        // Duplicating a folder copies its `.folder.md`; the runtime scope hides dot entries from `**`.
        let vault = Scratch::new("ipc-dot");
        fs::create_dir(vault.path("Source")).unwrap();
        fs::create_dir(vault.path("Source copy")).unwrap();
        fs::write(vault.path("Source/.folder.md"), b"folder note").unwrap();
        let (_app, window) = app_with_scope(&[&vault.0]);

        let copied = invoke(&window, "copy_file_no_clobber", InvokeBody::Json(json!({ "from": vault.path("Source/.folder.md"), "to": vault.path("Source copy/.folder.md") })), None);

        assert!(copied.is_ok(), "{copied:?}");
        assert_eq!(fs::read(vault.path("Source copy/.folder.md")).unwrap(), b"folder note");
    }

    // ---- authorization audit: what a caller can reach through these two commands ------------------------

    fn refused_as_forbidden(result: Result<Value, Value>) -> bool {
        matches!(result, Err(error) if error.as_str().is_some_and(|message| message.contains("forbidden path")))
    }

    #[test]
    fn a_source_reached_through_a_link_to_an_ungranted_file_is_never_read_and_never_leaks_into_the_vault() {
        let vault = Scratch::new("audit-link-vault");
        let outside = Scratch::new("audit-link-outside");
        fs::write(outside.path("secret.txt"), b"TOP SECRET CONTENT").unwrap();
        // A link INSIDE the granted folder to a file outside it: the path looks granted, the real file is not.
        symlink(outside.path("secret.txt"), vault.path("innocent.png")).unwrap();
        let (_app, window) = app_with_scope(&[&vault.0]);

        let result = invoke(&window, "copy_file_no_clobber", InvokeBody::Json(json!({ "from": vault.path("innocent.png"), "to": vault.path("Copy.png") })), None);

        assert!(refused_as_forbidden(result.clone()), "{result:?}");
        assert!(!result.unwrap_err().as_str().unwrap().contains("TOP SECRET"), "an error never carries file content");
        assert!(!vault.path("Copy.png").exists(), "nothing was copied");
        assert_eq!(fs::read(outside.path("secret.txt")).unwrap(), b"TOP SECRET CONTENT");
    }

    #[test]
    fn a_destination_reached_through_a_link_out_of_the_vault_plants_nothing_outside_it() {
        let vault = Scratch::new("audit-dest-link-vault");
        let outside = Scratch::new("audit-dest-link-outside");
        fs::write(vault.path("source.png"), b"source").unwrap();
        symlink(&outside.0, vault.path("exit")).unwrap();
        let (_app, window) = app_with_scope(&[&vault.0]);

        let copy = invoke(&window, "copy_file_no_clobber", InvokeBody::Json(json!({ "from": vault.path("source.png"), "to": vault.path("exit/Planted.png") })), None);
        let write = invoke(&window, "write_file_no_clobber", InvokeBody::Raw(b"x".to_vec()), Some(&vault.path("exit/Planted.png")));

        assert!(refused_as_forbidden(copy));
        assert!(refused_as_forbidden(write));
        assert!(outside.names().is_empty());
    }

    #[test]
    fn a_parent_reference_encoded_in_the_path_header_is_refused() {
        let vault = Scratch::new("audit-dotdot-vault");
        let outside = Scratch::new("audit-dotdot-outside");
        let (_app, window) = app_with_scope(&[&vault.0]);
        let sneaky = PathBuf::from(format!("{}/../{}/Planted.png", vault.0.display(), outside.0.file_name().unwrap().to_string_lossy()));

        let result = invoke(&window, "write_file_no_clobber", InvokeBody::Raw(b"x".to_vec()), Some(&sneaky));

        assert!(refused_as_forbidden(result));
        assert!(outside.names().is_empty());
    }

    #[test]
    fn a_path_that_cannot_exist_is_refused_rather_than_trusted() {
        let vault = Scratch::new("audit-nul");
        fs::write(vault.path("source.png"), b"s").unwrap();
        let (_app, window) = app_with_scope(&[&vault.0]);
        let with_nul = format!("{}/bad\u{0}name.png", vault.0.display());

        let result = invoke(&window, "copy_file_no_clobber", InvokeBody::Json(json!({ "from": vault.path("source.png"), "to": with_nul })), None);

        assert!(result.is_err());
        assert_eq!(vault.names(), vec!["source.png"]);
    }

    #[test]
    fn a_folder_the_scope_forbids_is_refused_for_source_and_destination_even_though_it_was_granted_first() {
        // The only way an authorization is ever withdrawn from the runtime scope is `forbid`: it beats an allow.
        let vault = Scratch::new("audit-forbid-vault");
        fs::create_dir(vault.path("Closed")).unwrap();
        fs::write(vault.path("Closed/inside.png"), b"inside").unwrap();
        fs::write(vault.path("open.png"), b"open").unwrap();
        let (app, window) = app_with_scope(&[&vault.0]);
        app.fs_scope().forbid_directory(vault.path("Closed"), true).unwrap();

        let into = invoke(&window, "copy_file_no_clobber", InvokeBody::Json(json!({ "from": vault.path("open.png"), "to": vault.path("Closed/New.png") })), None);
        let out_of = invoke(&window, "copy_file_no_clobber", InvokeBody::Json(json!({ "from": vault.path("Closed/inside.png"), "to": vault.path("Out.png") })), None);
        let written = invoke(&window, "write_file_no_clobber", InvokeBody::Raw(b"x".to_vec()), Some(&vault.path("Closed/Bytes.png")));
        let allowed = invoke(&window, "copy_file_no_clobber", InvokeBody::Json(json!({ "from": vault.path("open.png"), "to": vault.path("Fine.png") })), None);

        assert!(refused_as_forbidden(into) && refused_as_forbidden(out_of) && refused_as_forbidden(written));
        assert!(allowed.is_ok());
        assert_eq!(vault.path("Closed").read_dir().unwrap().count(), 1, "nothing was added to or taken from the closed folder");
        assert!(!vault.path("Out.png").exists());
    }

    #[test]
    fn nothing_is_authorized_when_no_folder_has_been_granted() {
        let vault = Scratch::new("audit-nogrant");
        fs::write(vault.path("source.png"), b"s").unwrap();
        let (_app, window) = app_with_scope(&[]);

        let copy = invoke(&window, "copy_file_no_clobber", InvokeBody::Json(json!({ "from": vault.path("source.png"), "to": vault.path("Copy.png") })), None);
        let write = invoke(&window, "write_file_no_clobber", InvokeBody::Raw(b"x".to_vec()), Some(&vault.path("New.png")));

        assert!(refused_as_forbidden(copy) && refused_as_forbidden(write));
        assert_eq!(vault.names(), vec!["source.png"]);
    }

    #[test]
    fn a_source_that_is_a_folder_or_missing_copies_nothing_and_an_error_never_includes_content() {
        let vault = Scratch::new("audit-source-kind");
        fs::create_dir(vault.path("Folder")).unwrap();
        fs::write(vault.path("Folder/a.txt"), b"FOLDER CONTENT").unwrap();
        let (_app, window) = app_with_scope(&[&vault.0]);

        for from in ["Folder", "missing.png"] {
            let result = invoke(&window, "copy_file_no_clobber", InvokeBody::Json(json!({ "from": vault.path(from), "to": vault.path("Copy.png") })), None);
            let message = result.unwrap_err().to_string();
            assert!(!message.contains("FOLDER CONTENT"), "{message}");
        }
        assert!(!vault.path("Copy.png").exists());
        assert_eq!(vault.names(), vec!["Folder"]);
    }

    #[test]
    fn copying_a_file_onto_itself_is_refused_and_leaves_it_whole() {
        let vault = Scratch::new("audit-self");
        fs::write(vault.path("note.png"), b"original").unwrap();
        let (_app, window) = app_with_scope(&[&vault.0]);

        let result = invoke(&window, "copy_file_no_clobber", InvokeBody::Json(json!({ "from": vault.path("note.png"), "to": vault.path("note.png") })), None);

        assert!(result.unwrap_err().as_str().unwrap().starts_with("EEXIST"));
        assert_eq!(fs::read(vault.path("note.png")).unwrap(), b"original");
        assert_eq!(vault.names(), vec!["note.png"]);
    }

    #[test]
    fn a_dangling_link_at_the_destination_is_refused_and_its_target_is_never_created() {
        let vault = Scratch::new("audit-dangling-vault");
        let outside = Scratch::new("audit-dangling-outside");
        symlink(outside.path("not-yet.png"), vault.path("trap.png")).unwrap();
        let (_app, window) = app_with_scope(&[&vault.0]);

        let result = invoke(&window, "write_file_no_clobber", InvokeBody::Raw(b"x".to_vec()), Some(&vault.path("trap.png")));

        // Refused either way: the scope resolves a link to where it points (outside), or the name is simply taken.
        let message = result.unwrap_err().as_str().unwrap().to_string();
        assert!(message.starts_with("EEXIST") || message.contains("forbidden path"), "{message}");
        assert!(!outside.path("not-yet.png").exists(), "the write did not follow the link");
        assert!(fs::symlink_metadata(vault.path("trap.png")).unwrap().file_type().is_symlink());
    }
}
