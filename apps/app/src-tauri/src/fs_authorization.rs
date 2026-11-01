//! Which paths a frontend-supplied filesystem path may name: the one authorization check every native command that
//! reads, creates or moves a file on the webview's behalf uses (`copy_file_no_clobber`, `write_file_no_clobber`,
//! `move_file_no_clobber`, the export commands). One owner, so no command carries a weaker private copy.
//!
//! "Authorized" means **inside the runtime fs scope**, which is the Space-access model: a folder enters that scope only
//! when the user picked it in the native dialog, when its saved bookmark was restored at launch, or when Clutter made
//! it for the user (`space_access::allow`, `create_space_folder`, `rename_space_folder`). The static `$HOME/**`
//! capability scope the fs plugin also honours is deliberately **not** consulted: these commands are narrower than the
//! plugin commands they replace. Nothing is ever removed from the runtime scope in-process (a forgotten Space stays
//! reachable until the app quits; the operating system's bookmark is what ends it after a relaunch), and `forbid`
//! beats `allow`.
//!
//! A path is resolved before it is judged, never judged as written: it must be absolute with no `..`, and symlinks
//! are resolved once so a link inside a granted folder cannot lead out of it. The judged path is the one the caller
//! must then use. Two forms: [`authorize`] follows the final component (reading or creating a file, where the file
//! itself is what is touched) and [`authorize_entry`] does not (moving an entry, where a link is moved, not followed).
//!
//! Limits: a check followed by a use is not atomic; a local process that swaps a folder for a link between the two
//! could redirect a call. Closing that needs `openat`-style handles and is not claimed.

use std::fs;
use std::path::{Component, Path, PathBuf};

pub(crate) fn has_hidden_component(path: &Path) -> bool {
    path.components().any(|part| matches!(part, Component::Normal(name) if name.to_string_lossy().starts_with('.')))
}

/// `path` with `.`-leading components renamed so a scope that hides dot entries from its wildcards no longer does.
fn without_leading_dots(path: &Path) -> PathBuf {
    path.components()
        .map(|part| match part {
            Component::Normal(name) if name.to_string_lossy().starts_with('.') => format!("_{}", name.to_string_lossy()).into(),
            other => PathBuf::from(other.as_os_str()),
        })
        .collect()
}

/// The path to authorize and use: absolute, no `..`, symlinks resolved once (the file itself when it exists, else its
/// folder with the name appended). `None` when it cannot be resolved.
pub(crate) fn resolved(path: &str) -> Option<PathBuf> {
    let path = Path::new(path);
    if !path.is_absolute() || path.components().any(|part| matches!(part, Component::ParentDir)) {
        return None;
    }
    if let Ok(real) = fs::canonicalize(path) {
        return Some(real);
    }
    Some(fs::canonicalize(path.parent()?).ok()?.join(path.file_name()?))
}

/// Whether the scope grants `path`. A forbidden path is never granted. A hidden entry is granted when the same entry
/// without its leading dots would be (the nearest granted folder above it decides, so a folder granted without
/// recursion does not reach into hidden subfolders either).
pub(crate) fn granted(path: &Path, is_allowed: &dyn Fn(&Path) -> bool, is_forbidden: &dyn Fn(&Path) -> bool) -> bool {
    if is_forbidden(path) {
        return false;
    }
    if is_allowed(path) {
        return true;
    }
    if !has_hidden_component(path) {
        return false;
    }
    for ancestor in path.ancestors().skip(1) {
        if is_allowed(ancestor) {
            let rest = path.strip_prefix(ancestor).unwrap_or(path);
            return is_allowed(&ancestor.join(without_leading_dots(rest)));
        }
    }
    false
}

pub(crate) fn authorize(path: &str, is_allowed: &dyn Fn(&Path) -> bool, is_forbidden: &dyn Fn(&Path) -> bool) -> Result<PathBuf, String> {
    match resolved(path) {
        Some(real) if granted(&real, is_allowed, is_forbidden) => Ok(real),
        _ => Err(format!("forbidden path: {path}")),
    }
}


/// Like [`resolved`], but the final component is never followed: its folder is resolved and the name appended, so a
/// link at `path` is the thing named (a move relocates the link, it does not move what the link points at).
pub(crate) fn resolved_entry(path: &str) -> Option<PathBuf> {
    let path = Path::new(path);
    if !path.is_absolute() || path.components().any(|part| matches!(part, Component::ParentDir)) {
        return None;
    }
    Some(fs::canonicalize(path.parent()?).ok()?.join(path.file_name()?))
}

/// Like [`resolved`], for a path that does not exist yet and whose parents may not either (a recursive `mkdir`): the
/// deepest existing ancestor is resolved, links followed, and the names that do not exist yet are appended. A component
/// that is a link which cannot be resolved (a dangling link) is refused: what it would create is unknowable.
pub(crate) fn resolved_deep(path: &str) -> Option<PathBuf> {
    let path = Path::new(path);
    if !path.is_absolute() || path.components().any(|part| matches!(part, Component::ParentDir)) {
        return None;
    }
    let mut missing = Vec::new();
    let mut current = path;
    loop {
        match fs::canonicalize(current) {
            Ok(mut real) => {
                real.extend(missing.iter().rev());
                return Some(real);
            }
            Err(_) if fs::symlink_metadata(current).is_ok() => return None,
            Err(_) => {
                missing.push(current.file_name()?);
                current = current.parent()?;
            }
        }
    }
}

/// [`authorize`] for a folder that is about to be created, with any missing parents.
pub(crate) fn authorize_deep(path: &str, is_allowed: &dyn Fn(&Path) -> bool, is_forbidden: &dyn Fn(&Path) -> bool) -> Result<PathBuf, String> {
    match resolved_deep(path) {
        Some(real) if granted(&real, is_allowed, is_forbidden) => Ok(real),
        _ => Err(format!("forbidden path: {path}")),
    }
}

/// [`authorize`] for an entry that is moved: judged by its real folder and its own name.
pub(crate) fn authorize_entry(path: &str, is_allowed: &dyn Fn(&Path) -> bool, is_forbidden: &dyn Fn(&Path) -> bool) -> Result<PathBuf, String> {
    match resolved_entry(path) {
        Some(real) if granted(&real, is_allowed, is_forbidden) => Ok(real),
        _ => Err(format!("forbidden path: {path}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct Scratch(PathBuf);

    impl Scratch {
        fn new(label: &str) -> Self {
            let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
            let base = fs::canonicalize(std::env::temp_dir()).unwrap().join(format!("clutter-fs-auth-{label}-{}-{nanos}", std::process::id()));
            fs::create_dir_all(&base).unwrap();
            Scratch(base)
        }
        fn path(&self, name: &str) -> PathBuf {
            self.0.join(name)
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    fn in_dir<'a>(dir: &'a Path) -> impl Fn(&Path) -> bool + 'a {
        move |path: &Path| path.starts_with(dir) && !has_hidden_wildcard_match(path, dir)
    }

    /// A stand-in for a scope that hides dot entries from its `**` wildcard, like the runtime scope does.
    fn has_hidden_wildcard_match(path: &Path, dir: &Path) -> bool {
        path.strip_prefix(dir).map(|rest| rest.components().any(|part| part.as_os_str().to_string_lossy().starts_with('.'))).unwrap_or(false)
    }

    #[test]
    fn dot_entries_inside_a_granted_folder_are_granted_and_nothing_outside_it_is() {
        let granted_dir = Scratch::new("scope-dots");
        let other = Scratch::new("scope-other");
        let allowed = in_dir(&granted_dir.0);
        let nothing_forbidden = |_: &Path| false;

        assert!(granted(&granted_dir.path("photo.png"), &allowed, &nothing_forbidden));
        assert!(granted(&granted_dir.path(".folder.md"), &allowed, &nothing_forbidden));
        assert!(granted(&granted_dir.path("sub/.hidden/x.md"), &allowed, &nothing_forbidden));
        assert!(!granted(&other.path(".folder.md"), &allowed, &nothing_forbidden));
        assert!(!granted(&other.path("photo.png"), &allowed, &nothing_forbidden));
        // A forbidden path stays forbidden, hidden or not.
        let forbids = |path: &Path| path.ends_with(".folder.md");
        assert!(!granted(&granted_dir.path(".folder.md"), &allowed, &forbids));
    }

    #[test]
    fn a_relative_path_a_parent_reference_and_a_symlinked_parent_are_refused() {
        let vault = Scratch::new("scope-escape-vault");
        let outside = Scratch::new("scope-escape-outside");
        fs::write(outside.path("secret.md"), b"secret").unwrap();
        symlink(&outside.0, vault.path("link")).unwrap();
        let allowed = in_dir(&vault.0);
        let nothing_forbidden = |_: &Path| false;

        assert!(authorize("photo.png", &allowed, &nothing_forbidden).is_err());
        assert!(authorize(&format!("{}/../{}/x.png", vault.0.display(), outside.0.file_name().unwrap().to_string_lossy()), &allowed, &nothing_forbidden).is_err());
        // The link's real folder is outside the grant, so a path through it is refused (the scope sees the real path).
        assert!(authorize(&vault.path("link/new.png").to_string_lossy(), &allowed, &nothing_forbidden).is_err());
        assert!(authorize(&vault.path("link/secret.md").to_string_lossy(), &allowed, &nothing_forbidden).is_err());
        assert!(authorize(&vault.path("fine.png").to_string_lossy(), &allowed, &nothing_forbidden).is_ok());
    }


    #[test]
    fn a_folder_to_create_is_judged_by_its_deepest_existing_ancestor_so_a_link_parent_cannot_lead_out() {
        let vault = Scratch::new("deep-vault");
        let outside = Scratch::new("deep-outside");
        symlink(&outside.0, vault.path("exit")).unwrap();
        symlink(outside.path("not-there"), vault.path("dangling")).unwrap();
        fs::create_dir_all(vault.path("real")).unwrap();
        let allowed = in_dir(&vault.0);
        let nothing_forbidden = |_: &Path| false;

        // Nothing exists below `real`: the names are appended to the resolved ancestor.
        assert_eq!(authorize_deep(&vault.path("real/a/b/c").to_string_lossy(), &allowed, &nothing_forbidden).unwrap(), vault.path("real/a/b/c"));
        // A link to the outside, however deep the new folder is below it, is judged by where it really goes.
        assert!(authorize_deep(&vault.path("exit/made").to_string_lossy(), &allowed, &nothing_forbidden).is_err());
        assert!(authorize_deep(&vault.path("exit/made/deeper").to_string_lossy(), &allowed, &nothing_forbidden).is_err());
        assert!(authorize_deep(&vault.path("dangling/made").to_string_lossy(), &allowed, &nothing_forbidden).is_err());
        assert!(authorize_deep(&format!("{}/../x", vault.0.display()), &allowed, &nothing_forbidden).is_err());
        assert!(authorize_deep("relative/x", &allowed, &nothing_forbidden).is_err());
        assert!(authorize_deep(&outside.path("made").to_string_lossy(), &allowed, &nothing_forbidden).is_err());
    }

    #[test]
    fn an_entry_that_is_a_link_is_judged_by_its_own_name_not_by_where_it_points() {
        let vault = Scratch::new("entry-link");
        let outside = Scratch::new("entry-link-outside");
        fs::write(outside.path("target.md"), b"t").unwrap();
        symlink(outside.path("target.md"), vault.path("pointer.md")).unwrap();
        let allowed = in_dir(&vault.0);
        let nothing_forbidden = |_: &Path| false;

        // Followed, the link leaves the grant; as an entry it is a name inside the granted folder.
        assert_eq!(resolved(&vault.path("pointer.md").to_string_lossy()).unwrap(), outside.path("target.md"));
        assert_eq!(authorize_entry(&vault.path("pointer.md").to_string_lossy(), &allowed, &nothing_forbidden).unwrap(), vault.path("pointer.md"));
        // The folder part is still resolved: a path through a linked folder is judged by the real folder.
        symlink(&outside.0, vault.path("exit")).unwrap();
        assert!(authorize_entry(&vault.path("exit/new.md").to_string_lossy(), &allowed, &nothing_forbidden).is_err());
        assert!(authorize_entry("relative.md", &allowed, &nothing_forbidden).is_err());
        assert!(authorize_entry(&format!("{}/../x.md", vault.0.display()), &allowed, &nothing_forbidden).is_err());
    }

    // ---- what the webview may ask the fs plugin to do (the real capability, the real permission check) -------

    use tauri::ipc::{CallbackFn, InvokeBody};
    use tauri::test::{get_ipc_response, INVOKE_KEY};
    use tauri::webview::InvokeRequest;
    use tauri_plugin_fs::FsExt;

    /// The plugin's answer for `command` sent by the `main` window, through the real ACL of `capabilities/default.json`.
    fn plugin_fs_answer(window: &tauri::WebviewWindow<tauri::test::MockRuntime>, command: &str, args: serde_json::Value) -> Result<serde_json::Value, serde_json::Value> {
        get_ipc_response(
            window,
            InvokeRequest {
                cmd: format!("plugin:fs|{command}"),
                callback: CallbackFn(0),
                error: CallbackFn(1),
                url: "tauri://localhost".parse().unwrap(),
                body: InvokeBody::Json(args),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.to_string(),
            },
        )
        .map(|body| body.deserialize().unwrap())
    }

    fn is_acl_refusal(answer: &Result<serde_json::Value, serde_json::Value>) -> bool {
        matches!(answer, Err(error) if error.as_str().is_some_and(|text| text.contains("not allowed")))
    }

    /// The file-writing and file-opening commands of the fs plugin that the webview must not hold. `open` is here
    /// because the plugin lets it open for writing and truncating (`create`, `truncate`, `write`) on the strength of
    /// its read permission alone.
    const DENIED_FS_COMMANDS: &[&str] = &["write_file", "write_text_file", "mkdir", "remove", "rename", "copy_file", "create", "truncate", "ftruncate", "write", "open", "watch", "unwatch", "read", "seek"];

    /// What Clutter's own code uses of the plugin (`LocalFileSystem`, `TauriRecoveryStorage`, `probeSpaceFolder`,
    /// `coverImageBytes`), checked against the source by `pluginFsCapabilityAudit.test.ts`.
    const GRANTED_FS_COMMANDS: &[&str] = &["read_dir", "read_file", "read_text_file", "exists", "stat"];

    #[test]
    fn the_webview_cannot_overwrite_truncate_or_open_for_writing_through_the_fs_plugin() {
        let app = tauri::test::mock_builder().plugin(tauri_plugin_fs::init()).build(crate::app_context()).unwrap();
        let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default()).build().unwrap();
        let victim = Scratch::new("acl-victim");
        fs::write(victim.path("note.md"), b"my note").unwrap();
        fs::write(victim.path("photo.png"), b"my photo").unwrap();
        let args = serde_json::json!({ "path": victim.path("photo.png"), "from": victim.path("note.md"), "to": victim.path("photo.png"), "options": { "write": true, "truncate": true, "create": true } });

        for command in DENIED_FS_COMMANDS {
            let answer = plugin_fs_answer(&window, command, args.clone());
            assert!(is_acl_refusal(&answer), "plugin:fs|{command} must not be callable by the webview: {answer:?}");
        }
        assert_eq!(fs::read(victim.path("photo.png")).unwrap(), b"my photo");
        assert_eq!(fs::read(victim.path("note.md")).unwrap(), b"my note");
    }

    /// `writeTextFile(path, text)` exactly as `@tauri-apps/plugin-fs` sends it: the path in a header, the bytes as the body.
    fn plugin_write_text_file(window: &tauri::WebviewWindow<tauri::test::MockRuntime>, path: &Path, text: &str) -> Result<serde_json::Value, serde_json::Value> {
        let mut headers = tauri::http::HeaderMap::new();
        headers.insert("path", path.to_string_lossy().replace('/', "%2F").parse().unwrap());
        get_ipc_response(
            window,
            InvokeRequest {
                cmd: "plugin:fs|write_text_file".into(),
                callback: CallbackFn(0),
                error: CallbackFn(1),
                url: "tauri://localhost".parse().unwrap(),
                body: InvokeBody::Raw(text.as_bytes().to_vec()),
                headers,
                invoke_key: INVOKE_KEY.to_string(),
            },
        )
        .map(|body| body.deserialize().unwrap())
    }

    #[test]
    fn the_webview_cannot_overwrite_or_empty_an_existing_note_with_write_text_file() {
        let app = tauri::test::mock_builder().plugin(tauri_plugin_fs::init()).build(crate::app_context()).unwrap();
        let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default()).build().unwrap();
        let space = Scratch::new("acl-note");
        fs::write(space.path("note.md"), b"my note").unwrap();
        // The Space is inside the runtime scope, as a real one is: the command is refused by the permission, not by scope.
        app.fs_scope().allow_directory(&space.0, true).unwrap();

        for text in ["overwritten by script", ""] {
            let answer = plugin_write_text_file(&window, &space.path("note.md"), text);
            assert!(is_acl_refusal(&answer), "plugin:fs|write_text_file must not be callable by the webview: {answer:?}");
        }

        assert_eq!(fs::read(space.path("note.md")).unwrap(), b"my note");
    }

    #[test]
    fn the_webview_cannot_replace_move_out_or_delete_an_existing_note_through_the_fs_plugin() {
        let app = tauri::test::mock_builder().plugin(tauri_plugin_fs::init()).build(crate::app_context()).unwrap();
        let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default()).build().unwrap();
        let space = Scratch::new("acl-note-ops");
        let outside = Scratch::new("acl-note-ops-outside");
        fs::write(space.path("note.md"), b"my note").unwrap();
        fs::write(space.path("other.md"), b"other note").unwrap();
        symlink(&outside.0, space.path("exit")).unwrap();
        // The Space is inside the runtime scope, as a real one is: each call is refused by the permission, not by scope.
        app.fs_scope().allow_directory(&space.0, true).unwrap();

        let attempts = [
            ("rename", serde_json::json!({ "oldPath": space.path("other.md"), "newPath": space.path("note.md") })),
            ("rename", serde_json::json!({ "oldPath": space.path("note.md"), "newPath": space.path("exit/moved-out.md") })),
            ("remove", serde_json::json!({ "path": space.path("note.md") })),
            ("mkdir", serde_json::json!({ "path": space.path("exit/made"), "options": { "recursive": true } })),
        ];
        for (command, args) in attempts {
            let answer = plugin_fs_answer(&window, command, args);
            assert!(is_acl_refusal(&answer), "plugin:fs|{command} must not be callable by the webview: {answer:?}");
        }

        assert_eq!(fs::read(space.path("note.md")).unwrap(), b"my note");
        assert_eq!(fs::read(space.path("other.md")).unwrap(), b"other note");
        assert!(!outside.path("moved-out.md").exists() && !outside.path("made").exists());
    }

    #[test]
    fn the_webview_can_still_use_every_fs_plugin_command_clutter_itself_needs() {
        let app = tauri::test::mock_builder().plugin(tauri_plugin_fs::init()).build(crate::app_context()).unwrap();
        let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default()).build().unwrap();

        for command in GRANTED_FS_COMMANDS {
            // Whatever the plugin says about these arguments, it is not the permission system refusing the command.
            let answer = plugin_fs_answer(&window, command, serde_json::json!({}));
            assert!(!is_acl_refusal(&answer), "plugin:fs|{command} is needed and must stay granted: {answer:?}");
        }
    }
}
