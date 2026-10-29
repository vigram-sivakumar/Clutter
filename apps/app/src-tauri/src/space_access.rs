//! How Clutter keeps access to the user's real folders when it runs inside the macOS App Sandbox (the Mac App
//! Store build). Outside a sandbox nothing here is active: every command reports `sandboxed: false` and the Space
//! commands behave exactly as before.
//!
//! Inside the sandbox three facts shape the design (verified in a sandbox-enabled build, ADR-063):
//!
//! * `$HOME` and the `Documents` folder resolve to the app's container, so the real `~/Documents` has to be named
//!   by its real path (from the account database, not the environment) and **authorized by the user**.
//! * A folder the user picks is accessible only for that run. Tauri's persisted scope remembers the *path*; the
//!   operating system needs a **security-scoped bookmark**, saved when the folder is authorized and resolved (and its
//!   access started) at every launch, before anything uses the folder.
//! * Nothing here widens what the user authorized: a bookmark is made only for a folder the user just picked, and
//!   for the Documents folder through a picker opened on Documents.
//!
//! One owner: this module is the only code that makes, stores, resolves or releases a bookmark.

use std::any::Any;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use sha2::Digest;

const STORE_FILE: &str = "space-access.json";
const STORE_VERSION: u64 = 1;

/// Whether this process runs in the App Sandbox: the system sets `APP_SANDBOX_CONTAINER_ID` for sandboxed processes
/// only.
pub fn is_sandboxed() -> bool {
    std::env::var_os("APP_SANDBOX_CONTAINER_ID").is_some()
}

/// The account's real home directory, from the account database. Inside the sandbox `$HOME` is the container.
#[cfg(target_os = "macos")]
pub fn real_home() -> Option<PathBuf> {
    use std::ffi::CStr;
    use std::os::raw::{c_char, c_void};

    #[repr(C)]
    struct Passwd {
        name: *const c_char,
        passwd: *const c_char,
        uid: u32,
        gid: u32,
        change: i64,
        class: *const c_char,
        gecos: *const c_char,
        dir: *const c_char,
        shell: *const c_char,
        expire: i64,
    }
    extern "C" {
        fn getuid() -> u32;
        fn getpwuid(uid: u32) -> *const Passwd;
    }
    let _ = std::mem::size_of::<c_void>();
    // SAFETY: getpwuid returns a pointer to a static record or null; the string is copied before anything else runs.
    unsafe {
        let record = getpwuid(getuid());
        if record.is_null() || (*record).dir.is_null() {
            return None;
        }
        Some(PathBuf::from(CStr::from_ptr((*record).dir).to_string_lossy().into_owned()))
    }
}

#[cfg(not(target_os = "macos"))]
pub fn real_home() -> Option<PathBuf> {
    None
}

// ---------------------------------------------------------------------------------------------------------
// The operating-system half, behind a trait so the rules around it are testable without a sandbox.
// ---------------------------------------------------------------------------------------------------------

/// A folder whose access was started from a bookmark. Dropping it releases the access.
pub struct Resolved {
    pub path: PathBuf,
    /// The system says the bookmark should be re-made (the folder moved or was renamed).
    pub stale: bool,
    /// Keeps the access alive for as long as it is held.
    pub token: Box<dyn Any + Send + Sync>,
}

pub trait OsBookmarks: Send + Sync {
    /// A security-scoped bookmark for a folder the process can currently reach (just picked, or already resolved).
    fn create(&self, path: &Path) -> Result<Vec<u8>, String>;
    /// Resolves a bookmark and **starts** access to the folder. Fails if the folder is gone or access is refused.
    fn resolve(&self, data: &[u8]) -> Result<Resolved, String>;
}

// ---------------------------------------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RestoreStatus {
    /// Access to the folder is active again.
    Restored,
    /// Access is active again and the bookmark was re-made because the system reported it stale.
    Refreshed,
    /// The folder can no longer be reached with what was saved: the user has to select it again.
    NeedsReselect,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoredAccess {
    pub path: String,
    pub status: RestoreStatus,
}

#[derive(Default)]
struct State {
    /// Saved bookmarks by folder path. Entries that failed to restore are **kept**, so the user is asked again
    /// rather than the folder being forgotten.
    saved: BTreeMap<String, Vec<u8>>,
    /// Folders whose access is active in this run (restored, or authorized by the user in this run).
    active: BTreeSet<String>,
    /// Access started from a saved bookmark; released when the process ends.
    held: Vec<Box<dyn Any + Send + Sync>>,
}

pub struct SpaceAccess {
    store: PathBuf,
    os: Box<dyn OsBookmarks>,
    state: Mutex<State>,
}

fn key(path: &Path) -> String {
    path.to_string_lossy().trim_end_matches('/').to_string()
}

fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn from_hex(text: &str) -> Option<Vec<u8>> {
    if text.len() % 2 != 0 {
        return None;
    }
    (0..text.len())
        .step_by(2)
        .map(|index| u8::from_str_radix(text.get(index..index + 2)?, 16).ok())
        .collect()
}

impl SpaceAccess {
    /// Opens the registry saved in `directory` (the app data folder). A missing or unreadable file is an empty
    /// registry; it is never overwritten until something is saved.
    pub fn open(directory: &Path, os: Box<dyn OsBookmarks>) -> Self {
        let store = directory.join(STORE_FILE);
        let saved = fs::read_to_string(&store)
            .ok()
            .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
            .and_then(|value| {
                if value["version"].as_u64() != Some(STORE_VERSION) {
                    return None;
                }
                let entries = value["entries"].as_object()?;
                Some(
                    entries
                        .iter()
                        .filter_map(|(path, data)| Some((path.clone(), from_hex(data.as_str()?)?)))
                        .collect::<BTreeMap<_, _>>(),
                )
            })
            .unwrap_or_default();
        SpaceAccess { store, os, state: Mutex::new(State { saved, ..State::default() }) }
    }

    fn persist(&self, saved: &BTreeMap<String, Vec<u8>>) -> Result<(), String> {
        let entries: serde_json::Map<String, serde_json::Value> =
            saved.iter().map(|(path, data)| (path.clone(), serde_json::Value::String(to_hex(data)))).collect();
        let text = serde_json::json!({ "version": STORE_VERSION, "entries": entries }).to_string();
        if let Some(parent) = self.store.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        // Whole-file replacement: a crash leaves the old registry or the new one, never half of one.
        let temporary = self.store.with_extension("json.tmp");
        fs::write(&temporary, text).map_err(|error| error.to_string())?;
        fs::rename(&temporary, &self.store).map_err(|error| error.to_string())
    }

    /// Starts access to every saved folder. Call once at launch, before any Space is opened.
    pub fn restore(&self) -> Vec<RestoredAccess> {
        let mut state = self.state.lock().unwrap();
        let mut report = Vec::new();
        let mut changed = false;
        let paths: Vec<String> = state.saved.keys().cloned().collect();
        for path in paths {
            let data = state.saved[&path].clone();
            match self.os.resolve(&data) {
                Ok(resolved) if key(&resolved.path) == path => {
                    let mut status = RestoreStatus::Restored;
                    if resolved.stale {
                        if let Ok(fresh) = self.os.create(&resolved.path) {
                            state.saved.insert(path.clone(), fresh);
                            changed = true;
                            status = RestoreStatus::Refreshed;
                        }
                    }
                    state.active.insert(path.clone());
                    state.held.push(resolved.token);
                    report.push(RestoredAccess { path, status });
                }
                // The bookmark now points somewhere else (the folder was moved): the path the user registered is
                // not the one authorized, so it is not silently swapped; the user selects the folder again.
                Ok(_) | Err(_) => report.push(RestoredAccess { path, status: RestoreStatus::NeedsReselect }),
            }
        }
        if changed {
            let _ = self.persist(&state.saved);
        }
        report
    }

    /// Saves a bookmark for a folder the user has just authorized (a picker result), and counts it as active.
    pub fn remember(&self, path: &Path) -> Result<(), String> {
        let data = self.os.create(path)?;
        let mut state = self.state.lock().unwrap();
        state.saved.insert(key(path), data);
        state.active.insert(key(path));
        self.persist(&state.saved)
    }

    /// Whether access to `path` is active in this run.
    pub fn is_active(&self, path: &Path) -> bool {
        self.state.lock().unwrap().active.contains(&key(path))
    }

    /// Forgets a folder (a Space that was removed from Clutter).
    pub fn forget(&self, path: &Path) -> Result<(), String> {
        let mut state = self.state.lock().unwrap();
        state.active.remove(&key(path));
        if state.saved.remove(&key(path)).is_some() {
            return self.persist(&state.saved);
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------------------------------------
// The real bookmarks (CoreFoundation)
// ---------------------------------------------------------------------------------------------------------

#[cfg(target_os = "macos")]
pub mod macos {
    use super::{OsBookmarks, Resolved};
    use std::ffi::c_void;
    use std::os::unix::ffi::OsStrExt;
    use std::path::{Path, PathBuf};

    type CFTypeRef = *const c_void;
    type CFIndex = isize;

    const BOOKMARK_CREATION_WITH_SECURITY_SCOPE: usize = 1 << 11;
    const BOOKMARK_RESOLUTION_WITH_SECURITY_SCOPE: usize = 1 << 10;
    const BOOKMARK_RESOLUTION_WITHOUT_UI: usize = 1 << 8;
    const BOOKMARK_RESOLUTION_WITHOUT_MOUNTING: usize = 1 << 9;

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFRelease(value: CFTypeRef);
        fn CFURLCreateFromFileSystemRepresentation(allocator: CFTypeRef, buffer: *const u8, length: CFIndex, is_directory: u8) -> CFTypeRef;
        fn CFURLGetFileSystemRepresentation(url: CFTypeRef, resolve_against_base: u8, buffer: *mut u8, max: CFIndex) -> u8;
        fn CFURLCreateBookmarkData(allocator: CFTypeRef, url: CFTypeRef, options: usize, properties: CFTypeRef, relative: CFTypeRef, error: *mut CFTypeRef) -> CFTypeRef;
        fn CFURLCreateByResolvingBookmarkData(allocator: CFTypeRef, bookmark: CFTypeRef, options: usize, relative: CFTypeRef, properties: CFTypeRef, is_stale: *mut u8, error: *mut CFTypeRef) -> CFTypeRef;
        fn CFURLStartAccessingSecurityScopedResource(url: CFTypeRef) -> u8;
        fn CFURLStopAccessingSecurityScopedResource(url: CFTypeRef);
        fn CFDataCreate(allocator: CFTypeRef, bytes: *const u8, length: CFIndex) -> CFTypeRef;
        fn CFDataGetLength(data: CFTypeRef) -> CFIndex;
        fn CFDataGetBytePtr(data: CFTypeRef) -> *const u8;
        fn CFErrorGetCode(error: CFTypeRef) -> CFIndex;
    }

    /// An owned CoreFoundation object, released on drop.
    struct Owned(CFTypeRef);
    impl Drop for Owned {
        fn drop(&mut self) {
            // SAFETY: the pointer is a +1 reference this wrapper owns.
            unsafe { CFRelease(self.0) }
        }
    }

    /// A folder URL with its security-scoped access started; access ends when it is dropped.
    struct Access(Owned);
    // SAFETY: a CFURL is immutable and thread-safe; start/stop are plain calls.
    unsafe impl Send for Access {}
    unsafe impl Sync for Access {}
    impl Drop for Access {
        fn drop(&mut self) {
            // SAFETY: access was started on this URL when the wrapper was made.
            unsafe { CFURLStopAccessingSecurityScopedResource((self.0).0) }
        }
    }

    fn url_for(path: &Path) -> Result<Owned, String> {
        let bytes = path.as_os_str().as_bytes();
        // SAFETY: the buffer outlives the call; the result is a +1 reference or null.
        let url = unsafe { CFURLCreateFromFileSystemRepresentation(std::ptr::null(), bytes.as_ptr(), bytes.len() as CFIndex, 1) };
        if url.is_null() {
            Err(format!("cannot form a URL for {}", path.display()))
        } else {
            Ok(Owned(url))
        }
    }

    fn describe(error: CFTypeRef) -> String {
        if error.is_null() {
            return "unknown error".into();
        }
        // SAFETY: a non-null CFError out-parameter is a +1 reference this function releases.
        let code = unsafe { CFErrorGetCode(error) };
        drop(Owned(error));
        format!("CoreFoundation error {code}")
    }

    pub struct SystemBookmarks;

    impl OsBookmarks for SystemBookmarks {
        fn create(&self, path: &Path) -> Result<Vec<u8>, String> {
            let url = url_for(path)?;
            let mut error: CFTypeRef = std::ptr::null();
            // SAFETY: valid URL; null properties/relative are allowed; the result is a +1 CFData or null.
            let data = unsafe {
                CFURLCreateBookmarkData(std::ptr::null(), url.0, BOOKMARK_CREATION_WITH_SECURITY_SCOPE, std::ptr::null(), std::ptr::null(), &mut error)
            };
            if data.is_null() {
                return Err(format!("cannot save access to {}: {}", path.display(), describe(error)));
            }
            let data = Owned(data);
            // SAFETY: the pointer and length describe the CFData's own buffer, copied before the data is released.
            Ok(unsafe { std::slice::from_raw_parts(CFDataGetBytePtr(data.0), CFDataGetLength(data.0) as usize) }.to_vec())
        }

        fn resolve(&self, bytes: &[u8]) -> Result<Resolved, String> {
            // SAFETY: the buffer outlives the call; the result is a +1 CFData or null.
            let data = unsafe { CFDataCreate(std::ptr::null(), bytes.as_ptr(), bytes.len() as CFIndex) };
            if data.is_null() {
                return Err("cannot read the saved access".into());
            }
            let data = Owned(data);
            let mut stale = 0u8;
            let mut error: CFTypeRef = std::ptr::null();
            let options = BOOKMARK_RESOLUTION_WITH_SECURITY_SCOPE | BOOKMARK_RESOLUTION_WITHOUT_UI | BOOKMARK_RESOLUTION_WITHOUT_MOUNTING;
            // SAFETY: valid data; the result is a +1 URL or null.
            let url = unsafe { CFURLCreateByResolvingBookmarkData(std::ptr::null(), data.0, options, std::ptr::null(), std::ptr::null(), &mut stale, &mut error) };
            if url.is_null() {
                return Err(describe(error));
            }
            let url = Owned(url);
            let mut buffer = vec![0u8; 4096];
            // SAFETY: the buffer is writable for its stated length.
            let ok = unsafe { CFURLGetFileSystemRepresentation(url.0, 1, buffer.as_mut_ptr(), buffer.len() as CFIndex) };
            if ok == 0 {
                return Err("cannot read the folder's path".into());
            }
            let end = buffer.iter().position(|&byte| byte == 0).unwrap_or(buffer.len());
            let path = PathBuf::from(std::ffi::OsStr::from_bytes(&buffer[..end]));
            // SAFETY: valid URL. A false result means access was not granted.
            if unsafe { CFURLStartAccessingSecurityScopedResource(url.0) } == 0 {
                return Err(format!("access to {} was not granted", path.display()));
            }
            Ok(Resolved { path, stale: stale != 0, token: Box::new(Access(url)) })
        }
    }
}

// ---------------------------------------------------------------------------------------------------------
// Tauri commands. All are listed in build.rs and granted to the main window only (ADR-063).
// ---------------------------------------------------------------------------------------------------------

use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::FsExt;

/// The registry, managed by the app. `None` outside the sandbox: nothing is remembered or restored there.
pub struct SpaceAccessState(pub Option<SpaceAccess>);

/// Creates the registry for this run. A sandboxed macOS process gets the real bookmarks; anything else gets none.
pub fn build_state(app: &AppHandle) -> SpaceAccessState {
    #[cfg(target_os = "macos")]
    {
        if is_sandboxed() {
            if let Ok(directory) = app.path().app_data_dir() {
                return SpaceAccessState(Some(SpaceAccess::open(&directory, Box::new(macos::SystemBookmarks))));
            }
        }
    }
    let _ = app;
    SpaceAccessState(None)
}

/// Where new Spaces are created. Outside the sandbox that is the account's Documents folder as before; inside it,
/// the container's `Documents` is *not* what the user sees as Documents, so the real one is named by its real path.
pub fn documents_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if is_sandboxed() {
        return real_home().map(|home| home.join("Documents")).ok_or_else(|| "cannot find the home folder".to_string());
    }
    app.path().document_dir().map_err(|error| error.to_string())
}

/// Whether the Documents folder may be written to right now: always outside the sandbox; inside it, only once the
/// user has authorized it.
pub fn documents_writable(app: &AppHandle) -> bool {
    if !is_sandboxed() {
        return true;
    }
    match (app.state::<SpaceAccessState>().0.as_ref(), documents_dir(app)) {
        (Some(access), Ok(documents)) => access.is_active(&documents),
        _ => false,
    }
}

/// The folders whose static fs scope has been added in this run (one capability each, never added twice).
#[derive(Default)]
pub struct SpaceScopeGrants(Mutex<BTreeSet<String>>);

/// `*`, `?` and `[` mean something in a scope pattern; a folder named with them must match only itself.
fn escape_glob(path: &str) -> String {
    path.chars()
        .map(|c| match c {
            '*' | '?' | '[' => format!("[{c}]"),
            other => other.to_string(),
        })
        .collect()
}

/// Lets the fs plugin see **dot entries** (`.clutter`, `.folder.md`) inside `folder`, and nothing outside it.
///
/// The plugin matches a scope granted at runtime with the default options, which hide dot entries whatever
/// `requireLiteralLeadingDot` says; only entries that come from a *capability* honor that setting. So an authorized
/// folder is also added as a capability of its own — `fs:scope` for exactly that folder and its contents, for the main
/// window — the same kind of entry `$HOME/**` is, but for one authorized folder at a time. A capability cannot be
/// removed once added; it lasts for the run, and the folder had to be authorized (picked, restored from a bookmark,
/// or Documents) to get here. Added once per folder.
pub fn grant_static_scope<R: tauri::Runtime>(app: &tauri::AppHandle<R>, folder: &Path) -> Result<(), String> {
    let grants = app.state::<SpaceScopeGrants>();
    let mut granted = grants.0.lock().unwrap();
    let folder_key = key(folder);
    if granted.contains(&folder_key) {
        return Ok(());
    }
    let digest = sha2::Sha256::digest(folder_key.as_bytes());
    let identifier: String = digest.iter().take(8).map(|byte| format!("{byte:02x}")).collect();
    let escaped = escape_glob(&folder_key);
    let capability = serde_json::json!({
        "identifier": format!("space-{identifier}"),
        "description": "An authorized folder: its dot entries are reachable (see space_access::grant_static_scope).",
        "windows": ["main"],
        "permissions": [{ "identifier": "fs:scope", "allow": [{ "path": escaped }, { "path": format!("{escaped}/**") }] }],
    })
    .to_string();
    app.add_capability(capability).map_err(|error| error.to_string())?;
    granted.insert(folder_key);
    Ok(())
}

/// Grants an authorized folder to everything that checks a scope: the runtime fs and asset scopes, and, inside the App
/// Sandbox (where `$HOME/**` is the container, so no static entry reaches the real folder), its static scope too.
fn allow(app: &AppHandle, folder: &Path) {
    let _ = app.fs_scope().allow_directory(folder, true);
    let _ = app.asset_protocol_scope().allow_directory(folder, true);
    if is_sandboxed() {
        if let Err(error) = grant_static_scope(app, folder) {
            log::error!("Could not make the dot entries of {} reachable: {error}", folder.display());
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SandboxInfo {
    pub sandboxed: bool,
    /// The account's real home (not the container). Only reported inside the sandbox.
    pub real_home: Option<String>,
    pub documents: String,
}

#[tauri::command]
pub fn sandbox_info(app: AppHandle) -> Result<SandboxInfo, String> {
    let sandboxed = is_sandboxed();
    Ok(SandboxInfo {
        sandboxed,
        real_home: if sandboxed { real_home().map(|home| home.to_string_lossy().into_owned()) } else { None },
        documents: documents_dir(&app)?.to_string_lossy().into_owned(),
    })
}

/// Starts access to every folder the user authorized in an earlier run and grants it to the fs and asset scopes the
/// commands check. Called once at launch, before any Space is opened. Empty outside the sandbox.
#[tauri::command]
pub async fn restore_space_access(app: AppHandle) -> Result<Vec<RestoredAccess>, String> {
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = handle.state::<SpaceAccessState>();
        let Some(access) = state.0.as_ref() else { return Vec::new() };
        let report = access.restore();
        for entry in &report {
            if entry.status != RestoreStatus::NeedsReselect {
                allow(&handle, Path::new(&entry.path));
            }
        }
        report
    })
    .await
    .map_err(|error| error.to_string())
}

/// Saves access to a folder the user has just picked, so it can be reopened after a restart. Refused for a folder the
/// picker did not grant (it is not in the fs scope), and a no-op outside the sandbox.
#[tauri::command]
pub async fn remember_space_access(app: AppHandle, path: String) -> Result<bool, String> {
    if !is_sandboxed() {
        return Ok(false);
    }
    let folder = PathBuf::from(&path);
    if !app.fs_scope().is_allowed(&folder) {
        return Err(format!("forbidden path: {path}"));
    }
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = handle.state::<SpaceAccessState>();
        let access = state.0.as_ref().ok_or_else(|| "access is not available".to_string())?;
        access.remember(&folder)?;
        allow(&handle, &folder);
        Ok(true)
    })
    .await
    .map_err(|error| error.to_string())?
}

/// `"notSandboxed"`, `"granted"` or `"needed"`: whether the user has authorized the Documents folder.
#[tauri::command]
pub fn documents_access(app: AppHandle) -> &'static str {
    if !is_sandboxed() {
        "notSandboxed"
    } else if documents_writable(&app) {
        "granted"
    } else {
        "needed"
    }
}

/// Asks the user, once, to authorize the real Documents folder: the system folder picker opened on Documents, where
/// choosing it grants access. Cancelling, or choosing any other folder, changes nothing and creates nothing.
/// Returns `"granted"`, `"cancelled"` or `"wrongFolder"`.
#[tauri::command]
pub async fn request_documents_access(app: AppHandle) -> Result<&'static str, String> {
    if !is_sandboxed() {
        return Ok("granted");
    }
    let documents = documents_dir(&app)?;
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let picked = handle
            .dialog()
            .file()
            .set_directory(&documents)
            .set_title("Allow Clutter to create Spaces in Documents")
            .blocking_pick_folder();
        let Some(picked) = picked else { return Ok("cancelled") };
        let picked = picked.into_path().map_err(|error| error.to_string())?;
        let same = match (fs::canonicalize(&picked), fs::canonicalize(&documents)) {
            (Ok(a), Ok(b)) => a == b,
            _ => key(&picked) == key(&documents),
        };
        if !same {
            return Ok("wrongFolder");
        }
        let state = handle.state::<SpaceAccessState>();
        let access = state.0.as_ref().ok_or_else(|| "access is not available".to_string())?;
        access.remember(&documents)?;
        allow(&handle, &documents);
        Ok("granted")
    })
    .await
    .map_err(|error| error.to_string())?
}

// ---------------------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    /// A fake system: bookmarks are the folder's path, and which folders still resolve is controlled by the test.
    #[derive(Default)]
    struct Fake {
        gone: Mutex<BTreeSet<String>>,
        stale: Mutex<BTreeSet<String>>,
        moved_to: Mutex<BTreeMap<String, String>>,
        released: Arc<Mutex<Vec<String>>>,
    }

    struct Token(String, Arc<Mutex<Vec<String>>>);
    impl Drop for Token {
        fn drop(&mut self) {
            self.1.lock().unwrap().push(self.0.clone());
        }
    }

    impl OsBookmarks for Arc<Fake> {
        fn create(&self, path: &Path) -> Result<Vec<u8>, String> {
            if self.gone.lock().unwrap().contains(&key(path)) {
                return Err("no access".into());
            }
            Ok(key(path).into_bytes())
        }
        fn resolve(&self, data: &[u8]) -> Result<Resolved, String> {
            let saved = String::from_utf8(data.to_vec()).unwrap();
            if self.gone.lock().unwrap().contains(&saved) {
                return Err("CoreFoundation error 260".into());
            }
            let path = self.moved_to.lock().unwrap().get(&saved).cloned().unwrap_or_else(|| saved.clone());
            Ok(Resolved {
                stale: self.stale.lock().unwrap().contains(&saved),
                token: Box::new(Token(path.clone(), self.released.clone())),
                path: PathBuf::from(path),
            })
        }
    }

    fn scratch(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "clutter-space-access-{label}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn registry(dir: &Path, fake: &Arc<Fake>) -> SpaceAccess {
        SpaceAccess::open(dir, Box::new(fake.clone()))
    }

    #[test]
    fn a_remembered_folder_is_active_again_after_a_restart() {
        let dir = scratch("restart");
        let fake = Arc::new(Fake::default());
        let first = registry(&dir, &fake);
        first.remember(Path::new("/Users/me/Documents")).unwrap();
        first.remember(Path::new("/Volumes/Work/Notes")).unwrap();
        assert!(first.is_active(Path::new("/Users/me/Documents")));

        // A new process: nothing is active until restore runs.
        let second = registry(&dir, &fake);
        assert!(!second.is_active(Path::new("/Users/me/Documents")));
        let report = second.restore();
        assert_eq!(report.len(), 2);
        assert!(report.iter().all(|entry| entry.status == RestoreStatus::Restored));
        assert!(second.is_active(Path::new("/Users/me/Documents")));
        assert!(second.is_active(Path::new("/Volumes/Work/Notes")));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_folder_that_can_no_longer_be_reached_is_reported_and_kept_not_forgotten() {
        let dir = scratch("failed");
        let fake = Arc::new(Fake::default());
        registry(&dir, &fake).remember(Path::new("/Volumes/Gone/Notes")).unwrap();
        fake.gone.lock().unwrap().insert("/Volumes/Gone/Notes".into());

        let restarted = registry(&dir, &fake);
        let report = restarted.restore();
        assert_eq!(report, vec![RestoredAccess { path: "/Volumes/Gone/Notes".into(), status: RestoreStatus::NeedsReselect }]);
        assert!(!restarted.is_active(Path::new("/Volumes/Gone/Notes")));

        // Still saved: when the drive is back, the next launch restores it with no user action.
        fake.gone.lock().unwrap().clear();
        let again = registry(&dir, &fake).restore();
        assert_eq!(again[0].status, RestoreStatus::Restored);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_bookmark_that_now_points_somewhere_else_is_never_silently_followed() {
        let dir = scratch("moved");
        let fake = Arc::new(Fake::default());
        registry(&dir, &fake).remember(Path::new("/Users/me/Documents/Notes")).unwrap();
        fake.moved_to.lock().unwrap().insert("/Users/me/Documents/Notes".into(), "/Users/me/Documents/Renamed".into());

        let restarted = registry(&dir, &fake);
        assert_eq!(restarted.restore()[0].status, RestoreStatus::NeedsReselect);
        assert!(!restarted.is_active(Path::new("/Users/me/Documents/Notes")));
        assert!(!restarted.is_active(Path::new("/Users/me/Documents/Renamed")));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_stale_bookmark_is_remade_and_saved() {
        let dir = scratch("stale");
        let fake = Arc::new(Fake::default());
        registry(&dir, &fake).remember(Path::new("/Users/me/Documents")).unwrap();
        fake.stale.lock().unwrap().insert("/Users/me/Documents".into());

        assert_eq!(registry(&dir, &fake).restore()[0].status, RestoreStatus::Refreshed);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_failed_bookmark_creation_saves_and_activates_nothing() {
        let dir = scratch("create-fails");
        let fake = Arc::new(Fake::default());
        fake.gone.lock().unwrap().insert("/Users/me/Nowhere".into());
        let access = registry(&dir, &fake);

        assert!(access.remember(Path::new("/Users/me/Nowhere")).is_err());
        assert!(!access.is_active(Path::new("/Users/me/Nowhere")));
        assert!(!dir.join(STORE_FILE).exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_corrupt_or_foreign_store_is_an_empty_registry_and_is_left_alone() {
        let dir = scratch("corrupt");
        let fake = Arc::new(Fake::default());
        for contents in ["not json", "{\"version\":99,\"entries\":{}}", "{\"version\":1,\"entries\":{\"/a\":\"zz\"}}"] {
            fs::write(dir.join(STORE_FILE), contents).unwrap();
            let access = registry(&dir, &fake);
            assert!(access.restore().is_empty(), "{contents}");
            assert_eq!(fs::read_to_string(dir.join(STORE_FILE)).unwrap(), contents);
        }
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn forgetting_a_folder_removes_it_from_the_next_launch_and_trailing_slashes_do_not_matter() {
        let dir = scratch("forget");
        let fake = Arc::new(Fake::default());
        let access = registry(&dir, &fake);
        access.remember(Path::new("/Users/me/Documents/")).unwrap();
        assert!(access.is_active(Path::new("/Users/me/Documents")));
        access.forget(Path::new("/Users/me/Documents")).unwrap();

        assert!(registry(&dir, &fake).restore().is_empty());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn hex_round_trips_and_rejects_bad_input() {
        let bytes: Vec<u8> = (0..=255).collect();
        assert_eq!(from_hex(&to_hex(&bytes)), Some(bytes));
        assert_eq!(from_hex("abc"), None);
        assert_eq!(from_hex("gg"), None);
    }

    // ---- the static fs scope of an authorized folder, through the real permission tables ----------------------

    type Mock = tauri::App<tauri::test::MockRuntime>;

    fn app_with_grants() -> (Mock, tauri::WebviewWindow<tauri::test::MockRuntime>) {
        let app = tauri::test::mock_builder().plugin(tauri_plugin_fs::init()).build(crate::app_context()).unwrap();
        app.manage(SpaceScopeGrants::default());
        let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default()).build().unwrap();
        (app, window)
    }

    /// `Ok(exists)` or the plugin's refusal, through the plugin's own command and its scope checks.
    fn exists(window: &tauri::WebviewWindow<tauri::test::MockRuntime>, path: &Path) -> Result<bool, String> {
        use tauri::ipc::{CallbackFn, InvokeBody};
        use tauri::test::{get_ipc_response, INVOKE_KEY};
        use tauri::webview::InvokeRequest;
        get_ipc_response(
            window,
            InvokeRequest {
                cmd: "plugin:fs|exists".into(),
                callback: CallbackFn(0),
                error: CallbackFn(1),
                url: "tauri://localhost".parse().unwrap(),
                body: InvokeBody::Json(serde_json::json!({ "path": path })),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.to_string(),
            },
        )
        .map(|body| body.deserialize::<bool>().unwrap())
        .map_err(|error| error.as_str().unwrap_or("refused").to_string())
    }

    fn is_forbidden(result: Result<bool, String>) -> bool {
        matches!(result, Err(message) if message.contains("forbidden path"))
    }

    #[test]
    fn a_runtime_grant_alone_hides_dot_entries_and_the_static_grant_shows_them_for_that_folder_only() {
        let (app, window) = app_with_grants();
        let root = scratch("static-scope");
        let space = root.join("Space");
        let sibling = root.join("Space-sibling");
        for folder in [&space, &sibling] {
            fs::create_dir_all(folder.join(".clutter")).unwrap();
            fs::create_dir_all(folder.join("sub")).unwrap();
            fs::write(folder.join(".clutter/workspace.json"), "{}").unwrap();
            fs::write(folder.join(".folder.md"), "x").unwrap();
            fs::write(folder.join("sub/.folder.md"), "x").unwrap();
            fs::write(folder.join("note.md"), "x").unwrap();
        }
        app.fs_scope().allow_directory(&space, true).unwrap();
        app.fs_scope().allow_directory(&sibling, true).unwrap();

        // The reason for the static grant: a runtime grant hides every dot entry.
        assert_eq!(exists(&window, &space.join("note.md")), Ok(true));
        assert!(is_forbidden(exists(&window, &space.join(".clutter/workspace.json"))));
        assert!(is_forbidden(exists(&window, &space.join(".folder.md"))));

        grant_static_scope(app.handle(), &space).unwrap();
        grant_static_scope(app.handle(), &space).unwrap(); // once per folder, never twice

        assert_eq!(exists(&window, &space.join(".clutter/workspace.json")), Ok(true));
        assert_eq!(exists(&window, &space.join(".folder.md")), Ok(true));
        assert_eq!(exists(&window, &space.join("sub/.folder.md")), Ok(true));
        // Nothing else was opened up: the neighbouring folder (also granted at runtime) still hides its dot entries,
        // and nothing outside any authorized folder became reachable.
        assert!(is_forbidden(exists(&window, &sibling.join(".clutter/workspace.json"))));
        assert!(is_forbidden(exists(&window, &sibling.join(".folder.md"))));
        assert!(is_forbidden(exists(&window, &root.join("elsewhere.md"))));
        assert!(is_forbidden(exists(&window, &root.join(".hidden"))));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_folder_named_with_pattern_characters_grants_only_itself() {
        let (app, window) = app_with_grants();
        let root = scratch("glob-name");
        let odd = root.join("a[1]*?");
        let lookalike = root.join("a1x");
        for folder in [&odd, &lookalike] {
            fs::create_dir_all(folder.join(".clutter")).unwrap();
            fs::write(folder.join(".clutter/workspace.json"), "{}").unwrap();
        }
        grant_static_scope(app.handle(), &odd).unwrap();

        assert_eq!(exists(&window, &odd.join(".clutter/workspace.json")), Ok(true));
        assert!(is_forbidden(exists(&window, &lookalike.join(".clutter/workspace.json"))));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn the_glob_escape_wraps_exactly_the_pattern_characters() {
        assert_eq!(escape_glob("/a/b c/d"), "/a/b c/d");
        assert_eq!(escape_glob("/a[1]*?"), "/a[[]1][*][?]");
    }
}
