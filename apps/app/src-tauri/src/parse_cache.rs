//! Storage for the parsed-note cache (ADR-053).
//!
//! The cache is derived data and completely disposable: Markdown files stay
//! authoritative, and every failure here degrades to "no cache". The webview
//! never names a path. It hands over a space root (used only to derive an
//! opaque id) and the cache text; filenames are built here from that id inside
//! `<app cache dir>/parse-cache/`, so these commands are not general-purpose
//! filesystem access.
//!
//! Guarantees: a write is a uniquely named, locked, synced temp file renamed
//! over the destination (atomic replace; readers see a complete old or new
//! file), and several instances can share a space (the last rename wins; the
//! cache is a pure memo, so any complete file is valid for any of them).
//! Retention is by last use: a read touches the file's modification time at
//! most once a day instead of rewriting it.

use std::fs::{self, File, OpenOptions, TryLockError};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

/// Provisional, defensive per-space limit on the serialized cache.
pub const MAX_CACHE_BYTES: u64 = 64 * 1024 * 1024;
/// A cache not used (read) for this long is removed (provisional).
const RETENTION: Duration = Duration::from_secs(90 * 24 * 60 * 60);
/// A read refreshes "last used" only if it is older than this.
const TOUCH_INTERVAL: Duration = Duration::from_secs(24 * 60 * 60);
/// Temp files younger than this are never considered for cleanup, which keeps
/// the window between a writer creating its temp file and locking it safe.
const TEMP_MIN_AGE: Duration = Duration::from_secs(60);

/// Opaque, stable per-space identifier: the first 32 hex characters of the
/// SHA-256 of the canonicalized root path. An identifier, not a security
/// boundary — anyone who can guess a path can compute it.
pub fn space_id(root_path: &str) -> String {
    let canonical = fs::canonicalize(root_path)
        .map(|path| path.to_string_lossy().into_owned())
        .unwrap_or_else(|_| root_path.to_string());
    let digest = Sha256::digest(canonical.as_bytes());
    digest
        .iter()
        .take(16)
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn cache_file(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{id}.json"))
}

fn is_hex_id(text: &str) -> bool {
    text.len() == 32 && text.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

/// `<id>.json` with a valid id.
fn is_cache_name(name: &str) -> bool {
    name.strip_suffix(".json").is_some_and(is_hex_id)
}

/// `<id>.json.<pid>.<counter>.<nanos>.tmp` with a valid id.
fn is_temp_name(name: &str) -> bool {
    let Some((id, rest)) = name
        .strip_suffix(".tmp")
        .and_then(|stem| stem.split_once(".json."))
    else {
        return false;
    };
    let numeric = |part: &str| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit());
    let parts: Vec<&str> = rest.split('.').collect();
    is_hex_id(id) && parts.len() == 3 && parts.iter().all(|part| numeric(part))
}

/// Distinguishes temp files created by this process. The pid separates live
/// processes, the nanoseconds separate a reused pid from a crashed run's
/// leftovers, and this counter makes names unique between threads of one
/// process — the clock alone is only microsecond-granular on macOS, so two
/// writers in the same instant used to be able to collide.
static TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);

/// A temp path no other writer, in this process or another, will also pick.
fn unique_temp_path(dir: &Path, id: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let sequence = TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    dir.join(format!(
        "{id}.json.{}.{sequence}.{nanos}.tmp",
        std::process::id()
    ))
}

#[derive(Debug, PartialEq, Eq)]
pub enum WriteOutcome {
    Written,
    SkippedOversize,
}

/// Reads the cache for `id`. `Ok(None)` when there is none. A file over `max`
/// bytes is an error (treated by the caller as "no cache"). A successful read
/// refreshes last-use if it is stale.
pub fn read_capped(dir: &Path, id: &str, max: u64) -> std::io::Result<Option<String>> {
    let path = cache_file(dir, id);
    let mut file = match File::open(&path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    let metadata = file.metadata()?;
    if !metadata.is_file() {
        return Err(std::io::Error::other("cache path is not a regular file"));
    }
    if metadata.len() > max {
        return Err(std::io::Error::other("cache file exceeds the size limit"));
    }
    let mut text = String::with_capacity(metadata.len() as usize);
    file.read_to_string(&mut text)?;
    touch_if_stale(&path, SystemTime::now(), TOUCH_INTERVAL);
    Ok(Some(text))
}

/// Marks the cache as used now, unless it was already used within `interval`.
/// One metadata write at most per interval; never rewrites the contents.
pub fn touch_if_stale(path: &Path, now: SystemTime, interval: Duration) {
    let Ok(modified) = fs::metadata(path).and_then(|m| m.modified()) else {
        return;
    };
    if now.duration_since(modified).is_ok_and(|age| age >= interval) {
        if let Ok(file) = OpenOptions::new().write(true).open(path) {
            let _ = file.set_modified(now);
        }
    }
}

/// Atomically replaces the cache for `id` with `bytes`. Over `max` bytes the
/// cache is not written and any existing file for the space is removed.
pub fn write_atomic(
    dir: &Path,
    id: &str,
    bytes: &[u8],
    max: u64,
) -> std::io::Result<WriteOutcome> {
    let destination = cache_file(dir, id);
    if bytes.len() as u64 > max {
        match fs::remove_file(&destination) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
        return Ok(WriteOutcome::SkippedOversize);
    }
    fs::create_dir_all(dir)?;

    let temp = unique_temp_path(dir, id);
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)?;

    let result = (|| -> std::io::Result<()> {
        // Held until this function returns: a cleaner can tell this temp file
        // belongs to a live writer even if the process is suspended.
        file.lock()?;
        file.write_all(bytes)?;
        file.sync_all()?;
        // Atomic replace, including when the destination already exists.
        fs::rename(&temp, &destination)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    drop(file);
    result?;

    // Best effort: make the rename itself durable.
    if let Ok(directory) = File::open(dir) {
        let _ = directory.sync_all();
    }
    Ok(WriteOutcome::Written)
}

pub fn remove_cache(dir: &Path, id: &str) -> std::io::Result<()> {
    match fs::remove_file(cache_file(dir, id)) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

/// Removes temp files left by writers that no longer exist. Age alone is not
/// treated as proof of death (a suspended app can sit idle for hours): a temp
/// file is removed only if it is old enough AND no process holds its lock.
/// Best effort. If this races with a live writer the writer's rename fails and
/// that one cache write is lost; nothing else is affected.
pub fn cleanup_stale_temps(dir: &Path, now: SystemTime, min_age: Duration) -> usize {
    let Ok(entries) = fs::read_dir(dir) else {
        return 0;
    };
    let mut removed = 0;
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        if !is_temp_name(name) {
            continue;
        }
        let path = entry.path();
        let Ok(metadata) = fs::symlink_metadata(&path) else {
            continue;
        };
        if !metadata.is_file() {
            continue;
        }
        let old_enough = metadata
            .modified()
            .ok()
            .and_then(|m| now.duration_since(m).ok())
            .is_some_and(|age| age >= min_age);
        if !old_enough {
            continue;
        }
        let Ok(file) = File::open(&path) else { continue };
        match file.try_lock() {
            Ok(()) => {
                if fs::remove_file(&path).is_ok() {
                    removed += 1;
                }
            }
            Err(TryLockError::WouldBlock) => {} // a live writer holds it
            Err(TryLockError::Error(_)) => {}
        }
    }
    removed
}

/// Removes other spaces' caches not used for `retention`. Touches only regular
/// files named exactly `<32 hex>.json` in `dir`; never follows symlinks, never
/// anything else, never the Markdown space. Best effort.
pub fn prune_unused(dir: &Path, keep_id: &str, now: SystemTime, retention: Duration) -> usize {
    let Ok(entries) = fs::read_dir(dir) else {
        return 0;
    };
    let keep = format!("{keep_id}.json");
    let mut removed = 0;
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        if !is_cache_name(name) || name == keep {
            continue;
        }
        let path = entry.path();
        let Ok(metadata) = fs::symlink_metadata(&path) else {
            continue;
        };
        if !metadata.is_file() {
            continue;
        }
        let unused = metadata
            .modified()
            .ok()
            .and_then(|m| now.duration_since(m).ok())
            .is_some_and(|age| age >= retention);
        if unused && fs::remove_file(&path).is_ok() {
            removed += 1;
        }
    }
    removed
}

fn cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_cache_dir()
        .map(|dir| dir.join("parse-cache"))
        .map_err(|error| error.to_string())
}

/// What a read reports: the space's opaque id (so the cache text can record
/// and later verify it), the text if there is a usable file, and a short
/// `problem` when there is a file that could not be used.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadResponse {
    space_id: String,
    contents: Option<String>,
    problem: Option<String>,
}

/// Reads the space's cache. Never fails because of the cache itself: an
/// oversize or unreadable file is reported as a `problem` and treated by the
/// caller as "no cache". Only an unavailable cache directory is an error.
#[tauri::command]
pub async fn parse_cache_read(app: AppHandle, root_path: String) -> Result<ReadResponse, String> {
    let dir = cache_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let id = space_id(&root_path);
        let (contents, problem) = match read_capped(&dir, &id, MAX_CACHE_BYTES) {
            Ok(contents) => (contents, None),
            Err(error) if error.to_string().contains("size limit") => {
                (None, Some("oversize".to_string()))
            }
            Err(_) => (None, Some("unreadable".to_string())),
        };
        // Housekeeping runs beside the read and never affects its result.
        let (housekeeping_dir, housekeeping_id) = (dir.clone(), id.clone());
        let _ = std::thread::Builder::new().spawn(move || {
            let now = SystemTime::now();
            cleanup_stale_temps(&housekeeping_dir, now, TEMP_MIN_AGE);
            prune_unused(&housekeeping_dir, &housekeeping_id, now, RETENTION);
        });
        ReadResponse {
            space_id: id,
            contents,
            problem,
        }
    })
    .await
    .map_err(|error| error.to_string())
}

/// Atomically replaces the space's cache. Returns `"written"` or
/// `"skipped-oversize"`.
#[tauri::command]
pub async fn parse_cache_write(
    app: AppHandle,
    root_path: String,
    contents: String,
) -> Result<String, String> {
    let dir = cache_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let id = space_id(&root_path);
        let outcome = write_atomic(&dir, &id, contents.as_bytes(), MAX_CACHE_BYTES)
            .map_err(|error| error.to_string())?;
        cleanup_stale_temps(&dir, SystemTime::now(), TEMP_MIN_AGE);
        Ok(match outcome {
            WriteOutcome::Written => "written".to_string(),
            WriteOutcome::SkippedOversize => "skipped-oversize".to_string(),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Deletes the space's cache. For a future space-removal feature; safe to call
/// at any time.
#[tauri::command]
pub async fn parse_cache_remove(app: AppHandle, root_path: String) -> Result<(), String> {
    let dir = cache_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        remove_cache(&dir, &space_id(&root_path)).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    static COUNTER: AtomicU32 = AtomicU32::new(0);
    const ID_A: &str = "0123456789abcdef0123456789abcdef";
    const ID_B: &str = "fedcba9876543210fedcba9876543210";

    fn temp_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "clutter-parse-cache-test-{}-{nanos}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::SeqCst)
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn age(path: &Path, by: Duration) {
        let file = OpenOptions::new().write(true).open(path).unwrap();
        file.set_modified(SystemTime::now() - by).unwrap();
    }

    #[test]
    fn space_id_is_32_hex_stable_and_hides_the_path() {
        let dir = temp_dir();
        let root = dir.to_string_lossy().to_string();
        let id = space_id(&root);
        assert!(is_hex_id(&id));
        assert_eq!(id, space_id(&root));
        assert!(!id.contains("clutter"));
        assert_ne!(id, space_id(&format!("{root}/other")));
        // a path that cannot be canonicalized still yields a valid id
        assert!(is_hex_id(&space_id("/definitely/not/a/real/path")));
    }

    #[test]
    fn space_id_follows_symlinks_and_trailing_components() {
        let dir = temp_dir();
        let real = dir.join("real");
        fs::create_dir_all(&real).unwrap();
        let link = dir.join("link");
        #[cfg(unix)]
        std::os::unix::fs::symlink(&real, &link).unwrap();
        assert_eq!(
            space_id(real.to_str().unwrap()),
            space_id(link.to_str().unwrap())
        );
        assert_eq!(
            space_id(real.to_str().unwrap()),
            space_id(&format!("{}/.", real.to_str().unwrap()))
        );
    }

    #[test]
    fn missing_cache_reads_as_none() {
        assert_eq!(read_capped(&temp_dir(), ID_A, 1024).unwrap(), None);
    }

    #[test]
    fn write_then_read_round_trips() {
        let dir = temp_dir();
        assert_eq!(
            write_atomic(&dir, ID_A, b"hello", 1024).unwrap(),
            WriteOutcome::Written
        );
        assert_eq!(read_capped(&dir, ID_A, 1024).unwrap().as_deref(), Some("hello"));
    }

    #[test]
    fn write_replaces_an_existing_destination_atomically() {
        let dir = temp_dir();
        write_atomic(&dir, ID_A, b"old contents", 1024).unwrap();
        write_atomic(&dir, ID_A, b"new", 1024).unwrap();
        assert_eq!(read_capped(&dir, ID_A, 1024).unwrap().as_deref(), Some("new"));
        let leftovers: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .filter(|e| is_temp_name(e.file_name().to_str().unwrap()))
            .collect();
        assert!(leftovers.is_empty(), "temp files must not remain");
    }

    #[test]
    fn interrupted_write_leaves_the_old_cache_intact() {
        // A crash before the rename leaves only a temp file; the destination
        // is whatever it was.
        let dir = temp_dir();
        write_atomic(&dir, ID_A, b"good", 1024).unwrap();
        fs::write(dir.join(format!("{ID_A}.json.4242.0.1.tmp")), b"torn half-wri").unwrap();
        assert_eq!(read_capped(&dir, ID_A, 1024).unwrap().as_deref(), Some("good"));
    }

    #[test]
    fn oversize_write_is_skipped_and_removes_the_stale_file() {
        let dir = temp_dir();
        write_atomic(&dir, ID_A, b"small", 10).unwrap();
        assert_eq!(
            write_atomic(&dir, ID_A, &[b'x'; 11], 10).unwrap(),
            WriteOutcome::SkippedOversize
        );
        assert_eq!(read_capped(&dir, ID_A, 10).unwrap(), None);
    }

    #[test]
    fn oversize_file_is_rejected_on_read() {
        let dir = temp_dir();
        fs::write(cache_file(&dir, ID_A), vec![b'x'; 100]).unwrap();
        assert!(read_capped(&dir, ID_A, 99).is_err());
        assert!(read_capped(&dir, ID_A, 100).is_ok());
    }

    #[test]
    fn temp_names_are_unique_across_threads_of_one_process() {
        // The collision this guards against: two threads in one process asking
        // for a temp path in the same clock tick. Hammer the helper from many
        // threads at once; every name must be distinct and recognizable.
        let dir = temp_dir();
        let threads = 8;
        let per_thread = 5_000;
        let handles: Vec<_> = (0..threads)
            .map(|_| {
                let dir = dir.clone();
                std::thread::spawn(move || {
                    (0..per_thread)
                        .map(|_| unique_temp_path(&dir, ID_A))
                        .collect::<Vec<_>>()
                })
            })
            .collect();
        let mut all = std::collections::HashSet::new();
        for handle in handles {
            for path in handle.join().unwrap() {
                assert!(is_temp_name(path.file_name().unwrap().to_str().unwrap()));
                assert!(all.insert(path), "two writers were handed the same temp path");
            }
        }
        assert_eq!(all.len(), threads * per_thread);
    }

    #[test]
    fn temp_names_differ_even_with_an_identical_clock_reading() {
        // Back-to-back calls from one thread already share nanosecond digits
        // on a coarse clock; only the sequence keeps them apart.
        let dir = temp_dir();
        let names: std::collections::HashSet<_> =
            (0..1000).map(|_| unique_temp_path(&dir, ID_A)).collect();
        assert_eq!(names.len(), 1000);
    }

    #[test]
    fn two_simultaneous_writers_never_expose_a_partial_file() {
        let dir = temp_dir();
        let payload_a = "A".repeat(2_000_000);
        let payload_b = "B".repeat(2_000_000);
        let reader_dir = dir.clone();
        let stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let reader_stop = stop.clone();
        let reader = std::thread::spawn(move || {
            let mut seen = 0;
            while !reader_stop.load(Ordering::SeqCst) {
                if let Ok(Some(text)) = read_capped(&reader_dir, ID_A, u64::MAX) {
                    assert!(
                        text.len() == 2_000_000
                            && (text.bytes().all(|b| b == b'A') || text.bytes().all(|b| b == b'B')),
                        "a reader observed a partial or mixed file"
                    );
                    seen += 1;
                }
            }
            seen
        });
        let writers: Vec<_> = [payload_a, payload_b]
            .into_iter()
            .map(|payload| {
                let dir = dir.clone();
                std::thread::spawn(move || {
                    for _ in 0..20 {
                        write_atomic(&dir, ID_A, payload.as_bytes(), u64::MAX).unwrap();
                    }
                })
            })
            .collect();
        for writer in writers {
            writer.join().unwrap();
        }
        stop.store(true, Ordering::SeqCst);
        assert!(reader.join().unwrap() > 0, "the reader never saw a file");
    }

    #[test]
    fn touch_refreshes_last_use_only_when_stale() {
        let dir = temp_dir();
        write_atomic(&dir, ID_A, b"x", 1024).unwrap();
        let path = cache_file(&dir, ID_A);
        // fresh: untouched
        let before = fs::metadata(&path).unwrap().modified().unwrap();
        touch_if_stale(&path, SystemTime::now(), Duration::from_secs(3600));
        assert_eq!(before, fs::metadata(&path).unwrap().modified().unwrap());
        // stale: refreshed, contents unchanged
        age(&path, Duration::from_secs(7200));
        let stale = fs::metadata(&path).unwrap().modified().unwrap();
        touch_if_stale(&path, SystemTime::now(), Duration::from_secs(3600));
        assert!(fs::metadata(&path).unwrap().modified().unwrap() > stale);
        assert_eq!(read_capped(&dir, ID_A, 1024).unwrap().as_deref(), Some("x"));
    }

    #[test]
    fn reading_an_old_cache_counts_as_use_so_it_survives_pruning() {
        let dir = temp_dir();
        write_atomic(&dir, ID_A, b"x", 1024).unwrap();
        write_atomic(&dir, ID_B, b"y", 1024).unwrap();
        let retention = Duration::from_secs(90 * 86400);
        age(&cache_file(&dir, ID_A), retention + Duration::from_secs(86400));
        age(&cache_file(&dir, ID_B), retention + Duration::from_secs(86400));
        // A is used (read) after being old; B is not.
        read_capped(&dir, ID_A, 1024).unwrap();
        let removed = prune_unused(&dir, "ffffffffffffffffffffffffffffffff", SystemTime::now(), retention);
        assert_eq!(removed, 1);
        assert!(cache_file(&dir, ID_A).exists(), "an actively used cache must survive");
        assert!(!cache_file(&dir, ID_B).exists());
    }

    #[test]
    fn prune_touches_only_matching_unused_regular_files() {
        let dir = temp_dir();
        let retention = Duration::from_secs(90 * 86400);
        let old = retention + Duration::from_secs(86400);
        // current space (old, but kept), another old cache, a recent cache
        write_atomic(&dir, ID_A, b"keep", 1024).unwrap();
        age(&cache_file(&dir, ID_A), old);
        write_atomic(&dir, ID_B, b"drop", 1024).unwrap();
        age(&cache_file(&dir, ID_B), old);
        let recent = "11111111111111111111111111111111";
        write_atomic(&dir, recent, b"recent", 1024).unwrap();
        // decoys: wrong names, a directory, a symlink to a "vault" file
        let note = temp_dir().join("note.md");
        fs::write(&note, "user content").unwrap();
        for decoy in ["notes.md", "readme.json", "0123.json", "ZZZZ56789abcdef0123456789abcdef00.json"] {
            fs::write(dir.join(decoy), "decoy").unwrap();
            age(&dir.join(decoy), old);
        }
        let dir_decoy = dir.join("22222222222222222222222222222222.json");
        fs::create_dir(&dir_decoy).unwrap();
        #[cfg(unix)]
        {
            let link = dir.join("33333333333333333333333333333333.json");
            std::os::unix::fs::symlink(&note, &link).unwrap();
        }
        let removed = prune_unused(&dir, ID_A, SystemTime::now(), retention);
        assert_eq!(removed, 1, "only the other old cache");
        assert!(cache_file(&dir, ID_A).exists());
        assert!(!cache_file(&dir, ID_B).exists());
        assert!(cache_file(&dir, recent).exists());
        assert!(dir_decoy.exists());
        assert!(dir.join("notes.md").exists() && dir.join("0123.json").exists());
        assert_eq!(fs::read_to_string(&note).unwrap(), "user content", "symlink target untouched");
        #[cfg(unix)]
        assert!(dir.join("33333333333333333333333333333333.json").exists());
    }

    #[test]
    fn temp_cleanup_keeps_fresh_and_locked_files_and_removes_abandoned_ones() {
        let dir = temp_dir();
        let min_age = Duration::from_secs(60);
        let day = Duration::from_secs(86400);
        // fresh temp: kept regardless of lock state
        let fresh = dir.join(format!("{ID_A}.json.1.0.1.tmp"));
        fs::write(&fresh, "fresh").unwrap();
        // old, abandoned (nobody holds a lock): removed
        let abandoned = dir.join(format!("{ID_A}.json.2.0.2.tmp"));
        fs::write(&abandoned, "dead writer").unwrap();
        age(&abandoned, day);
        // old but held by a live (e.g. suspended) writer: kept
        let held = dir.join(format!("{ID_A}.json.3.0.3.tmp"));
        fs::write(&held, "live writer").unwrap();
        let live = OpenOptions::new().write(true).open(&held).unwrap();
        live.lock().unwrap();
        age(&held, day);
        // not a temp name: kept
        let other = dir.join("notes.tmp");
        fs::write(&other, "x").unwrap();
        age(&other, day);

        assert_eq!(cleanup_stale_temps(&dir, SystemTime::now(), min_age), 1);
        assert!(fresh.exists());
        assert!(!abandoned.exists());
        assert!(held.exists(), "a live writer's temp must survive however old");
        assert!(other.exists());
        drop(live);
        assert_eq!(cleanup_stale_temps(&dir, SystemTime::now(), min_age), 1);
        assert!(!held.exists(), "once the writer is gone it is reclaimed");
    }

    #[test]
    fn temp_cleanup_never_touches_the_destination() {
        // Cleanup is best effort and may at worst cost a racing writer its own
        // write (its rename fails); it must never alter the destination file.
        let dir = temp_dir();
        write_atomic(&dir, ID_A, b"existing", 1024).unwrap();
        let temp = dir.join(format!("{ID_A}.json.9.0.9.tmp"));
        fs::write(&temp, "x").unwrap();
        age(&temp, Duration::from_secs(86400));
        cleanup_stale_temps(&dir, SystemTime::now(), Duration::from_secs(60));
        assert_eq!(read_capped(&dir, ID_A, 1024).unwrap().as_deref(), Some("existing"));
    }

    #[test]
    fn temp_and_cache_name_recognition_is_strict() {
        assert!(is_cache_name(&format!("{ID_A}.json")));
        assert!(!is_cache_name("short.json"));
        assert!(!is_cache_name(&format!("{ID_A}.json.tmp")));
        assert!(is_temp_name(&format!("{ID_A}.json.123.7.456.tmp")));
        assert!(!is_temp_name(&format!("{ID_A}.json.x.7.456.tmp")));
        assert!(!is_temp_name(&format!("{ID_A}.json.123.456.tmp")));
        assert!(!is_temp_name(&format!("{ID_A}.json.123.7.456.9.tmp")));
        assert!(!is_temp_name("notes.tmp"));
    }
}
