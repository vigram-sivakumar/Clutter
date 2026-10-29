//! Stage 2b-ii: drives Clutter's registered atomic-write commands from a real WebView in a real Tauri application.
//!
//! The production sources are compiled unchanged (`#[path]`), registered with the same `generate_handler!` shape as
//! `lib.rs`, behind the real fs plugin with the same `$HOME/**` scope Clutter's capability grants. A scenario runner
//! (a Rust thread) hands each call to the WebView, whose JavaScript performs it through the real IPC bridge and
//! returns the raw response; the runner then checks the actual disk. Nothing here is a mock.
//!
//! Output: a JSON report at `$VF_OUT` and a summary on stdout. The process exits when finished.

#[path = "../../app/src-tauri/src/atomic_replace.rs"]
#[allow(dead_code)]
mod atomic_replace;
#[path = "../../app/src-tauri/src/atomic_commands.rs"]
mod atomic_commands;

use std::collections::HashMap;
use std::fs;
use std::os::unix::fs::{symlink, MetadataExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tauri::{Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_fs::FsExt;

// ---------------------------------------------------------------------------------------------------------
// Bridge between the scenario thread and the WebView(s)
// ---------------------------------------------------------------------------------------------------------

#[derive(Default)]
struct Bridge {
    queues: Mutex<HashMap<String, Vec<Value>>>,
    replies: Mutex<HashMap<u64, Result<Value, Value>>>,
    arrived: Condvar,
    next: AtomicU64,
}

impl Bridge {
    /// Hands `calls` to the window `label` as one batch (the page runs a batch concurrently) and waits for all.
    fn batch(&self, label: &str, calls: Vec<(&str, Value)>) -> Vec<Result<Value, Value>> {
        let ids: Vec<u64> = calls.iter().map(|_| self.next.fetch_add(1, Ordering::SeqCst)).collect();
        {
            let mut queues = self.queues.lock().unwrap();
            let queue = queues.entry(label.to_string()).or_default();
            for (id, (command, args)) in ids.iter().zip(calls) {
                queue.push(json!({ "id": id, "command": command, "args": args }));
            }
        }
        let deadline = Instant::now() + Duration::from_secs(120);
        let mut replies = self.replies.lock().unwrap();
        loop {
            if ids.iter().all(|id| replies.contains_key(id)) {
                return ids.iter().map(|id| replies.remove(id).unwrap()).collect();
            }
            let left = deadline.saturating_duration_since(Instant::now());
            if left.is_zero() {
                return ids.iter().map(|_| Err(json!("verify: the WebView never answered"))).collect();
            }
            replies = self.arrived.wait_timeout(replies, left).unwrap().0;
        }
    }

    fn call(&self, label: &str, command: &str, args: Value) -> Result<Value, Value> {
        self.batch(label, vec![(command, args)]).remove(0)
    }
}

#[tauri::command]
async fn vf_poll(bridge: State<'_, Arc<Bridge>>, label: String) -> Result<Vec<Value>, ()> {
    Ok(bridge.queues.lock().unwrap().remove(&label).unwrap_or_default())
}

#[tauri::command]
async fn vf_reply(bridge: State<'_, Arc<Bridge>>, id: u64, ok: bool, value: Value) -> Result<(), ()> {
    bridge.replies.lock().unwrap().insert(id, if ok { Ok(value) } else { Err(value) });
    bridge.arrived.notify_all();
    Ok(())
}

// ---------------------------------------------------------------------------------------------------------
// Scenario runner
// ---------------------------------------------------------------------------------------------------------

struct Run {
    app: tauri::AppHandle,
    bridge: Arc<Bridge>,
    base: PathBuf,
    checks: Vec<Value>,
    notes: Vec<String>,
}

fn raw(result: &Result<Value, Value>) -> Value {
    match result {
        Ok(value) => value.clone(),
        Err(error) => json!({ "__rejected": error }),
    }
}

/// `committed`, `notCommitted:<reason>`, `uncertain`, `rejected:<code or text>`, `confirmed`, `superseded`, ...
fn tag(result: &Result<Value, Value>) -> String {
    match result {
        Ok(value) => {
            let status = value["status"].as_str().unwrap_or("?");
            match value["reason"].as_str() {
                Some(reason) => format!("{status}:{reason}"),
                None => status.to_string(),
            }
        }
        Err(error) => match error["code"].as_str() {
            Some(code) => format!("rejected:{code}"),
            None => format!("rejected:{}", error.to_string().chars().take(80).collect::<String>()),
        },
    }
}

impl Run {
    fn check(&mut self, name: &str, pass: bool, detail: impl Into<String>) {
        let detail = detail.into();
        println!("{} {name}{}", if pass { "PASS" } else { "FAIL" }, if detail.is_empty() { String::new() } else { format!("  [{detail}]") });
        self.checks.push(json!({ "name": name, "pass": pass, "detail": detail }));
    }

    fn note(&mut self, text: impl Into<String>) {
        let text = text.into();
        println!("NOTE {text}");
        self.notes.push(text);
    }

    /// What the native folder picker does for a folder the user chose: adds it, recursively, to the runtime fs scope
    /// (`app.fs_scope()`), the scope the atomic commands (like `move_file_no_clobber`) authorise against.
    fn grant(&self, dir: &Path) {
        self.app.fs_scope().allow_directory(dir, true).unwrap();
    }

    /// A vault the user has opened: a folder with `.clutter`, granted as the picker would.
    fn vault(&self, name: &str) -> PathBuf {
        let root = self.base.join(name);
        fs::create_dir_all(root.join(".clutter")).unwrap();
        self.grant(&root);
        root
    }

    fn write(&self, root: &Path, path: &Path, contents: &str, intent: Value) -> Result<Value, Value> {
        self.bridge.call(
            "main",
            "atomic_write_file",
            json!({ "request": { "vaultRoot": root, "path": path, "contents": contents, "intent": intent } }),
        )
    }

    fn create(&self, root: &Path, path: &Path, contents: &str) -> Result<Value, Value> {
        self.write(root, path, contents, json!({ "kind": "create" }))
    }

    fn replace(&self, root: &Path, path: &Path, contents: &str) -> Result<Value, Value> {
        self.write(root, path, contents, json!({ "kind": "replace" }))
    }

    fn replace_if(&self, root: &Path, path: &Path, contents: &str, expected: &str) -> Result<Value, Value> {
        self.write(root, path, contents, json!({ "kind": "replaceIfContent", "expected": expected }))
    }

    fn confirm(&self, root: &Path, path: &Path, expected: &str) -> Result<Value, Value> {
        self.bridge.call(
            "main",
            "atomic_confirm_durability",
            json!({ "request": { "vaultRoot": root, "path": path, "expected": expected } }),
        )
    }

    fn inspect(&self, root: &Path, path: &Path, attempted: &str, previous: Option<&str>, temps: &[PathBuf]) -> Result<Value, Value> {
        self.bridge.call(
            "main",
            "atomic_inspect_write",
            json!({ "request": { "vaultRoot": root, "path": path, "attempted": attempted, "previous": previous, "tempPaths": temps } }),
        )
    }
}

fn read(path: &Path) -> String {
    fs::read_to_string(path).unwrap_or_else(|error| format!("<unreadable: {error}>"))
}

fn temps_in(dir: &Path) -> Vec<String> {
    fs::read_dir(dir)
        .map(|entries| {
            entries
                .flatten()
                .map(|entry| entry.file_name().to_string_lossy().to_string())
                .filter(|name| name.starts_with(".clutter-tmp."))
                .collect()
        })
        .unwrap_or_default()
}

fn sh(program: &str, args: &[&str]) -> (bool, String) {
    match Command::new(program).args(args).output() {
        Ok(output) => (
            output.status.success(),
            format!("{}{}", String::from_utf8_lossy(&output.stdout), String::from_utf8_lossy(&output.stderr)).trim().to_string(),
        ),
        Err(error) => (false, error.to_string()),
    }
}

/// Creates and mounts a small disk image of `fs_type` at `mount`. Returns false (with a note) if it cannot.
fn mount_image(run: &mut Run, fs_type: &str, size: &str, mount: &Path) -> bool {
    let image = run.base.join(format!("{}.dmg", mount.file_name().unwrap().to_string_lossy()));
    let (created, output) = sh("hdiutil", &["create", "-size", size, "-fs", fs_type, "-volname", "vfvol", image.to_str().unwrap()]);
    if !created {
        run.note(format!("could not create a {fs_type} image: {output}"));
        return false;
    }
    fs::create_dir_all(mount).unwrap();
    let (attached, output) = sh("hdiutil", &["attach", image.to_str().unwrap(), "-mountpoint", mount.to_str().unwrap(), "-nobrowse"]);
    if !attached {
        run.note(format!("could not mount the {fs_type} image: {output}"));
    }
    attached
}

fn unmount(mount: &Path) {
    let _ = sh("hdiutil", &["detach", mount.to_str().unwrap(), "-force"]);
}

fn xattr_value(path: &Path, name: &str) -> String {
    sh("xattr", &["-p", name, path.to_str().unwrap()]).1
}

// ---- scenarios ------------------------------------------------------------------------------------------

/// Where the authorising scope comes from. The commands read `app.fs_scope()`; the static `$HOME/**` in the
/// capability file is a different scope (the plugin's own command scope) and is not in it.
fn scope_sources(run: &mut Run) {
    let root = run.base.join("ungranted-vault");
    fs::create_dir_all(root.join(".clutter")).unwrap();
    let note = root.join("n.md");
    let plugin = run.bridge.call("main", "plugin:fs|exists", json!({ "path": root }));
    let atomic = run.create(&root, &note, "x");
    run.note(format!("under $HOME, never granted at runtime: fs plugin `exists` = {}, atomic_write_file = {}", tag(&plugin), tag(&atomic)));
    run.check("[finding] a vault under $HOME that was never granted at runtime is reachable by the fs plugin but refused by the atomic commands (outOfScope)", plugin.is_ok() && tag(&atomic) == "rejected:outOfScope" && !note.exists(), format!("plugin {} / atomic {}", tag(&plugin), tag(&atomic)));
    run.grant(&root);
    let atomic = run.create(&root, &note, "x");
    run.check("after the runtime grant (what the folder picker adds) the same request commits", tag(&atomic) == "committed", tag(&atomic));
}

fn operations(run: &mut Run) {
    let root = run.vault("ops");
    let note = root.join("note.md");

    let created = run.create(&root, &note, "one");
    run.check("create a new note", tag(&created) == "committed" && created.as_ref().unwrap()["replaced"] == "created" && read(&note) == "one", raw(&created).to_string());
    run.check("a successful write leaves no temporary file", temps_in(&root).is_empty(), format!("{:?}", temps_in(&root)));

    let again = run.create(&root, &note, "two");
    run.check("create over an existing note is refused, original intact", tag(&again) == "notCommitted:destinationExists" && read(&note) == "one", tag(&again));

    let replaced = run.replace(&root, &note, "three");
    run.check("replace an existing note", tag(&replaced) == "committed" && replaced.as_ref().unwrap()["replaced"] == "existing" && read(&note) == "three", tag(&replaced));

    let missing = run.replace(&root, &root.join("gone.md"), "x");
    run.check("replace of a missing note is refused and creates nothing", tag(&missing) == "notCommitted:targetMissing" && !root.join("gone.md").exists(), tag(&missing));

    let stale = run.replace_if(&root, &note, "four", "not what it holds");
    run.check("replaceIfContent with a stale expectation is refused, original intact", tag(&stale) == "notCommitted:staleExpected" && read(&note) == "three", tag(&stale));
    let matched = run.replace_if(&root, &note, "four", "three");
    run.check("replaceIfContent with the right expectation commits", tag(&matched) == "committed" && read(&note) == "four", tag(&matched));

    let upsert_new = run.write(&root, &root.join("state.json"), "{}", json!({ "kind": "upsert" }));
    let upsert_old = run.write(&root, &root.join("state.json"), "{\"a\":1}", json!({ "kind": "upsert" }));
    run.check(
        "upsert creates, then replaces",
        upsert_new.as_ref().map(|v| v["replaced"] == "created").unwrap_or(false) && upsert_old.as_ref().map(|v| v["replaced"] == "existing").unwrap_or(false) && read(&root.join("state.json")) == "{\"a\":1}",
        "",
    );

    // Content that must survive byte for byte through JSON + IPC + the writer.
    let awkward = "héllo ✓ 日本語 🎉\r\nCRLF line\n\ttab\n\0nul? no, but a lone \u{feff}BOM after\n";
    let w = run.create(&root, &root.join("unicode ✓ note.md"), awkward);
    run.check("unicode, CRLF, tab and BOM content round-trips exactly", tag(&w) == "committed" && fs::read(root.join("unicode ✓ note.md")).unwrap() == awkward.as_bytes(), tag(&w));
    let long_name = format!("{}.md", "n".repeat(252));
    let w = run.create(&root, &root.join(&long_name), "long name");
    run.check("a 255-byte file name is written (temp name never derives from the target)", tag(&w) == "committed" && read(&root.join(&long_name)) == "long name", tag(&w));

    let big: String = "0123456789abcdef".repeat(320 * 1024); // 5 MiB
    let started = Instant::now();
    let w = run.create(&root, &root.join("big.md"), &big);
    run.check("a 5 MiB note is written intact", tag(&w) == "committed" && read(&root.join("big.md")) == big, format!("{} ms", started.elapsed().as_millis()));

    // Inspect.
    let i = run.inspect(&root, &note, "four", Some("three"), &[]);
    run.check("inspect: holdsAttempted", raw(&i)["target"] == "holdsAttempted", raw(&i).to_string());
    let i = run.inspect(&root, &note, "five", Some("four"), &[]);
    run.check("inspect: holdsPrevious", raw(&i)["target"] == "holdsPrevious", raw(&i).to_string());
    let i = run.inspect(&root, &note, "five", Some("six"), &[]);
    run.check("inspect: holdsOther", raw(&i)["target"] == "holdsOther", raw(&i).to_string());
    let i = run.inspect(&root, &root.join("nothing.md"), "five", None, &[]);
    run.check("inspect: missing", raw(&i)["target"] == "missing", raw(&i).to_string());
    let other = root.join("other.md");
    fs::write(&other, "private").unwrap();
    let i = run.inspect(&root, &note, "four", None, &[other.clone()]);
    run.note(format!("inspect with a non-temporary file listed in tempPaths answered: {}", raw(&i)));
    run.check("inspect does not report the content of a file that is not the writer's temporary file", !raw(&i).to_string().contains("private") && read(&other) == "private", "");

    // Flush-only confirm: must not rewrite anything.
    let before = fs::metadata(&note).unwrap();
    std::thread::sleep(Duration::from_millis(1100));
    let c = run.confirm(&root, &note, "four");
    let after = fs::metadata(&note).unwrap();
    run.check("confirmDurability: confirmed (or unconfirmed with named gaps), file untouched", matches!(tag(&c).as_str(), "confirmed" | "unconfirmed") && before.ino() == after.ino() && before.mtime_nsec() == after.mtime_nsec() && before.mtime() == after.mtime(), raw(&c).to_string());
    let c = run.confirm(&root, &note, "an older revision");
    run.check("confirmDurability: a different revision answers superseded and flushes nothing for it", tag(&c) == "superseded", tag(&c));
    let c = run.confirm(&root, &root.join("nothing.md"), "x");
    run.check("confirmDurability: missing file answers missing", tag(&c) == "missing", tag(&c));
}

fn metadata_preservation(run: &mut Run) {
    let root = run.vault("meta");
    let note = root.join("meta.md");
    fs::write(&note, "v1").unwrap();
    fs::set_permissions(&note, fs::Permissions::from_mode(0o640)).unwrap();
    sh("xattr", &["-w", "com.clutter.verify", "hello-xattr", note.to_str().unwrap()]);
    sh("chflags", &["hidden", note.to_str().unwrap()]);
    let hard = root.join("hardlink.md");
    fs::hard_link(&note, &hard).unwrap();
    std::thread::sleep(Duration::from_millis(1500));
    let before = fs::metadata(&note).unwrap();
    let btime_before = before.created().unwrap();
    let flags_before = sh("ls", &["-lO", note.to_str().unwrap()]).1;

    let w = run.replace(&root, &note, "v2 replaced");
    let after = fs::metadata(&note).unwrap();
    let btime_after = after.created().unwrap();
    let skew = btime_after.duration_since(btime_before).or_else(|e| Ok::<_, ()>(e.duration())).unwrap();
    run.check("metadata: replace committed", tag(&w) == "committed" && read(&note) == "v2 replaced", raw(&w).to_string());
    run.check("metadata: birth time preserved", skew < Duration::from_millis(1), format!("difference {skew:?}, notes {}", raw(&w)["metadataNotes"]));
    run.check("metadata: mode 0640 preserved", after.mode() & 0o7777 == 0o640, format!("{:o}", after.mode() & 0o7777));
    run.check("metadata: extended attribute preserved", xattr_value(&note, "com.clutter.verify") == "hello-xattr", xattr_value(&note, "com.clutter.verify"));
    let flags_after = sh("ls", &["-lO", note.to_str().unwrap()]).1;
    let flag = |text: &str| text.split_whitespace().any(|word| word.contains("hidden"));
    run.check("metadata: file flags (hidden) preserved", flag(&flags_before) && flag(&flags_after), format!("{flags_before} -> {flags_after}"));
    run.check("metadata: owner preserved", before.uid() == after.uid() && before.gid() == after.gid(), "");
    run.check("metadata: modification time is the write time, not the copied old one", after.mtime() > before.mtime(), format!("{} -> {}", before.mtime(), after.mtime()));
    run.check("documented: the inode changes (rename-over)", before.ino() != after.ino(), "");
    run.check("documented: a hard link keeps the old content", read(&hard) == "v1", read(&hard));
    run.check("metadata: no temporary file remains", temps_in(&root).is_empty(), "");
}

fn failures_on_the_real_filesystem(run: &mut Run) {
    let root = run.vault("fail");
    let note = root.join("locked.md");

    // Immutable flag: the temporary file can be made, the final rename cannot succeed.
    fs::write(&note, "original").unwrap();
    sh("chflags", &["uchg", note.to_str().unwrap()]);
    let w = run.replace(&root, &note, "new");
    sh("chflags", &["nouchg", note.to_str().unwrap()]);
    run.check("immutable target: not committed, original intact, nothing left behind", tag(&w).starts_with("notCommitted") && read(&note) == "original" && temps_in(&root).is_empty(), format!("{} / {:?}", tag(&w), temps_in(&root)));

    // Read-only file.
    fs::write(&note, "original").unwrap();
    fs::set_permissions(&note, fs::Permissions::from_mode(0o444)).unwrap();
    let w = run.replace(&root, &note, "new");
    fs::set_permissions(&note, fs::Permissions::from_mode(0o644)).unwrap();
    run.check("read-only file: refused as readOnlyTarget, original intact", tag(&w) == "notCommitted:readOnlyTarget" && read(&note) == "original", tag(&w));

    // Directory that cannot be written: the temporary file cannot be created (the rename step is never reached).
    let locked_dir = root.join("locked-dir");
    fs::create_dir_all(&locked_dir).unwrap();
    fs::write(locked_dir.join("n.md"), "in locked dir").unwrap();
    fs::set_permissions(&locked_dir, fs::Permissions::from_mode(0o555)).unwrap();
    let replace = run.replace(&root, &locked_dir.join("n.md"), "new");
    let create = run.create(&root, &locked_dir.join("fresh.md"), "new");
    fs::set_permissions(&locked_dir, fs::Permissions::from_mode(0o755)).unwrap();
    run.check("unwritable directory: replace refused, original intact", tag(&replace).starts_with("notCommitted") && read(&locked_dir.join("n.md")) == "in locked dir", tag(&replace));
    run.check("unwritable directory: create refused, nothing created", tag(&create).starts_with("notCommitted") && !locked_dir.join("fresh.md").exists(), tag(&create));

    // A real rename failure: every pre-check passes (the file is writable, the directory is writable, the temporary
    // file is created, filled and made durable), then the kernel refuses to replace the destination because an ACL
    // denies deleting it.
    let acl_note = root.join("acl.md");
    fs::write(&acl_note, "acl original").unwrap();
    let (acl_set, acl_out) = sh("chmod", &["+a", "everyone deny delete", acl_note.to_str().unwrap()]);
    if acl_set {
        let w = run.replace(&root, &acl_note, "acl new");
        let leftovers = temps_in(&root);
        let reported: Vec<String> = raw(&w)["leftovers"].as_array().map(|list| list.iter().filter_map(|v| v.as_str().map(|p| p.rsplit('/').next().unwrap().to_string())).collect()).unwrap_or_default();
        // The deny-delete ACL is copied onto the temporary file with the rest of the metadata, so the writer cannot
        // remove it either; what matters is that it says so.
        for name in &leftovers {
            sh("chmod", &["-N", root.join(name).to_str().unwrap()]);
        }
        sh("chmod", &["-N", acl_note.to_str().unwrap()]);
        run.note(format!("rename blocked by an ACL: {}", raw(&w)));
        run.check(
            "rename failure (ACL denies delete): not committed, original intact, and every temporary file left on disk is reported in `leftovers`",
            read(&acl_note) == "acl original" && tag(&w).starts_with("notCommitted") && leftovers.iter().all(|name| reported.contains(name)),
            format!("{} / on disk {leftovers:?} / reported {reported:?}", tag(&w)),
        );
    } else {
        run.note(format!("could not set an ACL to force a rename failure: {acl_out}"));
    }

    // Wrong kinds of target.
    let dir_target = root.join("a-directory.md");
    fs::create_dir_all(&dir_target).unwrap();
    let w = run.replace(&root, &dir_target, "x");
    run.check("a directory as the target is refused", tag(&w) == "notCommitted:notARegularFile" && dir_target.is_dir(), tag(&w));
    let link_target = root.join("link.md");
    fs::write(root.join("real.md"), "real").unwrap();
    symlink(root.join("real.md"), &link_target).unwrap();
    let w = run.replace(&root, &link_target, "x");
    run.check("a symlink as the target is refused, nothing written through it", tag(&w) == "notCommitted:unsupportedSymlink" && read(&root.join("real.md")) == "real", tag(&w));
    let fifo = root.join("pipe.md");
    sh("mkfifo", &[fifo.to_str().unwrap()]);
    let started = Instant::now();
    let w = run.replace(&root, &fifo, "x");
    run.check("a FIFO as the target is refused without blocking", tag(&w) == "notCommitted:notARegularFile" && started.elapsed() < Duration::from_secs(10), format!("{} in {:?}", tag(&w), started.elapsed()));
}

fn disk_full(run: &mut Run) {
    let mount = run.base.join("mnt-full");
    if !mount_image(run, "APFS", "2m", &mount) {
        run.check("disk full: could not build the small volume", false, "see notes");
        return;
    }
    fs::create_dir_all(mount.join(".clutter")).unwrap();
    run.grant(&mount);
    let note = mount.join("note.md");
    fs::write(&note, "x".repeat(2000)).unwrap();
    // Fill the volume.
    let chunk = vec![7u8; 32 * 1024];
    let mut filled = 0;
    for index in 0..400 {
        match fs::write(mount.join(format!("filler-{index:03}")), &chunk) {
            Ok(()) => filled += 1,
            Err(_) => {
                let _ = fs::remove_file(mount.join(format!("filler-{index:03}")));
                break;
            }
        }
    }
    run.note(format!("filled the small volume with {filled} x 32 KiB chunks until the OS reported no space"));
    let free_kb = sh("df", &["-k", mount.to_str().unwrap()]).1;
    run.note(format!("df after fill: {}", free_kb.lines().last().unwrap_or("")));

    // 1. No room for even a modest replacement.
    let new_content = "y".repeat(600 * 1024);
    let w = run.replace(&mount, &note, &new_content);
    let leftovers = temps_in(&mount);
    run.check("disk full: replacement is not committed", tag(&w).starts_with("notCommitted"), raw(&w).to_string());
    run.check("disk full: the original note is intact", read(&note) == "x".repeat(2000), format!("{} bytes", read(&note).len()));
    run.check("disk full: no half-written temporary file remains on disk", leftovers.is_empty(), format!("{leftovers:?}"));
    run.check("disk full: reason names the space problem", matches!(tag(&w).as_str(), "notCommitted:insufficientSpace"), tag(&w));

    // 2. A little room: bytes get written, then the write runs out mid-file.
    for index in (0..filled.min(8)).rev() {
        let _ = fs::remove_file(mount.join(format!("filler-{index:03}")));
    }
    let free_before = sh("df", &["-k", mount.to_str().unwrap()]).1.lines().last().unwrap_or("").to_string();
    let w = run.replace(&mount, &note, &"z".repeat(900 * 1024));
    run.note(format!("partial-write attempt: df before: {free_before}; result: {}", raw(&w)));
    let leftovers = temps_in(&mount);
    run.check("partial write (runs out mid-file): not committed, original intact, no leftover", tag(&w).starts_with("notCommitted") && read(&note) == "x".repeat(2000) && leftovers.is_empty(), format!("{} / {leftovers:?}", tag(&w)));
    run.note(format!("partial-write outcome: {}", tag(&w)));
    // 3. After freeing space the same save succeeds, i.e. a failure left nothing wedged.
    for index in 8..filled.min(14) {
        let _ = fs::remove_file(mount.join(format!("filler-{index:03}")));
    }
    let w = run.replace(&mount, &note, "fits now");
    run.check("after space is freed the same save commits", tag(&w) == "committed" && read(&note) == "fits now", tag(&w));
    // 4. A brand-new file on a full volume.
    unmount(&mount);
}

fn unsupported_and_supported_volumes(run: &mut Run) {
    for (fs_type, expect_supported) in [("HFS+", false), ("MS-DOS", false), ("ExFAT", false), ("Case-sensitive APFS", true)] {
        let mount = run.base.join(format!("mnt-{}", fs_type.replace(['+', ' ', '-'], "")));
        if !mount_image(run, fs_type, "8m", &mount) {
            run.check(&format!("volume {fs_type}: could not be mounted for the test"), false, "see notes");
            continue;
        }
        fs::create_dir_all(mount.join(".clutter")).unwrap();
        run.grant(&mount);
        let existing = mount.join("existing.md");
        fs::write(&existing, "old").unwrap();
        let created = run.create(&mount, &mount.join("new.md"), "new");
        let replaced = run.replace(&mount, &existing, "new");
        let confirmed = run.confirm(&mount, &existing, "old");
        if expect_supported {
            run.check(&format!("volume {fs_type}: writes are accepted"), tag(&created) == "committed" && tag(&replaced) == "committed" && read(&existing) == "new", format!("{} / {}", tag(&created), tag(&replaced)));
        } else {
            run.check(
                &format!("volume {fs_type}: create and replace refused as unsupportedFilesystem, nothing written"),
                tag(&created) == "notCommitted:unsupportedFilesystem" && tag(&replaced) == "notCommitted:unsupportedFilesystem" && !mount.join("new.md").exists() && read(&existing) == "old" && temps_in(&mount).is_empty(),
                format!("{} / {}", tag(&created), tag(&replaced)),
            );
            run.note(format!("volume {fs_type}: confirmDurability answered {}", raw(&confirmed)));
        }
        unmount(&mount);
    }
}

fn scope_and_forgery(run: &mut Run) {
    let vault = run.vault("scope-vault");
    let sibling = run.vault("scope-sibling");
    let plain = run.base.join("scope-plain"); // granted, but no `.clutter`
    fs::create_dir_all(&plain).unwrap();
    run.grant(&plain);
    let inside_home_outside_vault = run.base.join("scope-elsewhere"); // a folder the user also granted
    fs::create_dir_all(&inside_home_outside_vault).unwrap();
    run.grant(&inside_home_outside_vault);
    fs::write(inside_home_outside_vault.join("secret.md"), "home secret").unwrap();
    let outside_scope = PathBuf::from(format!("/tmp/clutter-verify-outside-{}", std::process::id()));
    fs::create_dir_all(outside_scope.join(".clutter")).unwrap();
    fs::write(outside_scope.join("secret.md"), "outside secret").unwrap();
    fs::write(sibling.join("sibling.md"), "sibling").unwrap();
    symlink(&inside_home_outside_vault, vault.join("link-in-home")).unwrap();
    symlink(&outside_scope, vault.join("link-outside")).unwrap();
    symlink(&vault, run.base.join("root-link")).unwrap();
    fs::create_dir_all(vault.join("sub")).unwrap();

    let home = PathBuf::from(std::env::var("HOME").unwrap());
    let cases: Vec<(&str, PathBuf, PathBuf)> = vec![
        ("root / (a forged root)", PathBuf::from("/"), inside_home_outside_vault.join("secret.md")),
        ("root outside the scope with a .clutter marker", outside_scope.clone(), outside_scope.join("secret.md")),
        ("real vault root, target outside the scope", vault.clone(), outside_scope.join("secret.md")),
        ("real vault root, target in the scope but outside the vault", vault.clone(), inside_home_outside_vault.join("secret.md")),
        ("real vault root, target in another vault", vault.clone(), sibling.join("sibling.md")),
        ("`..` traversal out of the vault", vault.clone(), vault.join("sub/../../scope-elsewhere/secret.md")),
        ("a directory symlink to a folder elsewhere in HOME", vault.clone(), vault.join("link-in-home/secret.md")),
        ("a directory symlink to a folder outside the scope", vault.clone(), vault.join("link-outside/secret.md")),
        ("a root that is itself a symlink to the real vault, target through the link elsewhere", run.base.join("root-link"), run.base.join("root-link/link-in-home/secret.md")),
        ("the home directory as the root", home.clone(), inside_home_outside_vault.join("secret.md")),
        ("an approved folder that is not a vault (no .clutter)", plain.clone(), plain.join("n.md")),
        ("relative root", PathBuf::from("relative/vault"), PathBuf::from("/tmp/x.md")),
        ("empty root", PathBuf::from(""), vault.join("n.md")),
        ("relative target", vault.clone(), PathBuf::from("n.md")),
    ];
    for (name, root, target) in cases {
        let w = run.create(&root, &target, "FORGED");
        let w2 = run.replace(&root, &target, "FORGED");
        let wrote = read(&inside_home_outside_vault.join("secret.md")) != "home secret"
            || read(&outside_scope.join("secret.md")) != "outside secret"
            || read(&sibling.join("sibling.md")) != "sibling"
            || plain.join("n.md").exists()
            || vault.join("n.md").exists();
        let refused = |t: &str| t.starts_with("rejected:") || t.starts_with("notCommitted");
        // The home-directory root is legitimately accepted by the *scope* if it has a .clutter folder; report it.
        run.check(&format!("forged request refused: {name}"), refused(&tag(&w)) && refused(&tag(&w2)) && !wrote, format!("create={} replace={}", tag(&w), tag(&w2)));
    }
    // Inspect and confirm with the same escapes.
    let i = run.inspect(&vault, &vault.join("link-in-home/secret.md"), "x", Some("home secret"), &[]);
    run.check("inspect through an escaping symlink is refused", tag(&i).starts_with("rejected:") || tag(&i).starts_with("refused"), tag(&i));
    let c = run.confirm(&vault, &vault.join("link-in-home/secret.md"), "home secret");
    run.check("confirmDurability through an escaping symlink is refused", tag(&c).starts_with("rejected:") || tag(&c).starts_with("refused"), tag(&c));
    let i = run.inspect(&vault, &vault.join("n.md"), "x", None, &[outside_scope.join("secret.md")]);
    run.check("inspect with a temp path outside the scope is refused", tag(&i).starts_with("rejected:"), tag(&i));

    // Malformed requests the page-side code might send.
    let bad = [
        ("unknown field (a forged filesystem list)", json!({ "request": { "vaultRoot": vault, "path": vault.join("n.md"), "contents": "x", "intent": { "kind": "create" }, "supportedFilesystems": ["exfat"] } })),
        ("unknown intent kind", json!({ "request": { "vaultRoot": vault, "path": vault.join("n.md"), "contents": "x", "intent": { "kind": "truncate" } } })),
        ("contents of the wrong type", json!({ "request": { "vaultRoot": vault, "path": vault.join("n.md"), "contents": 7, "intent": { "kind": "create" } } })),
        ("missing request wrapper", json!({ "vaultRoot": vault })),
        ("null request", json!({ "request": null })),
    ];
    for (name, args) in bad {
        let r = run.bridge.call("main", "atomic_write_file", args);
        run.check(&format!("malformed request rejected: {name}"), r.is_err() && !vault.join("n.md").exists(), tag(&r));
    }
    let r = run.bridge.call("main", "atomic_truncate_file", json!({ "request": {} }));
    run.check("an unregistered command name is rejected by the IPC layer", r.is_err(), tag(&r));

    // Is every one of those home-scope secrets still intact?
    run.check("no secret outside the vault was modified by any forged request", read(&inside_home_outside_vault.join("secret.md")) == "home secret" && read(&outside_scope.join("secret.md")) == "outside secret", "");
    let _ = fs::remove_dir_all(&outside_scope);
}

fn real_ipc_concurrency(run: &mut Run) {
    let root = run.vault("race");
    let note = root.join("race.md");
    fs::write(&note, "base").unwrap();
    let make = |i: usize| ("atomic_write_file", json!({ "request": { "vaultRoot": root, "path": note, "contents": format!("writer-{i}"), "intent": { "kind": "replaceIfContent", "expected": "base" } } }));
    let results = run.bridge.batch("main", (0..16).map(make).collect());
    let committed: Vec<usize> = results.iter().enumerate().filter(|(_, r)| tag(r) == "committed").map(|(i, _)| i).collect();
    let others: Vec<String> = results.iter().map(tag).filter(|t| t != "committed").collect();
    run.check(
        "16 concurrent replaceIfContent calls from the WebView: exactly one wins, the rest are staleExpected",
        committed.len() == 1 && others.iter().all(|t| t == "notCommitted:staleExpected") && read(&note) == format!("writer-{}", committed[0]),
        format!("winners {committed:?}, others {:?}", others.iter().collect::<std::collections::BTreeSet<_>>()),
    );

    let target = root.join("create-race.md");
    let make = |i: usize| ("atomic_write_file", json!({ "request": { "vaultRoot": root, "path": target, "contents": format!("creator-{i}"), "intent": { "kind": "create" } } }));
    let results = run.bridge.batch("main", (0..12).map(make).collect());
    let committed = results.iter().filter(|r| tag(r) == "committed").count();
    run.check("12 concurrent creates of one path: exactly one wins, the rest destinationExists", committed == 1 && results.iter().filter(|r| tag(r) == "notCommitted:destinationExists").count() == 11, results.iter().map(tag).collect::<Vec<_>>().join(","));

    // Readers must only ever see whole files while unconditional replaces race.
    let hot = root.join("hot.md");
    fs::write(&hot, "A".repeat(200_000)).unwrap();
    let stop = Arc::new(AtomicBool::new(false));
    let torn = Arc::new(Mutex::new(Vec::<String>::new()));
    let reader = {
        let (stop, torn, hot) = (stop.clone(), torn.clone(), hot.clone());
        std::thread::spawn(move || {
            let mut reads = 0u64;
            while !stop.load(Ordering::SeqCst) {
                if let Ok(bytes) = fs::read(&hot) {
                    reads += 1;
                    let first = bytes.first().copied();
                    if bytes.len() != 200_000 || bytes.iter().any(|b| Some(*b) != first) {
                        torn.lock().unwrap().push(format!("len {} first {:?}", bytes.len(), first));
                    }
                }
            }
            reads
        })
    };
    let letters: Vec<char> = "BCDEFGHIJKLMNOPQRSTUVWXYZ".chars().collect();
    let make = |i: usize| ("atomic_write_file", json!({ "request": { "vaultRoot": root, "path": hot, "contents": letters[i % letters.len()].to_string().repeat(200_000), "intent": { "kind": "replace" } } }));
    let results = run.bridge.batch("main", (0..24).map(make).collect());
    stop.store(true, Ordering::SeqCst);
    let reads = reader.join().unwrap();
    let statuses: std::collections::BTreeSet<String> = results.iter().map(tag).collect();
    let torn = torn.lock().unwrap().clone();
    run.check("24 racing replaces with a concurrent reader: the reader never sees a torn or short file", torn.is_empty(), format!("{reads} reads, torn: {torn:?}"));
    run.check("racing replaces: every call is committed or a typed retryable refusal, none uncertain", results.iter().all(|r| tag(r) == "committed" || tag(r).starts_with("notCommitted")), format!("{statuses:?}"));
    let final_content = read(&hot);
    run.check("racing replaces: the file ends whole and uniform, no temporary left", final_content.len() == 200_000 && final_content.chars().all(|c| Some(c) == final_content.chars().next()) && temps_in(&root).is_empty(), format!("{:?}", temps_in(&root)));

    let make = |i: usize| ("atomic_write_file", json!({ "request": { "vaultRoot": root, "path": root.join(format!("many-{i}.md")), "contents": format!("n{i}"), "intent": { "kind": "create" } } }));
    let results = run.bridge.batch("main", (0..40).map(make).collect());
    run.check("40 concurrent creates of distinct files all commit", results.iter().all(|r| tag(r) == "committed") && (0..40).all(|i| read(&root.join(format!("many-{i}.md"))) == format!("n{i}")), "");
}

fn another_window(run: &mut Run, app: &tauri::AppHandle) {
    // A window that no capability names. The fs plugin denies it; so must the atomic commands (they check their
    // caller: only the `main` window may call them).
    let root = run.vault("intruder");
    let note = root.join("note.md");
    let build = WebviewWindowBuilder::new(app, "intruder", WebviewUrl::App("index.html".into())).title("not in any capability").build();
    if build.is_err() {
        run.check("second window for the capability check", false, format!("{build:?}"));
        return;
    }
    std::thread::sleep(Duration::from_millis(800));
    let plugin = run.bridge.call("intruder", "plugin:fs|exists", json!({ "path": root }));
    let args = |contents: &str| json!({ "request": { "vaultRoot": root, "path": note, "contents": contents, "intent": { "kind": "create" } } });
    let write = run.bridge.call("intruder", "atomic_write_file", args("from an unauthorised window"));
    let inspect = run.bridge.call("intruder", "atomic_inspect_write", json!({ "request": { "vaultRoot": root, "path": note, "attempted": "x", "previous": null, "tempPaths": [] } }));
    let confirm = run.bridge.call("intruder", "atomic_confirm_durability", json!({ "request": { "vaultRoot": root, "path": note, "expected": "x" } }));
    run.note(format!("unauthorised window: fs plugin {} / write {} / inspect {} / confirm {}", tag(&plugin), tag(&write), tag(&inspect), tag(&confirm)));
    run.check("the fs plugin denies a window that no capability names", plugin.is_err(), tag(&plugin));
    let denied = |r: &Result<Value, Value>| r.as_ref().err().map(|e| e["code"] == "unauthorizedWindow").unwrap_or(false);
    run.check("atomic_write_file is denied for a window with no permission, even inside a granted vault", denied(&write) && !note.exists(), tag(&write));
    run.check("atomic_inspect_write is denied for that window", denied(&inspect), tag(&inspect));
    run.check("atomic_confirm_durability is denied for that window", denied(&confirm), tag(&confirm));
    // The authorised window can still do all three on the same vault.
    let allowed = run.create(&root, &note, "from the authorised window");
    run.check("the authorised `main` window can still write to that vault", tag(&allowed) == "committed" && read(&note) == "from the authorised window", tag(&allowed));
    if let Some(window) = app.get_webview_window("intruder") {
        let _ = window.destroy();
    }
}

/// Crash-loop mode (`VF_HAMMER=<directory>`): replace one large file again and again through the real WebView and IPC,
/// each generation a different uniform byte, until a parent process kills this one with SIGKILL (see
/// `crash-loop.sh`). Never returns; whatever the kill interrupts, the file must afterwards be one whole generation.
fn hammer(app: tauri::AppHandle, bridge: Arc<Bridge>, directory: PathBuf) {
    let root = directory.clone();
    fs::create_dir_all(root.join(".clutter")).unwrap();
    app.fs_scope().allow_directory(&root, true).unwrap();
    let note = root.join("note.md");
    for generation in 0u64.. {
        let contents = char::from(b'A' + (generation % 26) as u8).to_string().repeat(1_000_000);
        let intent = if note.exists() { json!({ "kind": "replace" }) } else { json!({ "kind": "create" }) };
        let _ = bridge.call(
            "main",
            "atomic_write_file",
            json!({ "request": { "vaultRoot": root, "path": note, "contents": contents, "intent": intent } }),
        );
    }
}

fn run_all(app: tauri::AppHandle, bridge: Arc<Bridge>) {
    if let Ok(directory) = std::env::var("VF_HAMMER") {
        return hammer(app, bridge, PathBuf::from(directory));
    }
    let home = std::env::var("HOME").unwrap();
    let base = fs::canonicalize(&home).unwrap().join(format!("clutter-native-verify-{}", std::process::id()));
    fs::create_dir_all(&base).unwrap();
    let mut run = Run { app: app.clone(), bridge, base: base.clone(), checks: vec![], notes: vec![] };

    type Scenario = fn(&mut Run);
    let scenarios: Vec<(&str, Scenario)> = vec![
        ("scope sources", scope_sources),
        ("operations", operations),
        ("metadata", metadata_preservation),
        ("filesystem failures", failures_on_the_real_filesystem),
        ("scope and forgery", scope_and_forgery),
        ("real IPC concurrency", real_ipc_concurrency),
        ("disk full", disk_full),
        ("volumes", unsupported_and_supported_volumes),
    ];
    for (name, scenario) in scenarios {
        println!("== {name}");
        if std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| scenario(&mut run))).is_err() {
            run.check(&format!("scenario `{name}` ran to completion"), false, "panicked");
        }
    }
    println!("== another window");
    another_window(&mut run, &app);

    let passed = run.checks.iter().filter(|c| c["pass"] == true).count();
    let failed: Vec<&Value> = run.checks.iter().filter(|c| c["pass"] != true).collect();
    println!("\n{passed} passed, {} failed", failed.len());
    for check in &failed {
        println!("  FAILED: {} [{}]", check["name"], check["detail"]);
    }
    let report = json!({ "passed": passed, "failed": failed.len(), "checks": run.checks, "notes": run.notes });
    let out = std::env::var("VF_OUT").unwrap_or_else(|_| format!("{home}/clutter-native-verify-report.json"));
    fs::write(&out, serde_json::to_string_pretty(&report).unwrap()).unwrap();
    // Make sure nothing is left mounted or locked before removing the fixtures.
    if let Ok(entries) = fs::read_dir(&base) {
        for entry in entries.flatten() {
            if entry.file_name().to_string_lossy().starts_with("mnt-") {
                unmount(&entry.path());
            }
        }
    }
    let _ = Command::new("chflags").args(["-R", "nouchg", base.to_str().unwrap()]).status();
    let _ = Command::new("chmod").args(["-R", "u+rwx", base.to_str().unwrap()]).status();
    let _ = fs::remove_dir_all(&base);
    app.exit(if failed.is_empty() { 0 } else { 1 });
}

fn main() {
    let bridge = Arc::new(Bridge::default());
    let for_thread = bridge.clone();
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .manage(bridge)
        .invoke_handler(tauri::generate_handler![
            vf_poll,
            vf_reply,
            atomic_commands::atomic_write_file,
            atomic_commands::atomic_inspect_write,
            atomic_commands::atomic_confirm_durability,
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            let bridge = for_thread.clone();
            std::thread::spawn(move || run_all(handle, bridge));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("the verify app runs");
}
