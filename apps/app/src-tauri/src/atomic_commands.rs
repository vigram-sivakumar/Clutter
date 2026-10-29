//! Tauri commands for the experimental atomic writer (ADR-063, Stage 2a).
//!
//! **Registered, but nothing in the application calls them.** The production writer is still the fs plugin's
//! `writeTextFile`; no save goes through these commands. They exist so the Rust ↔ Tauri ↔ TypeScript boundary, and
//! its scope enforcement, can be exercised before anything depends on it.
//!
//! # Trust boundary
//!
//! The backend keeps no registry of open vaults (the Space registry lives in the webview), so a vault root sent by
//! the frontend is **not** authorization and is never treated as such. Authorization is the approved filesystem
//! scope: Tauri's *runtime* fs scope (`app.fs_scope()`), which holds only what is granted while the app runs: the
//! folders the user picked in the native dialog, restored at launch by the persisted-scope plugin (JS cannot grant
//! itself access, see `lib.rs`). It does **not** hold the static `$HOME/**` of `capabilities/default.json`, which is
//! the fs plugin's own command scope: a folder reachable only through that (a Space made by `createSpaceFolder`,
//! never picked) is refused here as `outOfScope`, as it is by `move_file_no_clobber` and `rename_space_folder`
//! (tested in the real app, ADR-063 Stage 2b-ii). The commands also refuse any caller but the `main` window. Every command applies the same rules, in this
//! order, and refuses the whole request on the first failure:
//!
//! 1. the vault root must be absolute, exist, be a directory, and be inside the approved scope (so a forged root
//!    such as `/` or another user's folder is refused);
//! 2. the root must contain a real `.clutter` directory (a vault that has been opened by Clutter): this catches a
//!    wrong or forged root *inside* the scope, it is an integrity check and not an additional authority: anything
//!    that can write inside the scope can create a `.clutter` folder;
//! 3. the target must be an absolute path inside the approved scope (the same test the plugin applies);
//! 4. the target's canonical parent directory must lie inside the canonical vault root (done by the writer, with
//!    symlinks resolved once): `..` and a symlinked folder that points elsewhere are refused.
//!
//! The root therefore only ever **narrows** what the scope already allows. A root broader than the real vault (the
//! home directory, say, if it contains a `.clutter` folder) is inside the scope anyway, so these commands never give
//! the webview more than the plugin already does. Closing that gap needs a backend-held list of the vaults the user
//! opened; that does not exist yet and is reported, not invented (ADR-063, Stage 2a).
//!
//! The supported-filesystem list is never a request field: a caller cannot widen it, and unknown request fields are
//! rejected.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime, Webview};
use tauri_plugin_fs::FsExt;

use crate::atomic_replace::{
    confirm_durability, inspect, replace, DurabilityGap, DurabilityOutcome, DurabilityRequest,
    Durability, InspectRequest, Inspection, Intent, MetadataNote, NotCommittedReason, ReplaceOutcome,
    ReplaceRequest, Replaced, TargetState, TempState, SUPPORTED_FILESYSTEMS,
};

// ---------------------------------------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------------------------------------

/// What the caller means by a write (ADR-063, decision 11). Sent explicitly; never inferred.
#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum IntentArg {
    Create,
    Replace,
    ReplaceIfContent { expected: String },
    Upsert,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WriteRequest {
    pub vault_root: String,
    pub path: String,
    pub contents: String,
    pub intent: IntentArg,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConfirmRequest {
    pub vault_root: String,
    pub path: String,
    /// The content whose durability is being confirmed; it identifies the revision.
    pub expected: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InspectArgs {
    pub vault_root: String,
    pub path: String,
    pub attempted: String,
    pub previous: Option<String>,
    #[serde(default)]
    pub temp_paths: Vec<String>,
}

/// A request refused before anything was touched.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AtomicCommandError {
    /// `invalidVaultRoot`, `invalidPath`, `outOfScope` or `unauthorizedWindow`.
    pub code: &'static str,
    pub detail: String,
}

/// The windows allowed to call these commands. Clutter has one window, labelled `main` (tauri.conf.json).
///
/// Tauri does not gate application commands by window: anything registered through `invoke_handler` is callable from
/// every window and webview unless the app opts into the permission system for *all* of its commands (a real-app
/// test showed that listing only these three in the app manifest makes every other command, `frontend_ready`
/// included, require a grant). So the commands check their caller themselves. Remote content is already refused
/// for application commands by Tauri unless a `remote` capability exists, and there is none.
pub(crate) const AUTHORIZED_WINDOWS: &[&str] = &["main"];

pub(crate) fn require_authorized_caller(webview_label: &str) -> Result<(), AtomicCommandError> {
    if AUTHORIZED_WINDOWS.contains(&webview_label) {
        Ok(())
    } else {
        Err(refuse(
            "unauthorizedWindow",
            format!("the `{webview_label}` webview may not call the atomic write commands"),
        ))
    }
}

fn refuse(code: &'static str, detail: impl Into<String>) -> AtomicCommandError {
    AtomicCommandError {
        code,
        detail: detail.into(),
    }
}

#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum GapDto {
    FileFsyncOnly,
    DirectoryFsyncOnly,
    DirectorySyncFailed { detail: String },
    FileSyncFailed { detail: String },
}

#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum DurabilityDto {
    Confirmed,
    Unconfirmed { gaps: Vec<GapDto> },
}

#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum WriteResultDto {
    /// The new content is installed and visible. `durability` says how far the flush requests got.
    Committed {
        replaced: &'static str,
        durability: DurabilityDto,
        confirmed_by_inspection: bool,
        metadata_notes: Vec<&'static str>,
        leftovers: Vec<String>,
    },
    /// The original is intact.
    NotCommitted {
        reason: &'static str,
        detail: String,
        leftovers: Vec<String>,
    },
    /// The replacement's effect could not be proven. `recovery_paths` may hold the only copy of a revision.
    Uncertain {
        detail: String,
        recovery_paths: Vec<String>,
    },
}

#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum ConfirmResultDto {
    Confirmed,
    Unconfirmed { gaps: Vec<GapDto> },
    Superseded,
    Missing,
    Refused { reason: &'static str, detail: String },
    Failed { detail: String },
}

#[derive(Debug, Serialize)]
#[serde(tag = "state", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum TempStateDto {
    Absent,
    HoldsAttempted,
    HoldsOther,
    Unreadable { detail: String },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TempReportDto {
    pub path: String,
    #[serde(flatten)]
    pub state: TempStateDto,
}

#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum InspectResultDto {
    Inspected {
        target: &'static str,
        temps: Vec<TempReportDto>,
    },
    Refused { reason: &'static str, detail: String },
    Failed { detail: String },
}

// ---------------------------------------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------------------------------------

fn reason_code(reason: &NotCommittedReason) -> &'static str {
    match reason {
        NotCommittedReason::ReadOnlyTarget => "readOnlyTarget",
        NotCommittedReason::UnsupportedSymlink => "unsupportedSymlink",
        NotCommittedReason::NotARegularFile => "notARegularFile",
        NotCommittedReason::InvalidTarget => "invalidTarget",
        NotCommittedReason::OutOfScope => "outOfScope",
        NotCommittedReason::InsufficientSpace => "insufficientSpace",
        NotCommittedReason::PermissionDenied => "permissionDenied",
        NotCommittedReason::UnsupportedOperation => "unsupportedOperation",
        NotCommittedReason::StaleExpected => "staleExpected",
        NotCommittedReason::TargetChanged => "targetChanged",
        NotCommittedReason::UnsupportedFilesystem => "unsupportedFilesystem",
        NotCommittedReason::MetadataPreservationFailed => "metadataPreservationFailed",
        NotCommittedReason::DestinationExists => "destinationExists",
        NotCommittedReason::DestinationAppeared => "destinationAppeared",
        NotCommittedReason::TargetMissing => "targetMissing",
        NotCommittedReason::Io => "io",
    }
}

fn gap_dto(gap: &DurabilityGap) -> GapDto {
    match gap {
        DurabilityGap::FileFsyncOnly => GapDto::FileFsyncOnly,
        DurabilityGap::DirectoryFsyncOnly => GapDto::DirectoryFsyncOnly,
        DurabilityGap::DirectorySyncFailed(detail) => GapDto::DirectorySyncFailed {
            detail: detail.clone(),
        },
        DurabilityGap::FileSyncFailed(detail) => GapDto::FileSyncFailed {
            detail: detail.clone(),
        },
    }
}

fn paths(paths: &[PathBuf]) -> Vec<String> {
    paths.iter().map(|path| path.display().to_string()).collect()
}

fn write_result(outcome: ReplaceOutcome) -> WriteResultDto {
    match outcome {
        ReplaceOutcome::Committed {
            replaced,
            durability,
            confirmed_by_inspection,
            metadata_notes,
            leftovers,
        } => WriteResultDto::Committed {
            replaced: match replaced {
                Replaced::Existing => "existing",
                Replaced::Created => "created",
            },
            durability: match durability {
                Durability::Confirmed => DurabilityDto::Confirmed,
                Durability::Unconfirmed(gaps) => DurabilityDto::Unconfirmed {
                    gaps: gaps.iter().map(gap_dto).collect(),
                },
            },
            confirmed_by_inspection,
            metadata_notes: metadata_notes
                .iter()
                .map(|note| match note {
                    MetadataNote::BirthTimeSubsecondPrecisionLost => "birthTimeSubsecondPrecisionLost",
                })
                .collect(),
            leftovers: paths(&leftovers),
        },
        ReplaceOutcome::NotCommitted {
            reason,
            detail,
            leftovers,
        } => WriteResultDto::NotCommitted {
            reason: reason_code(&reason),
            detail,
            leftovers: paths(&leftovers),
        },
        ReplaceOutcome::Uncertain {
            detail,
            recovery_paths,
        } => WriteResultDto::Uncertain {
            detail,
            recovery_paths: paths(&recovery_paths),
        },
    }
}

fn confirm_result(outcome: DurabilityOutcome) -> ConfirmResultDto {
    match outcome {
        DurabilityOutcome::Confirmed => ConfirmResultDto::Confirmed,
        DurabilityOutcome::Unconfirmed(gaps) => ConfirmResultDto::Unconfirmed {
            gaps: gaps.iter().map(gap_dto).collect(),
        },
        DurabilityOutcome::Superseded => ConfirmResultDto::Superseded,
        DurabilityOutcome::Missing => ConfirmResultDto::Missing,
        DurabilityOutcome::Refused { reason, detail } => ConfirmResultDto::Refused {
            reason: reason_code(&reason),
            detail,
        },
        DurabilityOutcome::Failed { detail } => ConfirmResultDto::Failed { detail },
    }
}

fn inspect_result(outcome: Inspection) -> InspectResultDto {
    match outcome {
        Inspection::Inspected { target, temps } => InspectResultDto::Inspected {
            target: match target {
                TargetState::HoldsAttempted => "holdsAttempted",
                TargetState::HoldsPrevious => "holdsPrevious",
                TargetState::Missing => "missing",
                TargetState::HoldsOther => "holdsOther",
            },
            temps: temps
                .into_iter()
                .map(|report| TempReportDto {
                    path: report.path.display().to_string(),
                    state: match report.state {
                        TempState::Absent => TempStateDto::Absent,
                        TempState::HoldsAttempted => TempStateDto::HoldsAttempted,
                        TempState::HoldsOther => TempStateDto::HoldsOther,
                        TempState::Unreadable(detail) => TempStateDto::Unreadable { detail },
                    },
                })
                .collect(),
        },
        Inspection::Refused { reason, detail } => InspectResultDto::Refused {
            reason: reason_code(&reason),
            detail,
        },
        Inspection::Failed { detail } => InspectResultDto::Failed { detail },
    }
}

// ---------------------------------------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------------------------------------

/// Applies rules 1 to 3 of the module documentation and returns the canonical vault root. Rule 4 (the canonical
/// parent lies inside that root) is enforced by the writer through `scope_root`, for every command alike.
pub(crate) fn authorize(
    scope_allows: &dyn Fn(&Path) -> bool,
    vault_root: &str,
    target: &str,
) -> Result<PathBuf, AtomicCommandError> {
    if vault_root.is_empty() || !Path::new(vault_root).is_absolute() {
        return Err(refuse(
            "invalidVaultRoot",
            "the vault root must be an absolute path",
        ));
    }
    let root = std::fs::canonicalize(vault_root)
        .map_err(|error| refuse("invalidVaultRoot", format!("the vault root cannot be resolved: {error}")))?;
    if !root.is_dir() {
        return Err(refuse("invalidVaultRoot", "the vault root is not a directory"));
    }
    if !scope_allows(&root) {
        return Err(refuse(
            "outOfScope",
            "the vault root is not inside the approved filesystem scope",
        ));
    }
    let marker = root.join(".clutter");
    match std::fs::symlink_metadata(&marker) {
        Ok(metadata) if metadata.is_dir() => {}
        _ => {
            return Err(refuse(
                "invalidVaultRoot",
                "the vault root has no `.clutter` directory: it is not a vault Clutter has opened",
            ))
        }
    }
    if target.is_empty() || !Path::new(target).is_absolute() {
        return Err(refuse("invalidPath", "the target must be an absolute path"));
    }
    if !scope_allows(Path::new(target)) {
        return Err(refuse(
            "outOfScope",
            "the target is not inside the approved filesystem scope",
        ));
    }

    Ok(root)
}

// ---------------------------------------------------------------------------------------------------------
// Operations (blocking; the commands run them off the main thread)
// ---------------------------------------------------------------------------------------------------------

pub(crate) fn write_blocking(
    scope_allows: &dyn Fn(&Path) -> bool,
    request: &WriteRequest,
) -> Result<WriteResultDto, AtomicCommandError> {
    let root = authorize(scope_allows, &request.vault_root, &request.path)?;
    let intent = match &request.intent {
        IntentArg::Create => Intent::Create,
        IntentArg::Replace => Intent::Replace,
        IntentArg::ReplaceIfContent { expected } => Intent::ReplaceIfContent(expected.as_bytes()),
        IntentArg::Upsert => Intent::Upsert,
    };
    let outcome = replace(&ReplaceRequest {
        path: Path::new(&request.path),
        contents: request.contents.as_bytes(),
        intent,
        scope_root: Some(&root),
        supported_filesystems: SUPPORTED_FILESYSTEMS,
    });

    Ok(write_result(outcome))
}

pub(crate) fn confirm_blocking(
    scope_allows: &dyn Fn(&Path) -> bool,
    request: &ConfirmRequest,
) -> Result<ConfirmResultDto, AtomicCommandError> {
    let root = authorize(scope_allows, &request.vault_root, &request.path)?;
    let outcome = confirm_durability(&DurabilityRequest {
        scope_root: Some(&root),
        ..DurabilityRequest::new(Path::new(&request.path), request.expected.as_bytes())
    });

    Ok(confirm_result(outcome))
}

pub(crate) fn inspect_blocking(
    scope_allows: &dyn Fn(&Path) -> bool,
    request: &InspectArgs,
) -> Result<InspectResultDto, AtomicCommandError> {
    let root = authorize(scope_allows, &request.vault_root, &request.path)?;
    let temp_paths: Vec<PathBuf> = request.temp_paths.iter().map(PathBuf::from).collect();
    // The listed temporary files get the same treatment as the target: absolute and inside the scope (the writer
    // additionally accepts only its own temporary files in the target's directory).
    for temp in &temp_paths {
        if !temp.is_absolute() || !scope_allows(temp) {
            return Err(refuse(
                "outOfScope",
                "a listed temporary file is not inside the approved filesystem scope",
            ));
        }
    }
    let outcome = inspect(&InspectRequest {
        temp_paths: &temp_paths,
        scope_root: Some(&root),
        ..InspectRequest::new(
            Path::new(&request.path),
            request.attempted.as_bytes(),
            request.previous.as_deref().map(str::as_bytes),
        )
    });

    Ok(inspect_result(outcome))
}

// ---------------------------------------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------------------------------------

fn internal(error: impl std::fmt::Display) -> AtomicCommandError {
    refuse("invalidPath", format!("the operation did not run: {error}"))
}

/// Replaces, creates or conditionally replaces one file, atomically, with an explicit intent. Experimental: no
/// caller yet.
#[tauri::command]
pub async fn atomic_write_file<R: Runtime>(
    app: AppHandle<R>,
    webview: Webview<R>,
    request: WriteRequest,
) -> Result<WriteResultDto, AtomicCommandError> {
    require_authorized_caller(webview.label())?;
    let scope = app.fs_scope();
    tauri::async_runtime::spawn_blocking(move || write_blocking(&|path| scope.is_allowed(path), &request))
        .await
        .map_err(internal)?
}

/// Reports whether an uncertain write took effect. Read-only. Experimental: no caller yet.
#[tauri::command]
pub async fn atomic_inspect_write<R: Runtime>(
    app: AppHandle<R>,
    webview: Webview<R>,
    request: InspectArgs,
) -> Result<InspectResultDto, AtomicCommandError> {
    require_authorized_caller(webview.label())?;
    let scope = app.fs_scope();
    tauri::async_runtime::spawn_blocking(move || inspect_blocking(&|path| scope.is_allowed(path), &request))
        .await
        .map_err(internal)?
}

/// Flushes an installed file and its directory without rewriting it. Experimental: no caller yet.
#[tauri::command]
pub async fn atomic_confirm_durability<R: Runtime>(
    app: AppHandle<R>,
    webview: Webview<R>,
    request: ConfirmRequest,
) -> Result<ConfirmResultDto, AtomicCommandError> {
    require_authorized_caller(webview.label())?;
    let scope = app.fs_scope();
    tauri::async_runtime::spawn_blocking(move || confirm_blocking(&|path| scope.is_allowed(path), &request))
        .await
        .map_err(internal)?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::os::unix::fs::symlink;
    use std::time::{SystemTime, UNIX_EPOCH};

    use serde_json::{json, Value};
    use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, INVOKE_KEY};
    use tauri::webview::InvokeRequest;
    use tauri::ipc::{CallbackFn, InvokeBody};

    /// A throwaway world: an approved vault (with `.clutter`), an approved folder that is not a vault, and a folder
    /// outside every approved scope (including a secret file).
    struct World {
        base: PathBuf,
        vault: PathBuf,
        plain: PathBuf,
        outside: PathBuf,
    }

    impl World {
        fn new(label: &str) -> Self {
            let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
            let base = fs::canonicalize(std::env::temp_dir()).unwrap().join(format!(
                "clutter-atomic-commands-{label}-{}-{nanos}",
                std::process::id()
            ));
            let (vault, plain, outside) = (base.join("vault"), base.join("plain"), base.join("outside"));
            fs::create_dir_all(vault.join(".clutter")).unwrap();
            fs::create_dir_all(&plain).unwrap();
            fs::create_dir_all(&outside).unwrap();
            fs::write(outside.join("secret.md"), b"outside secret").unwrap();
            Self { base, vault, plain, outside }
        }

        /// The approved scope: the vault and the plain folder, nothing else.
        fn allows(&self) -> impl Fn(&Path) -> bool + '_ {
            move |path: &Path| {
                let path = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
                path.starts_with(&self.vault) || path.starts_with(&self.plain)
            }
        }
    }

    impl Drop for World {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.base);
        }
    }

    fn write_request(root: &Path, path: &Path, contents: &str, intent: IntentArg) -> WriteRequest {
        WriteRequest {
            vault_root: root.display().to_string(),
            path: path.display().to_string(),
            contents: contents.to_string(),
            intent,
        }
    }

    fn code(result: Result<impl std::fmt::Debug, AtomicCommandError>) -> &'static str {
        result.expect_err("the request must be refused").code
    }

    // ---- scope, at the operation level (the closure is the approved scope) --------------------------------

    #[test]
    fn a_write_inside_the_approved_vault_is_committed() {
        let world = World::new("valid");
        let note = world.vault.join("note.md");

        let result = write_blocking(&world.allows(), &write_request(&world.vault, &note, "hello", IntentArg::Create)).unwrap();

        assert!(matches!(result, WriteResultDto::Committed { .. }), "{result:?}");
        assert_eq!(fs::read_to_string(&note).unwrap(), "hello");
    }

    #[test]
    fn a_forged_vault_root_is_refused_and_nothing_is_written() {
        let world = World::new("forged");
        let target = world.outside.join("planted.md");
        let attempts: Vec<(&str, PathBuf)> = vec![
            ("filesystem root", PathBuf::from("/")),
            ("a folder outside the approved scope", world.outside.clone()),
            ("an approved folder that is not a vault", world.plain.clone()),
            ("a root that does not exist", world.base.join("missing")),
        ];
        for (label, root) in attempts {
            for path in [&target, &world.vault.join("note.md"), &world.plain.join("note.md")] {
                let outcome = write_blocking(&world.allows(), &write_request(&root, path, "x", IntentArg::Upsert));
                let error = outcome.expect_err(label);
                assert!(
                    ["outOfScope", "invalidVaultRoot"].contains(&error.code),
                    "{label}: {error:?}"
                );
            }
        }
        assert!(!target.exists());
        assert!(!world.vault.join("note.md").exists() && !world.plain.join("note.md").exists());
    }

    #[test]
    fn a_forged_root_with_a_vault_marker_is_still_refused_when_it_is_not_itself_approved() {
        let world = World::new("forged-marked");
        // A parent folder of the approved vault that looks like a vault but is not in the approved scope. The target is
        // inside the approved scope AND inside this root, so only the root's own scope check can refuse it.
        fs::create_dir_all(world.base.join(".clutter")).unwrap();
        let note = world.vault.join("note.md");

        let outcome = write_blocking(&world.allows(), &write_request(&world.base, &note, "x", IntentArg::Create));

        assert_eq!(code(outcome), "outOfScope");
        assert!(!note.exists());
    }

    #[test]
    fn missing_or_invalid_vault_root_information_is_refused() {
        let world = World::new("invalid-root");
        let note = world.vault.join("note.md");
        for root in ["", "relative/vault", "~/vault", "vault"] {
            let request = WriteRequest {
                vault_root: root.to_string(),
                ..write_request(&world.vault, &note, "x", IntentArg::Create)
            };
            assert_eq!(code(write_blocking(&world.allows(), &request)), "invalidVaultRoot", "{root:?}");
        }
        // A file, not a directory.
        let file_root = world.vault.join("file.md");
        fs::write(&file_root, b"x").unwrap();
        assert_eq!(
            code(write_blocking(&world.allows(), &write_request(&file_root, &note, "x", IntentArg::Create))),
            "invalidVaultRoot"
        );
        // A relative target.
        let request = WriteRequest {
            path: "note.md".into(),
            ..write_request(&world.vault, &note, "x", IntentArg::Create)
        };
        assert_eq!(code(write_blocking(&world.allows(), &request)), "invalidPath");
        assert!(!note.exists());
    }

    #[test]
    fn a_target_outside_the_approved_vault_is_refused_by_scope_or_by_containment() {
        let world = World::new("outside");
        // Outside every approved scope.
        let secret = world.outside.join("secret.md");
        assert_eq!(
            code(write_blocking(&world.allows(), &write_request(&world.vault, &secret, "overwritten", IntentArg::Replace))),
            "outOfScope"
        );
        assert_eq!(fs::read_to_string(&secret).unwrap(), "outside secret");
        // Inside the approved scope but not inside THIS vault: the root contains the target, or the write is refused.
        let sibling = world.plain.join("sibling.md");
        let outcome = write_blocking(&world.allows(), &write_request(&world.vault, &sibling, "x", IntentArg::Create)).unwrap();
        assert!(
            matches!(outcome, WriteResultDto::NotCommitted { reason: "outOfScope", .. }),
            "{outcome:?}"
        );
        assert!(!sibling.exists());
        // `..` out of the vault.
        let dotdot = world.vault.join("..").join("outside").join("secret.md");
        let outcome = write_blocking(&world.allows(), &write_request(&world.vault, &dotdot, "x", IntentArg::Replace));
        match outcome {
            Err(error) => assert_eq!(error.code, "outOfScope"),
            Ok(result) => assert!(matches!(result, WriteResultDto::NotCommitted { reason: "outOfScope", .. }), "{result:?}"),
        }
        assert_eq!(fs::read_to_string(&secret).unwrap(), "outside secret");
    }

    #[test]
    fn a_symlinked_parent_that_resolves_outside_the_vault_is_refused() {
        let world = World::new("symlink");
        let link = world.vault.join("escape");
        symlink(&world.outside, &link).unwrap();
        // The scope that string-matches the path as written accepts it (the path starts with the vault)...
        let broad = |_: &Path| true;
        let target = link.join("planted.md");

        let created = write_blocking(&broad, &write_request(&world.vault, &target, "x", IntentArg::Create)).unwrap();
        let replaced = write_blocking(&broad, &write_request(&world.vault, &link.join("secret.md"), "overwritten", IntentArg::Replace)).unwrap();

        // ...but the writer resolves the parent and checks containment in the canonical vault root.
        for result in [&created, &replaced] {
            assert!(
                matches!(result, WriteResultDto::NotCommitted { reason: "outOfScope", .. }),
                "{result:?}"
            );
        }
        assert!(!world.outside.join("planted.md").exists());
        assert_eq!(fs::read_to_string(world.outside.join("secret.md")).unwrap(), "outside secret");
    }

    #[test]
    fn inspecting_an_out_of_scope_target_is_refused() {
        let world = World::new("inspect-scope");
        let args = |root: &Path, path: &Path, temps: Vec<String>| InspectArgs {
            vault_root: root.display().to_string(),
            path: path.display().to_string(),
            attempted: "x".into(),
            previous: Some("y".into()),
            temp_paths: temps,
        };
        let secret = world.outside.join("secret.md");

        assert_eq!(code(inspect_blocking(&world.allows(), &args(&world.vault, &secret, vec![]))), "outOfScope");
        assert_eq!(code(inspect_blocking(&world.allows(), &args(&world.outside, &secret, vec![]))), "outOfScope");
        assert_eq!(code(inspect_blocking(&world.allows(), &args(Path::new("/"), &secret, vec![]))), "outOfScope");
        // A listed temporary file outside the scope is refused too: inspection cannot be used to read arbitrary files.
        let inside = world.vault.join("note.md");
        fs::write(&inside, b"y").unwrap();
        assert_eq!(
            code(inspect_blocking(&world.allows(), &args(&world.vault, &inside, vec![secret.display().to_string()]))),
            "outOfScope"
        );
        // A symlinked parent.
        symlink(&world.outside, world.vault.join("escape")).unwrap();
        let broad = |_: &Path| true;
        let result = inspect_blocking(&broad, &args(&world.vault, &world.vault.join("escape").join("secret.md"), vec![])).unwrap();
        assert!(matches!(result, InspectResultDto::Refused { reason: "outOfScope", .. }), "{result:?}");
        // And a valid inspection still works.
        let ok = inspect_blocking(&world.allows(), &args(&world.vault, &inside, vec![])).unwrap();
        assert!(matches!(ok, InspectResultDto::Inspected { target: "holdsPrevious", .. }), "{ok:?}");
    }

    #[test]
    fn confirming_durability_of_an_out_of_scope_target_is_refused() {
        let world = World::new("confirm-scope");
        let request = |root: &Path, path: &Path| ConfirmRequest {
            vault_root: root.display().to_string(),
            path: path.display().to_string(),
            expected: "outside secret".into(),
        };
        let secret = world.outside.join("secret.md");

        assert_eq!(code(confirm_blocking(&world.allows(), &request(&world.vault, &secret))), "outOfScope");
        assert_eq!(code(confirm_blocking(&world.allows(), &request(&world.outside, &secret))), "outOfScope");
        symlink(&world.outside, world.vault.join("escape")).unwrap();
        let broad = |_: &Path| true;
        let result = confirm_blocking(&broad, &request(&world.vault, &world.vault.join("escape").join("secret.md"))).unwrap();
        assert!(matches!(result, ConfirmResultDto::Refused { reason: "outOfScope", .. }), "{result:?}");
        // A valid confirmation works and flushes without rewriting.
        let note = world.vault.join("note.md");
        fs::write(&note, b"revision N").unwrap();
        let ok = confirm_blocking(&world.allows(), &ConfirmRequest { expected: "revision N".into(), ..request(&world.vault, &note) }).unwrap();
        assert!(matches!(ok, ConfirmResultDto::Confirmed), "{ok:?}");
    }

    #[test]
    fn unsupported_filesystems_are_refused_and_the_request_cannot_widen_the_list() {
        // The list is not a request field: an attempt to send one is a deserialisation error, not a widened policy.
        let forged = json!({
            "vaultRoot": "/", "path": "/x.md", "contents": "x",
            "intent": { "kind": "create" }, "supportedFilesystems": ["hfs", "exfat"]
        });
        assert!(serde_json::from_value::<WriteRequest>(forged).is_err());
        assert!(serde_json::from_value::<WriteRequest>(json!({
            "vaultRoot": "/", "path": "/x.md", "contents": "x", "intent": { "kind": "truncate" }
        }))
        .is_err());
        assert_eq!(SUPPORTED_FILESYSTEMS, &["apfs"]);
    }


    mod erased {
        pub trait Serialize {
            fn to_value(&self) -> serde_json::Value;
        }
        impl<T: serde::Serialize> Serialize for T {
            fn to_value(&self) -> serde_json::Value {
                serde_json::to_value(self).unwrap()
            }
        }
    }

    // ---- the wire format, held to the same text as the TypeScript contract ------------------------------

    /// `src/core/vault/atomicWrite/NativeAtomicVaultWriter.test.ts` parses these exact documents.
    #[test]
    fn wire_format_of_write_results_matches_the_typescript_contract() {
        let confirmed = WriteResultDto::Committed {
            replaced: "existing",
            durability: DurabilityDto::Confirmed,
            confirmed_by_inspection: false,
            metadata_notes: vec![],
            leftovers: vec![],
        };
        assert_eq!(
            serde_json::to_value(&confirmed).unwrap(),
            json!({ "status": "committed", "replaced": "existing", "durability": { "status": "confirmed" },
                    "confirmedByInspection": false, "metadataNotes": [], "leftovers": [] })
        );
        let unconfirmed = WriteResultDto::Committed {
            replaced: "created",
            durability: DurabilityDto::Unconfirmed {
                gaps: vec![
                    GapDto::FileFsyncOnly,
                    GapDto::DirectoryFsyncOnly,
                    GapDto::DirectorySyncFailed { detail: "EIO".into() },
                    GapDto::FileSyncFailed { detail: "EIO".into() },
                ],
            },
            confirmed_by_inspection: true,
            metadata_notes: vec!["birthTimeSubsecondPrecisionLost"],
            leftovers: vec!["/vault/.clutter-tmp.x".into()],
        };
        assert_eq!(
            serde_json::to_value(&unconfirmed).unwrap(),
            json!({ "status": "committed", "replaced": "created",
                    "durability": { "status": "unconfirmed", "gaps": [
                        { "status": "fileFsyncOnly" }, { "status": "directoryFsyncOnly" },
                        { "status": "directorySyncFailed", "detail": "EIO" }, { "status": "fileSyncFailed", "detail": "EIO" } ] },
                    "confirmedByInspection": true, "metadataNotes": ["birthTimeSubsecondPrecisionLost"],
                    "leftovers": ["/vault/.clutter-tmp.x"] })
        );
        assert_eq!(
            serde_json::to_value(WriteResultDto::NotCommitted { reason: "destinationExists", detail: "exists".into(), leftovers: vec![] }).unwrap(),
            json!({ "status": "notCommitted", "reason": "destinationExists", "detail": "exists", "leftovers": [] })
        );
        assert_eq!(
            serde_json::to_value(WriteResultDto::Uncertain { detail: "unknown".into(), recovery_paths: vec!["/vault/.clutter-tmp.y".into()] }).unwrap(),
            json!({ "status": "uncertain", "detail": "unknown", "recoveryPaths": ["/vault/.clutter-tmp.y"] })
        );
    }

    #[test]
    fn wire_format_of_durability_and_inspection_results_matches_the_typescript_contract() {
        let value = |dto: &dyn erased::Serialize| dto.to_value();
        assert_eq!(value(&ConfirmResultDto::Confirmed), json!({ "status": "confirmed" }));
        assert_eq!(
            value(&ConfirmResultDto::Unconfirmed { gaps: vec![GapDto::DirectorySyncFailed { detail: "EIO".into() }] }),
            json!({ "status": "unconfirmed", "gaps": [{ "status": "directorySyncFailed", "detail": "EIO" }] })
        );
        assert_eq!(value(&ConfirmResultDto::Superseded), json!({ "status": "superseded" }));
        assert_eq!(value(&ConfirmResultDto::Missing), json!({ "status": "missing" }));
        assert_eq!(
            value(&ConfirmResultDto::Refused { reason: "outOfScope", detail: "d".into() }),
            json!({ "status": "refused", "reason": "outOfScope", "detail": "d" })
        );
        assert_eq!(value(&ConfirmResultDto::Failed { detail: "d".into() }), json!({ "status": "failed", "detail": "d" }));
        assert_eq!(
            value(&InspectResultDto::Inspected {
                target: "holdsOther",
                temps: vec![
                    TempReportDto { path: "/a".into(), state: TempStateDto::Absent },
                    TempReportDto { path: "/b".into(), state: TempStateDto::HoldsAttempted },
                    TempReportDto { path: "/c".into(), state: TempStateDto::HoldsOther },
                    TempReportDto { path: "/d".into(), state: TempStateDto::Unreadable { detail: "EIO".into() } },
                ],
            }),
            json!({ "status": "inspected", "target": "holdsOther", "temps": [
                { "path": "/a", "state": "absent" }, { "path": "/b", "state": "holdsAttempted" },
                { "path": "/c", "state": "holdsOther" }, { "path": "/d", "state": "unreadable", "detail": "EIO" } ] })
        );
        assert_eq!(
            value(&InspectResultDto::Refused { reason: "unsupportedSymlink", detail: "d".into() }),
            json!({ "status": "refused", "reason": "unsupportedSymlink", "detail": "d" })
        );
        assert_eq!(value(&InspectResultDto::Failed { detail: "d".into() }), json!({ "status": "failed", "detail": "d" }));
    }

    /// Every reason code, in the order `NotCommittedReason` declares them, is the list the TypeScript contract accepts.
    #[test]
    fn every_reason_code_is_one_the_typescript_contract_accepts() {
        let typescript = [
            "readOnlyTarget", "unsupportedSymlink", "notARegularFile", "invalidTarget", "outOfScope", "insufficientSpace",
            "permissionDenied", "unsupportedOperation", "staleExpected", "targetChanged", "unsupportedFilesystem",
            "metadataPreservationFailed", "destinationExists", "destinationAppeared", "targetMissing", "io",
        ];
        let rust = [
            NotCommittedReason::ReadOnlyTarget, NotCommittedReason::UnsupportedSymlink, NotCommittedReason::NotARegularFile,
            NotCommittedReason::InvalidTarget, NotCommittedReason::OutOfScope, NotCommittedReason::InsufficientSpace,
            NotCommittedReason::PermissionDenied, NotCommittedReason::UnsupportedOperation, NotCommittedReason::StaleExpected,
            NotCommittedReason::TargetChanged, NotCommittedReason::UnsupportedFilesystem,
            NotCommittedReason::MetadataPreservationFailed, NotCommittedReason::DestinationExists,
            NotCommittedReason::DestinationAppeared, NotCommittedReason::TargetMissing, NotCommittedReason::Io,
        ];
        assert_eq!(rust.iter().map(reason_code).collect::<Vec<_>>(), typescript);
        // A new reason must be added to this list on purpose: the match in `reason_code` is exhaustive.
    }

    // ---- the actual Tauri command boundary (mock runtime, real IPC dispatch, real fs-plugin scope) ----------

    type MockApp = tauri::App<tauri::test::MockRuntime>;

    fn app_with_scope(allowed: &[&Path]) -> (MockApp, tauri::WebviewWindow<tauri::test::MockRuntime>) {
        let app = mock_builder()
            .plugin(tauri_plugin_fs::init())
            .invoke_handler(tauri::generate_handler![atomic_write_file, atomic_inspect_write, atomic_confirm_durability])
            .build(mock_context(noop_assets()))
            .expect("the mock app builds");
        for directory in allowed {
            app.fs_scope().allow_directory(directory, true).unwrap();
        }
        let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default()).build().unwrap();
        (app, window)
    }

    fn invoke(window: &tauri::WebviewWindow<tauri::test::MockRuntime>, command: &str, body: Value) -> Result<Value, Value> {
        get_ipc_response(
            window,
            InvokeRequest {
                cmd: command.into(),
                callback: CallbackFn(0),
                error: CallbackFn(1),
                url: "tauri://localhost".parse().unwrap(),
                body: InvokeBody::Json(body),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.to_string(),
            },
        )
        .map(|body| body.deserialize::<Value>().unwrap())
    }

    #[test]
    fn the_commands_are_registered_and_return_the_documented_json() {
        let world = World::new("ipc-valid");
        let (_app, window) = app_with_scope(&[&world.vault]);
        let note = world.vault.join("note.md");

        let created = invoke(&window, "atomic_write_file", json!({ "request": {
            "vaultRoot": world.vault, "path": note, "contents": "one", "intent": { "kind": "create" } } })).unwrap();
        assert_eq!(created["status"], "committed", "{created}");
        assert_eq!(created["replaced"], "created");
        assert!(created["durability"]["status"] == "confirmed" || created["durability"]["status"] == "unconfirmed");
        assert!(created["leftovers"].as_array().unwrap().is_empty());

        // A retried create is refused, with the typed reason and the other file untouched.
        let again = invoke(&window, "atomic_write_file", json!({ "request": {
            "vaultRoot": world.vault, "path": note, "contents": "two", "intent": { "kind": "create" } } })).unwrap();
        assert_eq!(again["status"], "notCommitted");
        assert_eq!(again["reason"], "destinationExists");
        assert_eq!(fs::read_to_string(&note).unwrap(), "one");

        let conditional = invoke(&window, "atomic_write_file", json!({ "request": {
            "vaultRoot": world.vault, "path": note, "contents": "three",
            "intent": { "kind": "replaceIfContent", "expected": "stale" } } })).unwrap();
        assert_eq!(conditional["reason"], "staleExpected");
        let missing = invoke(&window, "atomic_write_file", json!({ "request": {
            "vaultRoot": world.vault, "path": world.vault.join("gone.md"), "contents": "x", "intent": { "kind": "replace" } } })).unwrap();
        assert_eq!(missing["reason"], "targetMissing");

        let inspected = invoke(&window, "atomic_inspect_write", json!({ "request": {
            "vaultRoot": world.vault, "path": note, "attempted": "one", "previous": null, "tempPaths": [] } })).unwrap();
        assert_eq!(inspected["status"], "inspected");
        assert_eq!(inspected["target"], "holdsAttempted");

        let confirmed = invoke(&window, "atomic_confirm_durability", json!({ "request": {
            "vaultRoot": world.vault, "path": note, "expected": "one" } })).unwrap();
        assert_eq!(confirmed["status"], "confirmed", "{confirmed}");
        let superseded = invoke(&window, "atomic_confirm_durability", json!({ "request": {
            "vaultRoot": world.vault, "path": note, "expected": "older revision" } })).unwrap();
        assert_eq!(superseded["status"], "superseded");
        assert_eq!(fs::read_to_string(&note).unwrap(), "one");
    }

    #[test]
    fn through_the_real_command_boundary_forged_roots_and_escapes_are_rejected() {
        let world = World::new("ipc-attacks");
        let (_app, window) = app_with_scope(&[&world.vault]); // plain and outside are NOT approved
        let secret = world.outside.join("secret.md");
        symlink(&world.outside, world.vault.join("escape")).unwrap();
        let rejected = |value: Result<Value, Value>| -> String {
            match value {
                Err(error) => error["code"].as_str().unwrap_or("other").to_string(),
                Ok(result) => format!("{}:{}", result["status"], result["reason"]),
            }
        };

        let cases = [
            json!({ "vaultRoot": "/", "path": secret, "contents": "x", "intent": { "kind": "replace" } }),
            json!({ "vaultRoot": world.outside, "path": secret, "contents": "x", "intent": { "kind": "replace" } }),
            json!({ "vaultRoot": world.vault, "path": secret, "contents": "x", "intent": { "kind": "replace" } }),
            json!({ "vaultRoot": world.plain, "path": world.plain.join("n.md"), "contents": "x", "intent": { "kind": "create" } }),
            json!({ "vaultRoot": "", "path": world.vault.join("n.md"), "contents": "x", "intent": { "kind": "create" } }),
            json!({ "vaultRoot": world.vault.join("escape"), "path": world.vault.join("escape").join("secret.md"), "contents": "x", "intent": { "kind": "replace" } }),
            json!({ "vaultRoot": world.vault, "path": world.vault.join("escape").join("secret.md"), "contents": "x", "intent": { "kind": "replace" } }),
        ];
        for (index, request) in cases.into_iter().enumerate() {
            let outcome = rejected(invoke(&window, "atomic_write_file", json!({ "request": request })));
            assert!(
                outcome.contains("outOfScope") || outcome.contains("invalidVaultRoot"),
                "case {index} was not rejected: {outcome}"
            );
        }
        assert_eq!(fs::read_to_string(&secret).unwrap(), "outside secret");
        assert!(!world.plain.join("n.md").exists() && !world.vault.join("n.md").exists());

        // Inspection and durability confirmation apply the same rules.
        let inspected = invoke(&window, "atomic_inspect_write", json!({ "request": {
            "vaultRoot": world.vault, "path": secret, "attempted": "x", "previous": "outside secret", "tempPaths": [] } }));
        assert!(rejected(inspected).contains("outOfScope"));
        let confirmed = invoke(&window, "atomic_confirm_durability", json!({ "request": {
            "vaultRoot": world.vault, "path": secret, "expected": "outside secret" } }));
        assert!(rejected(confirmed).contains("outOfScope"));
        let escaped = invoke(&window, "atomic_confirm_durability", json!({ "request": {
            "vaultRoot": world.vault, "path": world.vault.join("escape").join("secret.md"), "expected": "outside secret" } }));
        assert!(rejected(escaped).contains("outOfScope"));

        // An unknown field (a forged filesystem list) is a request error, not an accepted widening.
        let widened = invoke(&window, "atomic_write_file", json!({ "request": {
            "vaultRoot": world.vault, "path": world.vault.join("n.md"), "contents": "x",
            "intent": { "kind": "create" }, "supportedFilesystems": ["exfat"] } }));
        assert!(widened.is_err());
        assert!(!world.vault.join("n.md").exists());
    }

    #[test]
    fn only_the_main_window_may_call_the_commands_even_for_a_granted_vault() {
        let world = World::new("ipc-caller");
        let (app, main) = app_with_scope(&[&world.vault]);
        let other = tauri::WebviewWindowBuilder::new(&app, "other", Default::default()).build().unwrap();
        let note = world.vault.join("note.md");
        let write = |window: &tauri::WebviewWindow<tauri::test::MockRuntime>, contents: &str| {
            invoke(window, "atomic_write_file", json!({ "request": {
                "vaultRoot": world.vault, "path": note, "contents": contents, "intent": { "kind": "upsert" } } }))
        };

        let denied = write(&other, "from another window").unwrap_err();
        assert_eq!(denied["code"], "unauthorizedWindow", "{denied}");
        assert!(!note.exists());
        let inspected = invoke(&other, "atomic_inspect_write", json!({ "request": {
            "vaultRoot": world.vault, "path": note, "attempted": "x", "previous": null, "tempPaths": [] } })).unwrap_err();
        assert_eq!(inspected["code"], "unauthorizedWindow");
        let confirmed = invoke(&other, "atomic_confirm_durability", json!({ "request": {
            "vaultRoot": world.vault, "path": note, "expected": "x" } })).unwrap_err();
        assert_eq!(confirmed["code"], "unauthorizedWindow");

        assert_eq!(write(&main, "from main").unwrap()["status"], "committed");
        assert_eq!(fs::read_to_string(&note).unwrap(), "from main");
    }

    #[test]
    fn an_unregistered_command_name_is_rejected_by_the_ipc_layer() {
        let world = World::new("ipc-unknown");
        let (_app, window) = app_with_scope(&[&world.vault]);
        assert!(invoke(&window, "atomic_truncate_file", json!({ "request": {} })).is_err());
    }
}
