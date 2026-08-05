use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

use notify::event::ModifyKind;
use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

// The window within which the "old path vanished" half of a rename must be
// followed by a "new path appeared" half for the two to be paired into a
// single `moved` event. Notify's macOS (FSEvents) backend does not provide a
// rename correlation ID (`event.attrs.tracker()` is always `None` here), so
// the two halves must be paired by disk-existence and timing instead of by a
// shared cookie. This is the minimal mechanism required to detect renames at
// all — it is not a general debounce/suppression layer.
const RENAME_CORRELATION_WINDOW: Duration = Duration::from_millis(300);

#[derive(Serialize, Clone)]
#[serde(tag = "type")]
pub enum VaultFileChange {
    #[serde(rename = "created")]
    Created {
        path: String,
        // ADR-024: resolved once here (std::fs::metadata) rather than
        // probed on the TS side per event — lets VaultSyncService dispatch
        // a directory straight to folder handling.
        #[serde(rename = "isDirectory")]
        is_directory: bool,
    },
    #[serde(rename = "changed")]
    Changed { path: String },
    #[serde(rename = "deleted")]
    Deleted { path: String },
    #[serde(rename = "moved")]
    Moved {
        #[serde(rename = "fromPath")]
        from_path: String,
        #[serde(rename = "toPath")]
        to_path: String,
    },
}

/// Pure classification of a raw notify `EventKind` into what the watcher
/// should do about it, decoupled from AppHandle/threads so it can be unit
/// tested directly against plain `EventKind` values.
#[derive(Debug, PartialEq, Eq)]
enum EventClassification {
    /// Emit a single `VaultFileChange` of this type immediately.
    Direct(&'static str),
    /// Route through rename pairing (`RenamePairing`) instead of emitting
    /// directly, since a rename's two halves must be correlated first.
    Rename,
    /// Metadata-only changes and reads carry no content/identity change
    /// relevant to Clutter and are dropped.
    Ignored,
}

fn classify_event_kind(kind: &EventKind) -> EventClassification {
    match kind {
        EventKind::Create(_) => EventClassification::Direct("created"),
        EventKind::Remove(_) => EventClassification::Direct("deleted"),
        EventKind::Modify(ModifyKind::Name(_)) => EventClassification::Rename,
        EventKind::Modify(ModifyKind::Metadata(_)) => EventClassification::Ignored,
        EventKind::Access(_) => EventClassification::Ignored,
        _ => EventClassification::Direct("changed"),
    }
}

/// Outcome of feeding one half of a rename into `RenamePairing`.
#[derive(Debug, PartialEq, Eq, Clone)]
enum RenameDecision {
    /// Both halves paired: the file was renamed/moved within the watched root.
    Moved { from: PathBuf, to: PathBuf },
    /// The "to" half arrived with no pending "from" half: moved in from
    /// outside the watched root.
    Created { path: PathBuf },
    /// A "from" half's correlation window elapsed unpaired: moved out to
    /// outside the watched root.
    Deleted { path: PathBuf },
    /// A "from" half was recorded; waiting to see if a "to" half pairs with
    /// it before the correlation window elapses.
    Pending,
}

/// A "from" half waiting to be paired, guarded by a token so a late timeout
/// for a since-replaced registration at the same path can be told apart from
/// the current one.
struct PendingRename {
    token: u64,
}

/// Pure pairing logic for the two halves of a rename.
///
/// Deliberately has no knowledge of AppHandle, real threads, or real time —
/// callers are responsible for actually waiting out the correlation window
/// and calling `on_timeout`. This separation is what makes the pairing
/// decision itself unit-testable without a real filesystem or a real sleep.
///
/// Rename pairing is best effort: notify's backend on this platform provides
/// no correlation cookie linking a rename's two halves (confirmed empirically
/// — `event.attrs.tracker()` is always `None` here), so halves are paired by
/// disk-existence and arrival order only. `pending` is a map, not a single
/// slot, specifically so multiple rename-outs in flight at once (e.g. moving
/// several files out of the watched root in quick succession) are each
/// tracked independently instead of a newer "from" silently erasing an
/// older, still-unresolved one. When a "to" half arrives while more than one
/// "from" is pending, there is no data available to determine which "from"
/// it actually belongs to — one is chosen arbitrarily. This is a known,
/// accepted limitation of pairing without a correlation cookie, not a bug to
/// fix here.
#[derive(Default)]
struct RenamePairing {
    pending: HashMap<PathBuf, PendingRename>,
    next_token: u64,
}

impl RenamePairing {
    /// Feeds one half of a possible rename: `path` is the path notify
    /// reported, `exists` is whether it currently exists on disk (the "to"
    /// half if true, the "from" half if false).
    ///
    /// Returns the registered path's token alongside `Pending` so the caller
    /// can schedule a timeout that later identifies itself with `on_timeout`.
    fn on_name_event(&mut self, path: PathBuf, exists: bool) -> (RenameDecision, Option<u64>) {
        if exists {
            // Best-effort pairing: any currently-pending "from" is treated as
            // a candidate match, since nothing distinguishes them without a
            // correlation cookie.
            let from = self.pending.keys().next().cloned();

            if let Some(from) = from {
                self.pending.remove(&from);
                (RenameDecision::Moved { from, to: path }, None)
            } else {
                (RenameDecision::Created { path }, None)
            }
        } else {
            let token = self.next_token;
            self.next_token += 1;
            self.pending.insert(path, PendingRename { token });
            (RenameDecision::Pending, Some(token))
        }
    }

    /// Called once the correlation window has elapsed for a given "from"
    /// path/token pair. Returns `Some(Deleted)` only if that exact path is
    /// still pending under that exact token — i.e. nothing paired with it,
    /// and no newer registration at the same path has replaced it, in the
    /// meantime. Returns `None` for a stale timeout.
    fn on_timeout(&mut self, path: &Path, token: u64) -> Option<RenameDecision> {
        match self.pending.get(path) {
            Some(pending) if pending.token == token => {
                self.pending.remove(path);
                Some(RenameDecision::Deleted {
                    path: path.to_path_buf(),
                })
            }
            _ => None,
        }
    }
}

type PendingRenameSlot = Arc<Mutex<RenamePairing>>;

pub struct VaultWatcherState {
    pub watcher: Mutex<Option<RecommendedWatcher>>,
    pub root_path: Mutex<Option<PathBuf>>,
}

impl Default for VaultWatcherState {
    fn default() -> Self {
        Self {
            watcher: Mutex::new(None),
            root_path: Mutex::new(None),
        }
    }
}

#[tauri::command]
pub fn start_vault_watcher(
    app: AppHandle,
    path: String,
    state: State<'_, VaultWatcherState>,
) -> Result<(), String> {
    let mut watcher_guard = state
        .watcher
        .lock()
        .map_err(|_| "Failed to lock watcher state".to_string())?;

    *watcher_guard = None;

    let root_path = PathBuf::from(&path);

    let mut root_guard = state
        .root_path
        .lock()
        .map_err(|_| "Failed to lock root path state".to_string())?;

    *root_guard = Some(root_path.clone());
    drop(root_guard);

    let app_handle = app.clone();
    let root_path_for_event = root_path.clone();
    let pending_rename: PendingRenameSlot = Arc::new(Mutex::new(RenamePairing::default()));

    let mut watcher = RecommendedWatcher::new(
        move |result: notify::Result<notify::Event>| {
            let event = match result {
                Ok(event) => event,
                Err(_) => return,
            };

            match classify_event_kind(&event.kind) {
                EventClassification::Direct(change_type) => {
                    for path in event.paths {
                        emit_change(&app_handle, &root_path_for_event, &path, change_type);
                    }
                }
                EventClassification::Rename => {
                    for path in event.paths {
                        handle_name_event(
                            path,
                            &root_path_for_event,
                            &app_handle,
                            &pending_rename,
                        );
                    }
                }
                EventClassification::Ignored => {}
            }
        },
        Config::default(),
    )
    .map_err(|error| error.to_string())?;

    watcher
        .watch(std::path::Path::new(&path), RecursiveMode::Recursive)
        .map_err(|error| error.to_string())?;

    *watcher_guard = Some(watcher);

    Ok(())
}

#[tauri::command]
pub fn stop_vault_watcher(state: State<'_, VaultWatcherState>) -> Result<(), String> {
    let mut watcher_guard = state
        .watcher
        .lock()
        .map_err(|_| "Failed to lock watcher state".to_string())?;

    *watcher_guard = None;

    Ok(())
}

/// Drives one half of a rename through `RenamePairing`, then performs the
/// actual side effects (emitting immediately, or spawning the correlation
/// window's timeout thread) that the pure pairing logic can't do itself.
fn handle_name_event(
    path: PathBuf,
    root_path: &Path,
    app_handle: &AppHandle,
    pending: &PendingRenameSlot,
) {
    let exists = path.exists();

    let (decision, token) = {
        let mut pairing = match pending.lock() {
            Ok(guard) => guard,
            Err(_) => return,
        };
        pairing.on_name_event(path.clone(), exists)
    };

    match decision {
        RenameDecision::Moved { from, to } => {
            emit_moved(app_handle, root_path, &from, &to);
        }
        RenameDecision::Created { path } => {
            emit_change(app_handle, root_path, &path, "created");
        }
        RenameDecision::Deleted { .. } => {
            // on_name_event never returns Deleted directly (only on_timeout
            // does); unreachable in practice.
        }
        RenameDecision::Pending => {
            let Some(token) = token else { return };
            let pending = Arc::clone(pending);
            let app_handle = app_handle.clone();
            let root_path = root_path.to_path_buf();
            let timeout_path = path.clone();

            thread::spawn(move || {
                thread::sleep(RENAME_CORRELATION_WINDOW);

                let decision = {
                    let mut pairing = match pending.lock() {
                        Ok(guard) => guard,
                        Err(_) => return,
                    };
                    pairing.on_timeout(&timeout_path, token)
                };

                if let Some(RenameDecision::Deleted { path }) = decision {
                    emit_change(&app_handle, &root_path, &path, "deleted");
                }
            });
        }
    }
}

fn relative_path(root_path: &Path, path: &Path) -> Option<String> {
    path.strip_prefix(root_path)
        .ok()
        .map(|relative| relative.to_string_lossy().to_string())
}

fn emit_change(app_handle: &AppHandle, root_path: &Path, path: &Path, change_type: &str) {
    // Resolved before the move into relative_path below — "created" is the
    // only case that needs it (ADR-024); a deleted path may no longer
    // exist to stat, and "changed" never applies to a directory in this
    // watcher's own classification (see classify_event_kind).
    let is_directory = change_type == "created" && path.is_dir();

    let Some(path) = relative_path(root_path, path) else {
        return;
    };

    let change = match change_type {
        "created" => VaultFileChange::Created { path, is_directory },
        "deleted" => VaultFileChange::Deleted { path },
        _ => VaultFileChange::Changed { path },
    };

    let _ = app_handle.emit("vault:file-change", change);
}

fn emit_moved(app_handle: &AppHandle, root_path: &Path, from_path: &Path, to_path: &Path) {
    let (Some(from_path), Some(to_path)) = (
        relative_path(root_path, from_path),
        relative_path(root_path, to_path),
    ) else {
        return;
    };

    let _ = app_handle.emit(
        "vault:file-change",
        VaultFileChange::Moved { from_path, to_path },
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{AccessKind, AccessMode, CreateKind, MetadataKind, RemoveKind};

    #[test]
    fn classifies_create_as_direct_created() {
        assert_eq!(
            classify_event_kind(&EventKind::Create(CreateKind::File)),
            EventClassification::Direct("created")
        );
    }

    #[test]
    fn classifies_remove_as_direct_deleted() {
        assert_eq!(
            classify_event_kind(&EventKind::Remove(RemoveKind::File)),
            EventClassification::Direct("deleted")
        );
    }

    #[test]
    fn classifies_name_modify_as_rename() {
        assert_eq!(
            classify_event_kind(&EventKind::Modify(ModifyKind::Name(
                notify::event::RenameMode::Any
            ))),
            EventClassification::Rename
        );
    }

    #[test]
    fn classifies_metadata_modify_as_ignored() {
        assert_eq!(
            classify_event_kind(&EventKind::Modify(ModifyKind::Metadata(MetadataKind::Any))),
            EventClassification::Ignored
        );
    }

    #[test]
    fn classifies_access_as_ignored() {
        assert_eq!(
            classify_event_kind(&EventKind::Access(AccessKind::Open(AccessMode::Any))),
            EventClassification::Ignored
        );
    }

    #[test]
    fn classifies_unrecognized_kind_as_direct_changed() {
        assert_eq!(
            classify_event_kind(&EventKind::Any),
            EventClassification::Direct("changed")
        );
    }

    #[test]
    fn rename_in_from_outside_the_vault_is_created() {
        // Only a "to" half arrives (the file appeared); nothing was pending.
        let mut pairing = RenamePairing::default();

        let (decision, token) = pairing.on_name_event(PathBuf::from("/vault/new.md"), true);

        assert_eq!(
            decision,
            RenameDecision::Created {
                path: PathBuf::from("/vault/new.md")
            }
        );
        assert_eq!(token, None);
    }

    #[test]
    fn rename_out_of_the_vault_is_deleted_after_the_correlation_window() {
        // Only a "from" half arrives (the file vanished) and nothing pairs
        // with it before the correlation window elapses.
        let mut pairing = RenamePairing::default();

        let (immediate, token) = pairing.on_name_event(PathBuf::from("/vault/old.md"), false);
        assert_eq!(immediate, RenameDecision::Pending);
        let token = token.expect("a pending registration always returns a token");

        let timeout_decision = pairing.on_timeout(&PathBuf::from("/vault/old.md"), token);

        assert_eq!(
            timeout_decision,
            Some(RenameDecision::Deleted {
                path: PathBuf::from("/vault/old.md")
            })
        );
    }

    #[test]
    fn rename_inside_the_vault_pairs_into_moved() {
        let mut pairing = RenamePairing::default();

        let (from_decision, _) = pairing.on_name_event(PathBuf::from("/vault/old/path.md"), false);
        assert_eq!(from_decision, RenameDecision::Pending);

        let (to_decision, _) = pairing.on_name_event(PathBuf::from("/vault/new/path.md"), true);

        assert_eq!(
            to_decision,
            RenameDecision::Moved {
                from: PathBuf::from("/vault/old/path.md"),
                to: PathBuf::from("/vault/new/path.md"),
            }
        );
    }

    #[test]
    fn a_stale_timeout_after_pairing_already_happened_is_ignored() {
        let mut pairing = RenamePairing::default();

        let (_, token) = pairing.on_name_event(PathBuf::from("/vault/old/path.md"), false);
        let token = token.expect("a pending registration always returns a token");
        pairing.on_name_event(PathBuf::from("/vault/new/path.md"), true);

        // The correlation window's timeout for the already-paired "from"
        // half fires late; it must not re-emit a spurious deleted event.
        let timeout_decision = pairing.on_timeout(&PathBuf::from("/vault/old/path.md"), token);

        assert_eq!(timeout_decision, None);
    }

    #[test]
    fn two_simultaneous_rename_outs_are_both_tracked_and_both_resolve() {
        // Two files are renamed out of the watched root in quick succession,
        // before either "to" half (if any) arrives. With a single pending
        // slot, the second registration would have silently erased the
        // first. With the map, both are tracked independently.
        let mut pairing = RenamePairing::default();

        let (a_decision, a_token) = pairing.on_name_event(PathBuf::from("/vault/a.md"), false);
        let (b_decision, b_token) = pairing.on_name_event(PathBuf::from("/vault/b.md"), false);

        assert_eq!(a_decision, RenameDecision::Pending);
        assert_eq!(b_decision, RenameDecision::Pending);
        assert_eq!(pairing.pending.len(), 2);

        // A single "to" half arrives; it pairs with whichever "from" is
        // available (best effort — no cookie distinguishes them), but it
        // must consume exactly one of the two, not both and not neither.
        let (to_decision, _) = pairing.on_name_event(PathBuf::from("/vault/incoming.md"), true);
        let paired_from = match to_decision {
            RenameDecision::Moved { from, to } => {
                assert_eq!(to, PathBuf::from("/vault/incoming.md"));
                from
            }
            other => panic!("expected a Moved decision, got {other:?}"),
        };
        assert!(paired_from == PathBuf::from("/vault/a.md") || paired_from == PathBuf::from("/vault/b.md"));
        assert_eq!(pairing.pending.len(), 1);

        // The remaining unpaired "from" times out independently and is not
        // silently dropped — no event disappears.
        let (remaining_path, remaining_token) = if paired_from == PathBuf::from("/vault/a.md") {
            (PathBuf::from("/vault/b.md"), b_token)
        } else {
            (PathBuf::from("/vault/a.md"), a_token)
        };
        let remaining_token = remaining_token.expect("a pending registration always returns a token");

        let timeout_decision = pairing.on_timeout(&remaining_path, remaining_token);

        assert_eq!(
            timeout_decision,
            Some(RenameDecision::Deleted {
                path: remaining_path
            })
        );
        assert_eq!(pairing.pending.len(), 0);
    }

    #[test]
    fn multiple_unpaired_rename_outs_each_time_out_independently() {
        // Neither of two concurrently-pending "from" halves ever pairs; both
        // must still resolve to their own Deleted decision when their
        // correlation window elapses, proving one path's timeout doesn't
        // consume or block the other's.
        let mut pairing = RenamePairing::default();

        let (_, a_token) = pairing.on_name_event(PathBuf::from("/vault/a.md"), false);
        let (_, b_token) = pairing.on_name_event(PathBuf::from("/vault/b.md"), false);
        let a_token = a_token.expect("a pending registration always returns a token");
        let b_token = b_token.expect("a pending registration always returns a token");

        let a_timeout = pairing.on_timeout(&PathBuf::from("/vault/a.md"), a_token);
        let b_timeout = pairing.on_timeout(&PathBuf::from("/vault/b.md"), b_token);

        assert_eq!(
            a_timeout,
            Some(RenameDecision::Deleted {
                path: PathBuf::from("/vault/a.md")
            })
        );
        assert_eq!(
            b_timeout,
            Some(RenameDecision::Deleted {
                path: PathBuf::from("/vault/b.md")
            })
        );
        assert_eq!(pairing.pending.len(), 0);
    }

    #[test]
    fn a_stale_token_timeout_does_not_consume_a_newer_registration_at_the_same_path() {
        // The same path becomes a "from" half twice (e.g. renamed out, then
        // something else is renamed to occupy that same path and immediately
        // renamed out again) before the first registration's timeout fires.
        let mut pairing = RenamePairing::default();

        let (_, stale_token) = pairing.on_name_event(PathBuf::from("/vault/reused.md"), false);
        let stale_token = stale_token.expect("a pending registration always returns a token");

        let (_, current_token) = pairing.on_name_event(PathBuf::from("/vault/reused.md"), false);
        let current_token = current_token.expect("a pending registration always returns a token");
        assert_ne!(stale_token, current_token);

        // The first registration's timeout fires late, carrying the old
        // token. It must not consume the newer registration.
        let stale_timeout = pairing.on_timeout(&PathBuf::from("/vault/reused.md"), stale_token);
        assert_eq!(stale_timeout, None);
        assert_eq!(pairing.pending.len(), 1);

        // The current registration's own timeout still works correctly.
        let current_timeout = pairing.on_timeout(&PathBuf::from("/vault/reused.md"), current_token);
        assert_eq!(
            current_timeout,
            Some(RenameDecision::Deleted {
                path: PathBuf::from("/vault/reused.md")
            })
        );
    }
}
