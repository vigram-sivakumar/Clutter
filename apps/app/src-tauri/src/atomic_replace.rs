//! Atomic replacement of one vault file (ADR-063, Stages 1 and 2 preparation).
//!
//! **Status: unwired.** This module is not declared in `lib.rs`, registers no Tauri command and is called by
//! nothing. It exists so the writer can be reviewed and tested on its own before anything depends on it. It is
//! macOS-only on purpose: every metadata and durability step below is a macOS primitive.
//!
//! # What it does
//!
//! `replace` writes `contents` to a hidden temporary file in the target's own directory, gives that file the
//! target's metadata, makes it durable, and then swaps it into place with a same-directory rename:
//!
//! 1. validate the target (symlink, kind, read-only, scope), check it against the request's [`Intent`] (a create
//!    never replaces, a replace never creates) and check the volume (APFS only, see "Volumes");
//! 2. create a unique, hidden, **fixed-length** temporary file (`.clutter-tmp.<pid>.<n>.<nanos>`, 47 bytes, never
//!    derived from the target's name, so a 255-byte note name cannot overflow it);
//! 3. write the complete new contents;
//! 4. existing file only: `fcopyfile(COPYFILE_METADATA)` (mode, owner, flags, ACLs, extended attributes), then
//!    `fsetattrlist(ATTR_CMN_CRTIME)` to restore the birth time, then set the modification time to "now" (the
//!    copy also copies the *old* modification time, which must not survive);
//! 5. existing file only: verify the temporary file really carries mode, owner, flags, birth time and every
//!    extended attribute of the original; anything missing refuses the write;
//! 6. flush the finished temporary file with `F_FULLFSYNC`. This is the **last** change made to the temporary
//!    file, so the barrier covers the data and every metadata change above;
//! 7. verify the target one last time (still the same file; and, for `ExpectedContent`, still holding the
//!    expected bytes), then replace the destination (see below);
//! 8. flush the parent directory;
//! 9. remove only what this operation created.
//!
//! # Intent
//!
//! [`Intent`] says what the caller means, and it is part of the request, never inferred from whether the file
//! happens to exist: `Create` (a new file; anything at the destination refuses it), `Replace` (an existing file; a
//! missing one is refused, never re-created), `ReplaceIfContent` (replace only while the file holds exactly the
//! expected bytes) and `Upsert` (replace or create; last writer wins; for application state files only). A retried
//! create is therefore still a create, and can never become permission to overwrite a file another process made in
//! the meantime. `ReplaceRequest::new` is an `Upsert`; callers that mean more use `create`, `replace`, `replace_if`.
//!
//! # Replacement primitives
//!
//! * **Existing file:** `rename(2)` over the target. Atomic visibility: a reader sees the old file or the new
//!   file, never a mixture.
//! * **New file:** `renamex_np(RENAME_EXCL)`. The kernel refuses if anything exists at the destination at the
//!   moment of the rename, so a file that appears after the operation began is never overwritten. If the volume
//!   cannot do this the write is refused (`UnsupportedOperation`); it is never downgraded to an overwriting rename.
//! * There is no compare-and-swap (`RENAME_SWAP`): it was rejected in ADR-063 because it exposes the new content
//!   at the path before it is known to be wanted, doubles the rename events, adds an uncertain failure of its own
//!   (a swap-back that fails) and still leaves a window.
//!
//! # Concurrency
//!
//! * Writers to the same canonical path **in this process** are serialised by a per-path lock held for the whole
//!   operation (`replace`, `confirm_durability` and `inspect` all take it). It is deliberately independent of the
//!   Persistence Gate's own serialisation, which does not cover every physical-path writer.
//! * **Lock identity.** The key is the canonical path, case-folded (`lock_key`): `Note.md` and `note.md` are one
//!   file on case-insensitive APFS and share one lock. Over-folding on a case-sensitive volume only serialises two
//!   writers that did not need it. **Not handled:** names that differ only in Unicode normalisation (NFC versus
//!   NFD) are one file on APFS but two keys here; folding them needs a normalisation table this module does not
//!   have, and inventing one would be worse than documenting the gap. Callers must spell a path the way the scan
//!   spelled it.
//! * `Intent::ReplaceIfContent` is validated **inside** the operation: early (so a stale expectation costs
//!   nothing), and again immediately before the rename by reading the path itself and checking it is still the
//!   same file (device and inode). A mismatch is `StaleExpected`: nothing is replaced and the caller reconciles
//!   instead of overwriting. An unconditional write also refuses (`TargetChanged`, retryable) if the file at the
//!   path is no longer the file whose metadata was copied.
//! * **What this protects.** Cooperating Clutter writers, completely. External applications do not take the lock:
//!   the final check narrows the window in which an external write can be overwritten to the interval between the
//!   check and the rename, it cannot close it. An external atomic save landing in that interval is overwritten,
//!   and an external in-place write to the old file during the operation is lost with the old file.
//!
//! # Companion operations
//!
//! Neither writes anything; both hold the per-path lock and apply the scope, symlink and volume policies.
//!
//! * [`confirm_durability`] flushes an installed file and its directory without rewriting it, only while the file
//!   still holds the `expected` content that identifies the revision. A newer revision answers `Superseded` and
//!   nothing is flushed on its behalf; flush failures are reported as `Unconfirmed` with the gaps.
//! * [`inspect`] answers, after an `Uncertain` outcome, whether the destination holds the attempted content, the
//!   previous content, nothing, or a third state, and what the listed temporary files hold. It reads only this
//!   writer's own temporary files in the destination's directory. A tie (previous equals attempted) reports the
//!   attempted content.
//!
//! # Outcomes
//!
//! The function never returns a bare error. [`ReplaceOutcome`] says what actually happened:
//!
//! * `NotCommitted`: this operation did not modify the destination (verified from file identities, not assumed);
//! * `Committed` with `Durability::Confirmed`: installed, and every flush succeeded;
//! * `Committed` with `Durability::Unconfirmed`: installed and visible, but a flush was rejected or failed. This is
//!   **not** a failed save and must not be retried by rewriting; the flush gap is listed;
//! * `Uncertain`: the replacement returned an error and the state could not be proven. The temporary file is left
//!   on disk and listed in `recovery_paths`, and nothing is deleted or retried.
//!
//! After *any* error from the replacement step the state on disk is inspected by file identity (device + inode)
//! before it is classified. A rename moves the temporary file, so the temporary file still under its own name
//! proves the rename did not happen ("not committed"), and its identity at the target with the temporary name
//! cleared proves it did ("committed", reported as `confirmed_by_inspection`). Any other picture, or a failure to
//! look, is `Uncertain`. "Not committed" describes what *this operation* did; it cannot speak for changes other
//! processes made to the destination in the meantime.
//!
//! # Volumes
//!
//! Only APFS is supported (`ReplaceRequest::supported_filesystems`, default `["apfs"]`). The destination
//! directory's filesystem type is read with `fstatfs` before anything is created; any other type is refused
//! (`UnsupportedFilesystem`). Atomic visibility was observed on exFAT disk images in an earlier milestone, but that
//! is not evidence for production use, and SMB, NFS and cloud-synced folders were never verified. The list is a
//! request field so tests and manual volume checks can widen it explicitly; nothing widens it silently.
//!
//! # Guarantees and their limits
//!
//! * Atomic visibility rests on same-directory `rename` being atomic on the volume (APFS).
//! * `F_FULLFSYNC` asks the drive to flush to permanent storage. It is the strongest request macOS offers; it is
//!   not a proof of power-loss durability on every device, and power-loss behaviour has not been tested. When the
//!   volume rejects `F_FULLFSYNC` the code falls back to `fsync` and reports the gap in `Durability::Unconfirmed`.
//! * Replacement changes the inode: another process holding the old file open keeps the old content, and a hard
//!   link to the old file keeps the old content (the link is broken).
//! * ACLs are copied by `fcopyfile`; the verification step checks mode, owner, flags, birth time and extended
//!   attributes, not ACLs (covered by a test on the test volume only).
//! * **Ownership.** The replacement is created by the current user, so a destination owned by someone else is
//!   refused (`MetadataPreservationFailed`) even where an in-place write would have been allowed.
//! * **Directory permissions.** The directory must be writable (temporary file, rename); an in-place write needs
//!   only the file to be.
//!
//! # Partial writes and descriptors
//!
//! A write that puts some bytes into the temporary file and then fails is `NotCommitted`: the temporary file is
//! removed (or reported as a leftover) and never installed, and the original is untouched. Every descriptor is owned
//! by a `File`; no raw descriptor outlives its owner, every early return drops what it opened, and the exclusive
//! `flock` on the temporary file is released when the file closes. If the lock cannot be taken the write fails
//! (a writer that cannot hold it would look dead to a future sweep). A test runs every exit path in a child process
//! and asserts the process's open descriptor count does not change.
//!
//! # Hand-written native interface
//!
//! The declarations below were checked against the macOS SDK headers on the build machine (constants by grep; the
//! sizes of `statfs`, `attrlist` and `timespec` and the offset of `f_fstypename` by a C program and by tests).
//! `fstatfs` uses the `$INODE64` symbol on x86_64; that path has **not** been exercised (the development machine
//! is arm64). Extended-attribute reads use the size-then-read pattern; an attribute that changes in between makes
//! the read fail, which refuses the write (safe, retryable), it does not copy a torn value.
//!
//! # Policies
//!
//! * Symlink targets are refused (`UnsupportedSymlink`); nothing is written through a link.
//! * Read-only targets (mode, immutable flag, read-only volume) are refused (`ReadOnlyTarget`).
//! * A target that is not a regular file is refused (`NotARegularFile`).
//! * `scope_root`, when given, must contain the target's canonical parent directory (`OutOfScope`).
//! * There is never a fallback to an in-place or truncating write.
//!
//! # Temporary files and recovery (policy for a later stage, not implemented here)
//!
//! A temporary file left behind by a crash may hold a complete newer revision that was never installed, so it is
//! never deleted merely because the destination exists, and this module never sweeps other writers' files. The
//! writer holds an exclusive `flock` on its temporary file until it finishes. A future recovery pass may treat a
//! `.clutter-tmp.*` file as abandoned only if it can take that lock, and must then surface it (or move it aside)
//! rather than delete it.
//!
//! # Fault injection
//!
//! The step-by-step fault seam (`Faults`) exists only in test builds; production code carries a zero-sized
//! stand-in whose hooks do nothing.

#![cfg(target_os = "macos")]
// Nothing calls this module yet (see "Status" above); remove when it is wired (ADR-063, Stage 2).
#![allow(dead_code)]

use std::cell::RefCell;
use std::collections::{BTreeMap, HashMap};
use std::ffi::CString;
use std::fs::{self, File, Metadata, OpenOptions};
use std::io::{self, Read, Write};
use std::os::macos::fs::MetadataExt as MacMetadataExt;
use std::os::raw::{c_char, c_int, c_uint, c_void};
use std::os::unix::ffi::OsStrExt;
use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
use std::os::unix::io::AsRawFd;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

// ---------------------------------------------------------------------------------------------------------
// Native interface. Declared here so the module needs no new crate dependency; every constant below was
// checked against the macOS SDK headers (copyfile.h, sys/stdio.h, sys/attr.h, sys/fcntl.h, sys/xattr.h).
// ---------------------------------------------------------------------------------------------------------

#[repr(C)]
struct Timespec {
    tv_sec: i64,
    tv_nsec: i64,
}

#[repr(C)]
struct AttrList {
    bitmapcount: u16,
    reserved: u16,
    commonattr: u32,
    volattr: u32,
    dirattr: u32,
    fileattr: u32,
    forkattr: u32,
}

/// `struct statfs` from `<sys/mount.h>` (64-bit inode layout). Only `f_fstypename` is read.
#[repr(C)]
struct Statfs {
    f_bsize: u32,
    f_iosize: i32,
    f_blocks: u64,
    f_bfree: u64,
    f_bavail: u64,
    f_files: u64,
    f_ffree: u64,
    f_fsid: [i32; 2],
    f_owner: u32,
    f_type: u32,
    f_flags: u32,
    f_fssubtype: u32,
    f_fstypename: [u8; 16],
    f_mntonname: [u8; 1024],
    f_mntfromname: [u8; 1024],
    f_flags_ext: u32,
    f_reserved: [u32; 7],
}

extern "C" {
    fn fcntl(fd: c_int, cmd: c_int, ...) -> c_int;
    fn fsync(fd: c_int) -> c_int;
    fn flock(fd: c_int, operation: c_int) -> c_int;
    fn access(path: *const c_char, mode: c_int) -> c_int;
    fn fcopyfile(from: c_int, to: c_int, state: *mut c_void, flags: u32) -> c_int;
    fn fsetattrlist(
        fd: c_int,
        list: *mut c_void,
        buf: *mut c_void,
        size: usize,
        options: c_uint,
    ) -> c_int;
    fn renamex_np(from: *const c_char, to: *const c_char, flags: c_uint) -> c_int;
    // The 64-bit-inode `statfs` family is the only layout `Statfs` below describes; on x86_64 macOS that is the
    // `$INODE64` symbol, on Apple silicon the plain one.
    #[cfg_attr(target_arch = "x86_64", link_name = "fstatfs$INODE64")]
    fn fstatfs(fd: c_int, buf: *mut Statfs) -> c_int;
    fn flistxattr(fd: c_int, names: *mut c_char, size: usize, options: c_int) -> isize;
    fn fgetxattr(
        fd: c_int,
        name: *const c_char,
        value: *mut c_void,
        size: usize,
        position: u32,
        options: c_int,
    ) -> isize;
}

const F_FULLFSYNC: c_int = 51;
const LOCK_EX: c_int = 0x02;
const LOCK_NB: c_int = 0x04;
const W_OK: c_int = 2;
const O_NOFOLLOW: i32 = 0x0100;
const COPYFILE_METADATA: u32 = 0b111; // ACL | STAT | XATTR (copyfile.h)
const RENAME_EXCL: c_uint = 0x4;
const ATTR_BIT_MAP_COUNT: u16 = 5;
const ATTR_CMN_CRTIME: u32 = 0x0000_0200;

const EPERM: i32 = 1;
const ENOENT: i32 = 2;
const EIO: i32 = 5;
const EACCES: i32 = 13;
const EEXIST: i32 = 17;
const ENODEV: i32 = 19;
const EINVAL: i32 = 22;
const ENOTTY: i32 = 25;
const ENOSPC: i32 = 28;
const EROFS: i32 = 30;
const ENOTSUP: i32 = 45;
const EDQUOT: i32 = 69;
const ELOOP: i32 = 62;
const ENOSYS: i32 = 78;

/// Length of every temporary file name this module creates. Independent of the target's name.
pub(crate) const TEMP_NAME_LEN: usize = 47;
pub(crate) const TEMP_PREFIX: &str = ".clutter-tmp.";

// ---------------------------------------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------------------------------------

/// What the caller means by this write. The intent is part of the request, never inferred from whether the
/// destination happens to exist, so it survives a failure and a retry: a retried create is still a create, and can
/// never turn into permission to replace a file another process made in the meantime (ADR-063, decision 11).
#[derive(Debug, Clone, Copy)]
pub enum Intent<'a> {
    /// Make a **new** file. If anything exists at the destination, now or when the rename happens, nothing is
    /// written (`DestinationExists` / `DestinationAppeared`). Note creation, duplicate copies, `.folder.md` creation,
    /// quarantine copies.
    Create,
    /// Replace an **existing** file, whatever it holds. A missing destination is `TargetMissing`: the file is
    /// never re-created by a save (an externally deleted note stays deleted until Sync has reconciled it). Gate saves
    /// of existing notes and `.folder.md`.
    Replace,
    /// Replace an existing file only if it currently holds exactly these bytes, checked early and again immediately
    /// before the rename. A missing destination, or any other content, is `StaleExpected`: nothing is replaced and
    /// the caller reconciles. Sync repairs, and read-modify-write of `.clutter/*.json`.
    ReplaceIfContent(&'a [u8]),
    /// Replace the file if it exists, create it if it does not (never overwriting a file that appears after the
    /// check). Last writer wins. For application state files where either is correct and nobody else writes them;
    /// not for user content.
    Upsert,
}

#[derive(Debug, Clone, Copy)]
pub struct ReplaceRequest<'a> {
    pub path: &'a Path,
    pub contents: &'a [u8],
    pub intent: Intent<'a>,
    /// When set, the target's canonical parent directory must be inside this directory.
    pub scope_root: Option<&'a Path>,
    /// Filesystem type names (as `fstatfs` reports them) the destination's volume must be one of. Default:
    /// [`SUPPORTED_FILESYSTEMS`]. Widening it is an explicit act of the caller; the module never does it.
    pub supported_filesystems: &'a [&'a str],
}

/// The volumes atomic replacement is supported on (ADR-063): APFS only.
pub const SUPPORTED_FILESYSTEMS: &[&str] = &["apfs"];

impl<'a> ReplaceRequest<'a> {
    /// An `Upsert` request (see [`Intent`]). Callers that mean something stricter use the constructors below.
    pub fn new(path: &'a Path, contents: &'a [u8]) -> Self {
        Self::with_intent(path, contents, Intent::Upsert)
    }

    pub fn create(path: &'a Path, contents: &'a [u8]) -> Self {
        Self::with_intent(path, contents, Intent::Create)
    }

    pub fn replace(path: &'a Path, contents: &'a [u8]) -> Self {
        Self::with_intent(path, contents, Intent::Replace)
    }

    pub fn replace_if(path: &'a Path, contents: &'a [u8], expected: &'a [u8]) -> Self {
        Self::with_intent(path, contents, Intent::ReplaceIfContent(expected))
    }

    fn with_intent(path: &'a Path, contents: &'a [u8], intent: Intent<'a>) -> Self {
        Self {
            path,
            contents,
            intent,
            scope_root: None,
            supported_filesystems: SUPPORTED_FILESYSTEMS,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NotCommittedReason {
    ReadOnlyTarget,
    UnsupportedSymlink,
    NotARegularFile,
    InvalidTarget,
    OutOfScope,
    InsufficientSpace,
    PermissionDenied,
    UnsupportedOperation,
    /// `ExpectedContent` only: the destination no longer holds the expected bytes (or is missing). Never retry;
    /// reconcile from disk.
    StaleExpected,
    /// The file at the path is no longer the file this operation validated and copied metadata from (something
    /// replaced it meanwhile). Nothing was replaced; a retry starts again from the file that is there now.
    TargetChanged,
    /// The destination's volume is not on the supported list (APFS by default). Never retry.
    UnsupportedFilesystem,
    MetadataPreservationFailed,
    /// `Create` only: something already exists at the destination. It was not touched.
    DestinationExists,
    /// A new file was being created and something appeared at the destination first. It was not touched.
    DestinationAppeared,
    /// `Replace` only: there is no file at the destination. Nothing was created.
    TargetMissing,
    Io,
}

/// A durability step that did not reach its strongest form.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DurabilityGap {
    /// The volume rejected `F_FULLFSYNC` for the file; plain `fsync` succeeded.
    FileFsyncOnly,
    /// The volume rejected `F_FULLFSYNC` for the directory; plain `fsync` succeeded.
    DirectoryFsyncOnly,
    /// Flushing the parent directory failed after the replacement had already happened.
    DirectorySyncFailed(String),
    /// Flushing the file itself failed (`confirm_durability` only: a write flushes the temporary file *before* the
    /// rename and fails the write instead).
    FileSyncFailed(String),
}

/// Metadata that was preserved only as far as the volume allows, reported instead of failing the write.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MetadataNote {
    /// The volume stores birth times with less than sub-second precision (observed on exFAT): the birth time was
    /// restored to the whole second. The original's value was read from the same volume.
    BirthTimeSubsecondPrecisionLost,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Durability {
    /// Every durability request (`F_FULLFSYNC` on the file and on the directory) succeeded. This is the
    /// strongest confirmation the platform offers, not a proof against every storage device.
    Confirmed,
    Unconfirmed(Vec<DurabilityGap>),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Replaced {
    Existing,
    Created,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReplaceOutcome {
    /// The new contents are installed at the path and visible. This cannot be rolled back.
    Committed {
        replaced: Replaced,
        durability: Durability,
        /// The replacement call reported an error, but inspection proved the new file is installed.
        confirmed_by_inspection: bool,
        /// Metadata the volume could only preserve approximately (never a silent drop).
        metadata_notes: Vec<MetadataNote>,
        /// Files this operation created and could not remove.
        leftovers: Vec<PathBuf>,
    },
    /// This operation did not modify the destination (verified from file identities, not assumed). It says
    /// nothing about changes other processes may have made to the destination meanwhile.
    NotCommitted {
        reason: NotCommittedReason,
        detail: String,
        leftovers: Vec<PathBuf>,
    },
    /// The replacement returned an error and the resulting state could not be proven either way. Nothing has been
    /// deleted or retried. `recovery_paths` lists files that may hold the only copy of a revision.
    Uncertain {
        detail: String,
        recovery_paths: Vec<PathBuf>,
    },
}

impl ReplaceOutcome {
    pub fn is_committed(&self) -> bool {
        matches!(self, ReplaceOutcome::Committed { .. })
    }
}

// ---------------------------------------------------------------------------------------------------------
// Companion operations (ADR-063, decision 12): flush-only and inspection. Neither writes anything.
// ---------------------------------------------------------------------------------------------------------

/// Ask for durability of a file that is already installed, without rewriting it.
#[derive(Debug, Clone, Copy)]
pub struct DurabilityRequest<'a> {
    pub path: &'a Path,
    /// The content whose durability is being confirmed. It identifies the revision: the flush happens only while
    /// the file still holds exactly this, so confirming revision N can never be mistaken for confirming N+1.
    pub expected: &'a [u8],
    pub scope_root: Option<&'a Path>,
    pub supported_filesystems: &'a [&'a str],
}

impl<'a> DurabilityRequest<'a> {
    pub fn new(path: &'a Path, expected: &'a [u8]) -> Self {
        Self {
            path,
            expected,
            scope_root: None,
            supported_filesystems: SUPPORTED_FILESYSTEMS,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DurabilityOutcome {
    /// The file holds the expected content and the file and its directory were both flushed (`F_FULLFSYNC`).
    Confirmed,
    /// The file holds the expected content, but a flush was rejected or failed. Nothing was rewritten; asking again
    /// later is safe.
    Unconfirmed(Vec<DurabilityGap>),
    /// The file now holds different content (a newer revision, or someone else's). Nothing was flushed on behalf
    /// of the expected content: it is no longer what is on disk, and the new content has its own result.
    Superseded,
    /// There is no file at the path.
    Missing,
    /// A policy refused the request before anything was read (scope, symlink, not a regular file, unsupported
    /// volume). Nothing was touched.
    Refused {
        reason: NotCommittedReason,
        detail: String,
    },
    /// The file could not be read. Nothing was changed; the durability question is unanswered.
    Failed { detail: String },
}

/// Ask what is on disk after an uncertain write, without changing anything.
#[derive(Debug, Clone, Copy)]
pub struct InspectRequest<'a> {
    pub path: &'a Path,
    /// What the uncertain write was installing.
    pub attempted: &'a [u8],
    /// What the destination held before it (`None` when the write was a create).
    pub previous: Option<&'a [u8]>,
    /// The temporary files the uncertain outcome listed (`Uncertain::recovery_paths`).
    pub temp_paths: &'a [PathBuf],
    pub scope_root: Option<&'a Path>,
    pub supported_filesystems: &'a [&'a str],
}

impl<'a> InspectRequest<'a> {
    pub fn new(path: &'a Path, attempted: &'a [u8], previous: Option<&'a [u8]>) -> Self {
        Self {
            path,
            attempted,
            previous,
            temp_paths: &[],
            scope_root: None,
            supported_filesystems: SUPPORTED_FILESYSTEMS,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TargetState {
    /// The destination holds the attempted content: the write took effect (or the content is identical to what was
    /// there; either way the file is what the caller wanted). Durability is a separate question.
    HoldsAttempted,
    /// The destination holds the previous content and not the attempted content: the write did not take effect;
    /// repeating it is safe.
    HoldsPrevious,
    /// There is no file at the destination.
    Missing,
    /// The destination holds something else: another party changed it. It must not be overwritten blindly.
    HoldsOther,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TempState {
    Absent,
    HoldsAttempted,
    HoldsOther,
    Unreadable(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TempReport {
    pub path: PathBuf,
    pub state: TempState,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Inspection {
    Inspected {
        target: TargetState,
        temps: Vec<TempReport>,
    },
    Refused {
        reason: NotCommittedReason,
        detail: String,
    },
    /// The destination could not be read. The question is unanswered; nothing was changed.
    Failed { detail: String },
}

/// Flushes an installed file and its directory without rewriting it, if (and only while) it holds `expected`.
/// Holds the per-path lock, so it cannot interleave with a write of the same file.
pub fn confirm_durability(request: &DurabilityRequest<'_>) -> DurabilityOutcome {
    confirm_durability_with(request, &Faults::none())
}

/// Reports whether an uncertain write took effect, by looking at the file (and the listed temporary files).
/// Read-only; holds the per-path lock.
pub fn inspect(request: &InspectRequest<'_>) -> Inspection {
    inspect_with(request, &Faults::none())
}

/// Replaces (or creates) one regular file atomically. See the module documentation for the exact semantics.
pub fn replace(request: &ReplaceRequest<'_>) -> ReplaceOutcome {
    replace_with(request, &Faults::none())
}

// ---------------------------------------------------------------------------------------------------------
// Fault injection: the one small seam, compiled for tests only. Every native step announces itself (`enter`),
// which lets a test observe the order of steps, run a side effect at an exact moment, or make the step fail with a
// chosen errno.
// ---------------------------------------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Step {
    StatTarget,
    CreateTemp,
    /// Taking the exclusive `flock` that marks the temporary file as belonging to a live writer.
    LockTemp,
    WriteData,
    CopyMetadata,
    SetBirthTime,
    SetMtime,
    VerifyMetadata,
    FlushTemp,
    CheckVolume,
    /// `inspect`: reading the target (or a temporary file) to compare it with what was attempted.
    InspectRead,
    /// `confirm_durability`: flushing the file, then its directory. Neither rewrites anything.
    ConfirmFlushFile,
    ConfirmSyncDir,
    /// The last look at the target before the rename: same file, and (conditional writes) same content.
    VerifyTarget,
    RenameExcl,
    RenameOver,
    InspectAfterRename,
    RemoveTemp,
    SyncDir,
}

/// Production stand-in: the hooks exist so the code reads the same in both builds, and do nothing.
#[cfg(not(test))]
pub(crate) struct Faults;

#[cfg(not(test))]
impl Faults {
    pub(crate) fn none() -> Self {
        Faults
    }

    fn enter(&self, _step: Step) -> io::Result<()> {
        Ok(())
    }

    fn after(&self, _step: Step) -> io::Result<()> {
        Ok(())
    }

    fn write_data(&self, file: &mut File, contents: &[u8]) -> io::Result<()> {
        file.write_all(contents)
    }
}

#[cfg(test)]
#[derive(Debug, Clone, Copy)]
enum Fault {
    /// The step fails before it has any effect.
    Before(i32),
    /// The step takes effect, then reports this error (rename only).
    After(i32),
    /// Writing the contents succeeds for this many bytes, then fails with this errno: a partial write.
    Partial(usize, i32),
}

#[cfg(test)]
type Observer = Box<dyn Fn(Step) + Send + Sync>;

#[cfg(test)]
pub(crate) struct Faults {
    plan: Vec<(Step, Fault)>,
    observer: Option<Observer>,
}

#[cfg(test)]
impl Faults {
    pub(crate) fn none() -> Self {
        Self {
            plan: Vec::new(),
            observer: None,
        }
    }

    pub(crate) fn fail(mut self, step: Step, errno: i32) -> Self {
        self.plan.push((step, Fault::Before(errno)));
        self
    }

    pub(crate) fn fail_after_effect(mut self, step: Step, errno: i32) -> Self {
        self.plan.push((step, Fault::After(errno)));
        self
    }

    /// The write of the new contents puts `bytes` bytes into the temporary file and then fails with `errno`.
    pub(crate) fn partial_write(mut self, bytes: usize, errno: i32) -> Self {
        self.plan.push((Step::WriteData, Fault::Partial(bytes, errno)));
        self
    }

    fn write_data(&self, file: &mut File, contents: &[u8]) -> io::Result<()> {
        for (planned, fault) in &self.plan {
            if let (Step::WriteData, Fault::Partial(bytes, errno)) = (planned, fault) {
                file.write_all(&contents[..(*bytes).min(contents.len())])?;
                return Err(io::Error::from_raw_os_error(*errno));
            }
        }
        file.write_all(contents)
    }

    pub(crate) fn observe(mut self, observer: impl Fn(Step) + Send + Sync + 'static) -> Self {
        self.observer = Some(Box::new(observer));
        self
    }

    fn enter(&self, step: Step) -> io::Result<()> {
        if let Some(observer) = &self.observer {
            observer(step);
        }
        for (planned, fault) in &self.plan {
            if let (true, Fault::Before(errno)) = (*planned == step, fault) {
                return Err(io::Error::from_raw_os_error(*errno));
            }
        }
        Ok(())
    }

    fn after(&self, step: Step) -> io::Result<()> {
        for (planned, fault) in &self.plan {
            if let (true, Fault::After(errno)) = (*planned == step, fault) {
                return Err(io::Error::from_raw_os_error(*errno));
            }
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------------------------------------

static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);
static PATH_LOCKS: OnceLock<Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>> = OnceLock::new();

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Identity {
    dev: u64,
    ino: u64,
}

impl Identity {
    fn of(metadata: &Metadata) -> Self {
        Self {
            dev: metadata.dev(),
            ino: metadata.ino(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FlushLevel {
    Full,
    FsyncOnly,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Placement {
    /// The replacement did not happen: the destination is still what it was and the temporary file is where it was.
    Unchanged,
    /// The replacement happened.
    Applied,
    Unknown,
}

struct Existing {
    file: File,
    metadata: Metadata,
}

pub(crate) fn replace_with(request: &ReplaceRequest<'_>, faults: &Faults) -> ReplaceOutcome {
    let (parent, target) = match resolve_target(request) {
        Ok(resolved) => resolved,
        Err(outcome) => return outcome,
    };

    with_path_lock(&lock_key(&target), || {
        Operation {
            request,
            faults,
            parent: &parent,
            target: &target,
            notes: RefCell::new(Vec::new()),
        }
        .run()
    })
}

fn not_committed(
    reason: NotCommittedReason,
    detail: impl Into<String>,
    leftovers: Vec<PathBuf>,
) -> ReplaceOutcome {
    ReplaceOutcome::NotCommitted {
        reason,
        detail: detail.into(),
        leftovers,
    }
}

fn errno_of(error: &io::Error) -> Option<i32> {
    error.raw_os_error()
}

fn reason_for(error: &io::Error) -> NotCommittedReason {
    match errno_of(error) {
        Some(ENOSPC) | Some(EDQUOT) => NotCommittedReason::InsufficientSpace,
        Some(EROFS) => NotCommittedReason::ReadOnlyTarget,
        Some(EACCES) | Some(EPERM) => NotCommittedReason::PermissionDenied,
        Some(ENOTSUP) | Some(ENOSYS) => NotCommittedReason::UnsupportedOperation,
        _ => NotCommittedReason::Io,
    }
}

/// Splits a path into a canonical parent directory and the target path inside it, and applies the scope check.
/// Operating on the canonical parent means a symlinked directory in the path is resolved once, here.
fn resolve_path(
    path: &Path,
    scope_root: Option<&Path>,
) -> Result<(PathBuf, PathBuf), (NotCommittedReason, String)> {
    let invalid = |detail: &str| (NotCommittedReason::InvalidTarget, detail.to_string());

    let Some(name) = path.file_name() else {
        return Err(invalid("the target has no file name"));
    };
    let Some(parent) = path.parent().filter(|parent| !parent.as_os_str().is_empty()) else {
        return Err(invalid("the target has no parent directory"));
    };
    let canonical_parent = fs::canonicalize(parent).map_err(|error| {
        (
            reason_for(&error),
            format!("cannot resolve the parent directory: {error}"),
        )
    })?;

    if let Some(root) = scope_root {
        let canonical_root = fs::canonicalize(root).map_err(|error| {
            (
                reason_for(&error),
                format!("cannot resolve the scope root: {error}"),
            )
        })?;
        if !canonical_parent.starts_with(&canonical_root) {
            return Err((
                NotCommittedReason::OutOfScope,
                format!(
                    "{} is outside {}",
                    canonical_parent.display(),
                    canonical_root.display()
                ),
            ));
        }
    }

    let target = canonical_parent.join(name);
    Ok((canonical_parent, target))
}

fn resolve_target(request: &ReplaceRequest<'_>) -> Result<(PathBuf, PathBuf), ReplaceOutcome> {
    resolve_path(request.path, request.scope_root)
        .map_err(|(reason, detail)| not_committed(reason, detail, Vec::new()))
}

/// The destination directory's filesystem must be on the supported list. Nothing has been created yet.
fn check_volume_at(
    faults: &Faults,
    parent: &Path,
    supported: &[&str],
) -> Result<(), (NotCommittedReason, String)> {
    if let Err(error) = faults.enter(Step::CheckVolume) {
        return Err((reason_for(&error), format!("cannot check the volume: {error}")));
    }
    let directory = File::open(parent).map_err(|error| {
        (
            reason_for(&error),
            format!("cannot open the destination directory: {error}"),
        )
    })?;
    let mut info: Statfs = unsafe { std::mem::zeroed() };
    if let Err(error) = cvt(unsafe { fstatfs(directory.as_raw_fd(), &mut info) }) {
        return Err((
            reason_for(&error),
            format!("cannot read the volume's type: {error}"),
        ));
    }
    let length = info
        .f_fstypename
        .iter()
        .position(|byte| *byte == 0)
        .unwrap_or(info.f_fstypename.len());
    let name = String::from_utf8_lossy(&info.f_fstypename[..length]).to_string();
    if supported.iter().any(|candidate| *candidate == name) {
        Ok(())
    } else {
        Err((
            NotCommittedReason::UnsupportedFilesystem,
            format!(
                "the volume is `{name}`; atomic saves are supported on {supported:?} only, and nothing is written in place instead"
            ),
        ))
    }
}

/// The key two requests share exactly when they can name the same file. It is the canonical path, case-folded:
/// the supported volume (APFS) is case-insensitive by default, so `Note.md` and `note.md` are one file and must
/// share one lock. Over-folding on a case-sensitive volume only serialises two writers that did not need it.
/// Unicode normalisation differences (a name stored as NFC versus NFD) are **not** folded; see the module header.
fn lock_key(target: &Path) -> PathBuf {
    PathBuf::from(target.to_string_lossy().to_lowercase())
}

/// Opens an existing regular file for reading, without following a symlink. `Ok(None)` is a missing file.
fn open_regular(path: &Path) -> Result<Option<File>, (NotCommittedReason, String)> {
    let file = match OpenOptions::new().read(true).custom_flags(O_NOFOLLOW).open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) if errno_of(&error) == Some(ELOOP) => {
            return Err((
                NotCommittedReason::UnsupportedSymlink,
                "the target is a symbolic link".into(),
            ))
        }
        Err(error) => {
            return Err((
                reason_for(&error),
                format!("cannot open the target: {error}"),
            ))
        }
    };
    match file.metadata() {
        Ok(metadata) if metadata.is_file() => Ok(Some(file)),
        Ok(_) => Err((
            NotCommittedReason::NotARegularFile,
            "the target is not a regular file".into(),
        )),
        Err(error) => Err((
            reason_for(&error),
            format!("cannot inspect the target: {error}"),
        )),
    }
}

pub(crate) fn confirm_durability_with(
    request: &DurabilityRequest<'_>,
    faults: &Faults,
) -> DurabilityOutcome {
    let (parent, target) = match resolve_path(request.path, request.scope_root) {
        Ok(resolved) => resolved,
        Err((reason, detail)) => return DurabilityOutcome::Refused { reason, detail },
    };

    with_path_lock(&lock_key(&target), || {
        if let Err((reason, detail)) = check_volume_at(faults, &parent, request.supported_filesystems)
        {
            return DurabilityOutcome::Refused { reason, detail };
        }
        let mut file = match open_regular(&target) {
            Ok(Some(file)) => file,
            Ok(None) => return DurabilityOutcome::Missing,
            Err((reason, detail)) => return DurabilityOutcome::Refused { reason, detail },
        };
        let mut content = Vec::new();
        if let Err(error) = faults
            .enter(Step::InspectRead)
            .and_then(|_| file.read_to_end(&mut content))
        {
            return DurabilityOutcome::Failed {
                detail: format!("cannot read the target: {error}"),
            };
        }
        if content != request.expected {
            return DurabilityOutcome::Superseded;
        }

        // The descriptor read above is the one flushed: the check and the flush are about the same file.
        let mut gaps = Vec::new();
        match flush_fd(faults, Step::ConfirmFlushFile, file.as_raw_fd()) {
            Ok(FlushLevel::Full) => {}
            Ok(FlushLevel::FsyncOnly) => gaps.push(DurabilityGap::FileFsyncOnly),
            Err(error) => gaps.push(DurabilityGap::FileSyncFailed(error.to_string())),
        }
        let synced = File::open(&parent)
            .and_then(|directory| flush_fd(faults, Step::ConfirmSyncDir, directory.as_raw_fd()));
        match synced {
            Ok(FlushLevel::Full) => {}
            Ok(FlushLevel::FsyncOnly) => gaps.push(DurabilityGap::DirectoryFsyncOnly),
            Err(error) => gaps.push(DurabilityGap::DirectorySyncFailed(error.to_string())),
        }

        if gaps.is_empty() {
            DurabilityOutcome::Confirmed
        } else {
            DurabilityOutcome::Unconfirmed(gaps)
        }
    })
}

/// A temporary file this writer could have created: in the destination's own directory, with its exact name shape.
fn is_writer_temp(parent: &Path, path: &Path) -> bool {
    path.parent() == Some(parent)
        && path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with(TEMP_PREFIX) && name.len() == TEMP_NAME_LEN)
}

pub(crate) fn inspect_with(request: &InspectRequest<'_>, faults: &Faults) -> Inspection {
    let refused = |reason: NotCommittedReason, detail: String| Inspection::Refused { reason, detail };
    let (parent, target) = match resolve_path(request.path, request.scope_root) {
        Ok(resolved) => resolved,
        Err((reason, detail)) => return refused(reason, detail),
    };
    // Only this writer's own temporary files in the destination's directory may be looked at: the list comes from
    // the caller, and a caller must not be able to use inspection to read arbitrary files.
    for temp in request.temp_paths {
        if !is_writer_temp(&parent, temp) {
            return refused(
                NotCommittedReason::OutOfScope,
                format!("{} is not one of this writer's temporary files for this destination", temp.display()),
            );
        }
    }

    with_path_lock(&lock_key(&target), || {
        if let Err((reason, detail)) = check_volume_at(faults, &parent, request.supported_filesystems)
        {
            return refused(reason, detail);
        }
        let state = match open_regular(&target) {
            Ok(None) => TargetState::Missing,
            Ok(Some(mut file)) => {
                let mut content = Vec::new();
                if let Err(error) = faults
                    .enter(Step::InspectRead)
                    .and_then(|_| file.read_to_end(&mut content))
                {
                    return Inspection::Failed {
                        detail: format!("cannot read the target: {error}"),
                    };
                }
                // Attempted wins a tie: if the previous and the attempted content are identical, the file is what the
                // caller wanted whichever way the write went.
                if content == request.attempted {
                    TargetState::HoldsAttempted
                } else if request.previous == Some(content.as_slice()) {
                    TargetState::HoldsPrevious
                } else {
                    TargetState::HoldsOther
                }
            }
            Err((reason, detail)) => return refused(reason, detail),
        };

        let temps = request
            .temp_paths
            .iter()
            .map(|path| {
                let state = match open_regular(path) {
                    Ok(None) => TempState::Absent,
                    Ok(Some(mut file)) => {
                        let mut content = Vec::new();
                        match file.read_to_end(&mut content) {
                            Ok(_) if content == request.attempted => TempState::HoldsAttempted,
                            Ok(_) => TempState::HoldsOther,
                            Err(error) => TempState::Unreadable(error.to_string()),
                        }
                    }
                    Err((_, detail)) => TempState::Unreadable(detail),
                };
                TempReport {
                    path: path.clone(),
                    state,
                }
            })
            .collect();

        Inspection::Inspected {
            target: state,
            temps,
        }
    })
}

fn with_path_lock<T>(key: &Path, work: impl FnOnce() -> T) -> T {
    let registry = PATH_LOCKS.get_or_init(|| Mutex::new(HashMap::new()));
    let lock = {
        let mut map = registry
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        Arc::clone(
            map.entry(key.to_path_buf())
                .or_insert_with(|| Arc::new(Mutex::new(()))),
        )
    };
    let result = {
        let _guard = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        work()
    };
    let mut map = registry
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    // Registry + this call's clone are the only holders: nobody is waiting, drop the entry.
    if Arc::strong_count(&lock) == 2 {
        map.remove(key);
    }
    result
}

fn temp_name() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos() as u64)
        .unwrap_or(0);
    let counter = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed) as u32;
    format!(
        "{TEMP_PREFIX}{:08x}.{counter:08x}.{nanos:016x}",
        std::process::id()
    )
}

fn c_path(path: &Path) -> io::Result<CString> {
    CString::new(path.as_os_str().as_bytes()).map_err(|_| io::Error::from_raw_os_error(EINVAL))
}

fn cvt(rc: c_int) -> io::Result<()> {
    if rc == -1 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

fn identity_at(path: &Path) -> io::Result<Option<Identity>> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => Ok(Some(Identity::of(&metadata))),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

fn path_exists(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok()
}

/// `F_FULLFSYNC`, falling back to `fsync` only when the volume says it does not support the former.
fn flush_fd(faults: &Faults, step: Step, fd: c_int) -> io::Result<FlushLevel> {
    let full = faults
        .enter(step)
        .and_then(|_| cvt(unsafe { fcntl(fd, F_FULLFSYNC) }));
    match full {
        Ok(()) => Ok(FlushLevel::Full),
        Err(error)
            if matches!(
                errno_of(&error),
                Some(ENOTSUP | ENOTTY | EINVAL | ENODEV | ENOSYS)
            ) =>
        {
            cvt(unsafe { fsync(fd) })?;
            Ok(FlushLevel::FsyncOnly)
        }
        Err(error) => Err(error),
    }
}

fn set_birth_time(fd: c_int, seconds: i64, nanoseconds: i64) -> io::Result<()> {
    let mut list = AttrList {
        bitmapcount: ATTR_BIT_MAP_COUNT,
        reserved: 0,
        commonattr: ATTR_CMN_CRTIME,
        volattr: 0,
        dirattr: 0,
        fileattr: 0,
        forkattr: 0,
    };
    let mut value = Timespec {
        tv_sec: seconds,
        tv_nsec: nanoseconds,
    };
    cvt(unsafe {
        fsetattrlist(
            fd,
            &mut list as *mut AttrList as *mut c_void,
            &mut value as *mut Timespec as *mut c_void,
            std::mem::size_of::<Timespec>(),
            0,
        )
    })
}

/// Every extended attribute of an open file, name to value.
pub(crate) fn read_xattrs(file: &File) -> io::Result<BTreeMap<Vec<u8>, Vec<u8>>> {
    let fd = file.as_raw_fd();
    let size = unsafe { flistxattr(fd, std::ptr::null_mut(), 0, 0) };
    if size < 0 {
        return Err(io::Error::last_os_error());
    }
    let mut names = vec![0u8; size as usize];
    if size > 0 {
        let written = unsafe { flistxattr(fd, names.as_mut_ptr() as *mut c_char, names.len(), 0) };
        if written < 0 {
            return Err(io::Error::last_os_error());
        }
        names.truncate(written as usize);
    }
    let mut attributes = BTreeMap::new();
    for name in names
        .split(|byte| *byte == 0)
        .filter(|name| !name.is_empty())
    {
        let c_name = CString::new(name).map_err(|_| io::Error::from_raw_os_error(EINVAL))?;
        let value_size = unsafe { fgetxattr(fd, c_name.as_ptr(), std::ptr::null_mut(), 0, 0, 0) };
        if value_size < 0 {
            return Err(io::Error::last_os_error());
        }
        let mut value = vec![0u8; value_size as usize];
        if value_size > 0 {
            let read = unsafe {
                fgetxattr(
                    fd,
                    c_name.as_ptr(),
                    value.as_mut_ptr() as *mut c_void,
                    value.len(),
                    0,
                    0,
                )
            };
            if read < 0 {
                return Err(io::Error::last_os_error());
            }
            value.truncate(read as usize);
        }
        attributes.insert(name.to_vec(), value);
    }
    Ok(attributes)
}

/// The temporary file must carry everything the original carries. Extra attributes the system adds to the new
/// file are tolerated; a missing or different one is not.
fn verify_metadata(original: &File, temporary: &File) -> Result<Vec<MetadataNote>, String> {
    let (a, b) = (
        original.metadata().map_err(|e| e.to_string())?,
        temporary.metadata().map_err(|e| e.to_string())?,
    );
    if a.mode() & 0o7777 != b.mode() & 0o7777 {
        return Err(format!(
            "mode {:o} was not preserved (found {:o})",
            a.mode() & 0o7777,
            b.mode() & 0o7777
        ));
    }
    if (a.uid(), a.gid()) != (b.uid(), b.gid()) {
        return Err("the owner could not be preserved".into());
    }
    if a.st_flags() != b.st_flags() {
        return Err("the file flags were not preserved".into());
    }
    let mut notes = Vec::new();
    match compare_birth_times(
        (a.st_birthtime(), a.st_birthtime_nsec()),
        (b.st_birthtime(), b.st_birthtime_nsec()),
    ) {
        BirthMatch::Exact => {}
        BirthMatch::WholeSecond => notes.push(MetadataNote::BirthTimeSubsecondPrecisionLost),
        BirthMatch::Different => return Err("the birth time was not preserved".into()),
    }
    let wanted =
        read_xattrs(original).map_err(|e| format!("cannot read extended attributes: {e}"))?;
    let found =
        read_xattrs(temporary).map_err(|e| format!("cannot read extended attributes: {e}"))?;
    for (name, value) in &wanted {
        if found.get(name) != Some(value) {
            return Err(format!(
                "extended attribute {} was not preserved",
                String::from_utf8_lossy(name)
            ));
        }
    }
    Ok(notes)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BirthMatch {
    Exact,
    /// Same second, different sub-second part: the most a volume with coarse birth-time storage can keep.
    WholeSecond,
    Different,
}

fn compare_birth_times(wanted: (i64, i64), found: (i64, i64)) -> BirthMatch {
    if wanted == found {
        BirthMatch::Exact
    } else if wanted.0 == found.0 {
        BirthMatch::WholeSecond
    } else {
        BirthMatch::Different
    }
}

struct Operation<'a> {
    request: &'a ReplaceRequest<'a>,
    faults: &'a Faults,
    parent: &'a Path,
    target: &'a Path,
    notes: RefCell<Vec<MetadataNote>>,
}

impl Operation<'_> {
    /// Stage 1. `Ok(None)` is a genuinely missing target.
    fn validate(&self) -> Result<Option<Existing>, ReplaceOutcome> {
        let stat = self
            .faults
            .enter(Step::StatTarget)
            .and_then(|_| fs::symlink_metadata(self.target));
        let metadata = match stat {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) => {
                return Err(not_committed(
                    reason_for(&error),
                    format!("cannot inspect the target: {error}"),
                    Vec::new(),
                ))
            }
        };
        if metadata.file_type().is_symlink() {
            return Err(not_committed(
                NotCommittedReason::UnsupportedSymlink,
                "the target is a symbolic link",
                Vec::new(),
            ));
        }
        if !metadata.is_file() {
            return Err(not_committed(
                NotCommittedReason::NotARegularFile,
                "the target is not a regular file",
                Vec::new(),
            ));
        }
        let path = c_path(self.target).map_err(|e| {
            not_committed(NotCommittedReason::InvalidTarget, e.to_string(), Vec::new())
        })?;
        if unsafe { access(path.as_ptr(), W_OK) } != 0 {
            let error = io::Error::last_os_error();
            return Err(match errno_of(&error) {
                Some(EACCES) | Some(EPERM) | Some(EROFS) => not_committed(
                    NotCommittedReason::ReadOnlyTarget,
                    "the target is read-only",
                    Vec::new(),
                ),
                _ => not_committed(
                    reason_for(&error),
                    format!("cannot check write access: {error}"),
                    Vec::new(),
                ),
            });
        }
        let file = OpenOptions::new()
            .read(true)
            .custom_flags(O_NOFOLLOW)
            .open(self.target)
            .map_err(|error| {
                if errno_of(&error) == Some(ELOOP) {
                    not_committed(
                        NotCommittedReason::UnsupportedSymlink,
                        "the target became a symbolic link",
                        Vec::new(),
                    )
                } else {
                    not_committed(
                        reason_for(&error),
                        format!("cannot open the target: {error}"),
                        Vec::new(),
                    )
                }
            })?;
        let opened = file
            .metadata()
            .map_err(|e| not_committed(reason_for(&e), e.to_string(), Vec::new()))?;
        if Identity::of(&opened) != Identity::of(&metadata) {
            return Err(not_committed(
                NotCommittedReason::Io,
                "the target changed while it was being validated",
                Vec::new(),
            ));
        }
        Ok(Some(Existing {
            file,
            metadata: opened,
        }))
    }

    fn run(&self) -> ReplaceOutcome {
        let existing = match self.validate() {
            Ok(existing) => existing,
            Err(outcome) => return outcome,
        };
        match (self.request.intent, &existing) {
            (Intent::Create, Some(_)) => {
                return not_committed(
                    NotCommittedReason::DestinationExists,
                    "something already exists at the destination; a create never replaces",
                    Vec::new(),
                )
            }
            (Intent::Replace, None) => {
                return not_committed(
                    NotCommittedReason::TargetMissing,
                    "there is no file at the destination; a replace never creates",
                    Vec::new(),
                )
            }
            _ => {}
        }
        if let Err(outcome) = self.check_volume() {
            return outcome;
        }

        let expected = match self.request.intent {
            Intent::ReplaceIfContent(expected) => Some(expected),
            Intent::Create | Intent::Replace | Intent::Upsert => None,
        };
        if let Some(expected) = expected {
            let Some(existing) = &existing else {
                return not_committed(
                    NotCommittedReason::StaleExpected,
                    "the target is missing but content was expected",
                    Vec::new(),
                );
            };
            let mut current = Vec::new();
            if let Err(error) = (&existing.file).read_to_end(&mut current) {
                return not_committed(
                    reason_for(&error),
                    format!("cannot read the target: {error}"),
                    Vec::new(),
                );
            }
            if current != expected {
                return not_committed(
                    NotCommittedReason::StaleExpected,
                    "the target no longer holds the expected content",
                    Vec::new(),
                );
            }
        }

        let (mut temporary, temp_path) = match self.create_temp() {
            Ok(created) => created,
            Err(error) => {
                return not_committed(
                    reason_for(&error),
                    format!("cannot create the temporary file: {error}"),
                    Vec::new(),
                )
            }
        };
        // Held until the file is closed: lets a future recovery pass tell an active writer from a dead one. A
        // writer that could not take it is indistinguishable from a dead one, so the write fails instead.
        if let Err(error) = self
            .faults
            .enter(Step::LockTemp)
            .and_then(|_| cvt(unsafe { flock(temporary.as_raw_fd(), LOCK_EX | LOCK_NB) }))
        {
            let leftovers = self.discard(&temp_path);
            return not_committed(
                reason_for(&error),
                format!("cannot lock the temporary file: {error}"),
                leftovers,
            );
        }

        let mut gaps = Vec::new();
        if let Err((reason, detail)) =
            self.prepare_temp(&mut temporary, existing.as_ref(), &mut gaps)
        {
            let leftovers = self.discard(&temp_path);
            return not_committed(reason, detail, leftovers);
        }
        let temp_identity = match temporary.metadata() {
            Ok(metadata) => Identity::of(&metadata),
            Err(error) => {
                let leftovers = self.discard(&temp_path);
                return not_committed(
                    reason_for(&error),
                    format!("cannot inspect the temporary file: {error}"),
                    leftovers,
                );
            }
        };
        drop(temporary);

        match &existing {
            Some(existing) => {
                // The last look: nothing between here and the rename touches the target again.
                if let Err(outcome) = self.verify_target(existing, expected, &temp_path) {
                    return outcome;
                }
                self.commit_rename(
                    &temp_path,
                    temp_identity,
                    Step::RenameOver,
                    None,
                    Replaced::Existing,
                    gaps,
                )
            }
            None => self.commit_rename(
                &temp_path,
                temp_identity,
                Step::RenameExcl,
                Some(RENAME_EXCL),
                Replaced::Created,
                gaps,
            ),
        }
    }

    fn create_temp(&self) -> io::Result<(File, PathBuf)> {
        let mut attempts = 0;
        loop {
            let path = self.parent.join(temp_name());
            let created = self.faults.enter(Step::CreateTemp).and_then(|_| {
                OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .mode(0o666)
                    .open(&path)
            });
            match created {
                Ok(file) => return Ok((file, path)),
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists && attempts < 8 => {
                    attempts += 1
                }
                Err(error) => return Err(error),
            }
        }
    }

    /// Stages 3 to 6: contents, metadata, and finally the durability barrier. Nothing after the flush touches the
    /// temporary file.
    fn prepare_temp(
        &self,
        temporary: &mut File,
        existing: Option<&Existing>,
        gaps: &mut Vec<DurabilityGap>,
    ) -> Result<(), (NotCommittedReason, String)> {
        let io_failure =
            |what: &str, error: io::Error| (reason_for(&error), format!("{what}: {error}"));
        let metadata_failure = |what: &str, error: io::Error| {
            (
                NotCommittedReason::MetadataPreservationFailed,
                format!("{what}: {error}"),
            )
        };

        self.faults
            .enter(Step::WriteData)
            .and_then(|_| self.faults.write_data(temporary, self.request.contents))
            .map_err(|error| io_failure("cannot write the new contents", error))?;

        if let Some(existing) = existing {
            let (source, destination) = (existing.file.as_raw_fd(), temporary.as_raw_fd());
            self.faults
                .enter(Step::CopyMetadata)
                .and_then(|_| {
                    cvt(unsafe {
                        fcopyfile(source, destination, std::ptr::null_mut(), COPYFILE_METADATA)
                    })
                })
                .map_err(|error| metadata_failure("cannot copy the file's metadata", error))?;
            self.faults
                .enter(Step::SetBirthTime)
                .and_then(|_| {
                    set_birth_time(
                        destination,
                        existing.metadata.st_birthtime(),
                        existing.metadata.st_birthtime_nsec(),
                    )
                })
                .map_err(|error| metadata_failure("cannot restore the birth time", error))?;
            // The metadata copy brought the old modification time with it.
            self.faults
                .enter(Step::SetMtime)
                .and_then(|_| temporary.set_modified(SystemTime::now()))
                .map_err(|error| io_failure("cannot set the modification time", error))?;
            self.faults
                .enter(Step::VerifyMetadata)
                .map_err(|error| metadata_failure("cannot verify the file's metadata", error))?;
            let notes = verify_metadata(&existing.file, temporary)
                .map_err(|detail| (NotCommittedReason::MetadataPreservationFailed, detail))?;
            self.notes.borrow_mut().extend(notes);
        }

        match flush_fd(self.faults, Step::FlushTemp, temporary.as_raw_fd()) {
            Ok(FlushLevel::Full) => Ok(()),
            Ok(FlushLevel::FsyncOnly) => {
                gaps.push(DurabilityGap::FileFsyncOnly);
                Ok(())
            }
            Err(error) => Err(io_failure("cannot flush the temporary file", error)),
        }
    }

    /// Removes a temporary file this operation created and never installed. A failure to remove is reported, not
    /// hidden.
    fn discard(&self, temp_path: &Path) -> Vec<PathBuf> {
        match self
            .faults
            .enter(Step::RemoveTemp)
            .and_then(|_| fs::remove_file(temp_path))
        {
            Ok(()) => Vec::new(),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Vec::new(),
            Err(_) => vec![temp_path.to_path_buf()],
        }
    }

    fn rename(&self, step: Step, from: &Path, to: &Path, flags: Option<c_uint>) -> io::Result<()> {
        self.faults.enter(step)?;
        match flags {
            None => fs::rename(from, to)?,
            Some(flags) => {
                let (from, to) = (c_path(from)?, c_path(to)?);
                cvt(unsafe { renamex_np(from.as_ptr(), to.as_ptr(), flags) })?;
            }
        }
        self.faults.after(step)
    }

    /// After a failed replacement call, decide from file identities what this operation's rename actually did.
    /// A rename moves the temporary file, so: the temporary file still under its own name means the rename did
    /// not happen; the temporary file's identity at the target (and not under its own name) means it did. Any
    /// other picture, or any failure to look, is `Unknown`. This proves what *this operation* did to the
    /// destination; it says nothing about what other processes may have done to it.
    fn inspect(&self, temp_path: &Path, temp: Identity) -> Placement {
        if self.faults.enter(Step::InspectAfterRename).is_err() {
            return Placement::Unknown;
        }
        let (Ok(target_now), Ok(temp_now)) = (identity_at(self.target), identity_at(temp_path))
        else {
            return Placement::Unknown;
        };
        match (target_now == Some(temp), temp_now == Some(temp)) {
            (true, false) => Placement::Applied,
            (false, true) => Placement::Unchanged,
            _ => Placement::Unknown,
        }
    }

    fn uncertain(&self, temp_path: &Path, detail: String) -> ReplaceOutcome {
        let recovery_paths = if path_exists(temp_path) {
            vec![temp_path.to_path_buf()]
        } else {
            Vec::new()
        };
        ReplaceOutcome::Uncertain {
            detail,
            recovery_paths,
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn commit_rename(
        &self,
        temp_path: &Path,
        temp: Identity,
        step: Step,
        flags: Option<c_uint>,
        replaced: Replaced,
        gaps: Vec<DurabilityGap>,
    ) -> ReplaceOutcome {
        match self.rename(step, temp_path, self.target, flags) {
            Ok(()) => self.finish(replaced, gaps, false, Vec::new()),
            Err(error) => match self.inspect(temp_path, temp) {
                Placement::Applied => self.finish(replaced, gaps, true, Vec::new()),
                Placement::Unchanged => {
                    let reason =
                        if replaced == Replaced::Created && errno_of(&error) == Some(EEXIST) {
                            NotCommittedReason::DestinationAppeared
                        } else {
                            reason_for(&error)
                        };
                    let leftovers = self.discard(temp_path);
                    not_committed(
                        reason,
                        format!("the replacement failed and the destination is unchanged: {error}"),
                        leftovers,
                    )
                }
                Placement::Unknown => self.uncertain(
                    temp_path,
                    format!(
                        "the replacement failed and its effect could not be determined: {error}"
                    ),
                ),
            },
        }
    }

    /// The last check before the rename: the path still holds the file whose metadata was copied (same device and
    /// inode, opened without following links) and, for a conditional write, that file still holds exactly the
    /// expected bytes. Anything else aborts: nothing is replaced, the temporary file is removed, and the caller
    /// decides (`StaleExpected` is reconciled from disk, `TargetChanged` is retried).
    ///
    /// This runs under the per-path lock, so cooperating writers cannot interleave. An external application that
    /// does not take the lock can still write between this check and the rename; that window is documented in the
    /// module header and cannot be closed from here.
    fn verify_target(
        &self,
        existing: &Existing,
        expected: Option<&[u8]>,
        temp_path: &Path,
    ) -> Result<(), ReplaceOutcome> {
        let stale = if expected.is_some() {
            NotCommittedReason::StaleExpected
        } else {
            NotCommittedReason::TargetChanged
        };
        let refuse = |reason: NotCommittedReason, detail: String| {
            let leftovers = self.discard(temp_path);
            Err(not_committed(reason, detail, leftovers))
        };

        if let Err(error) = self.faults.enter(Step::VerifyTarget) {
            return refuse(
                reason_for(&error),
                format!("cannot verify the target before replacing it: {error}"),
            );
        }
        let mut file = match OpenOptions::new()
            .read(true)
            .custom_flags(O_NOFOLLOW)
            .open(self.target)
        {
            Ok(file) => file,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                return refuse(stale, "the target disappeared before it could be replaced".into())
            }
            Err(error) if errno_of(&error) == Some(ELOOP) => {
                return refuse(
                    NotCommittedReason::UnsupportedSymlink,
                    "the target became a symbolic link".into(),
                )
            }
            Err(error) => {
                return refuse(
                    reason_for(&error),
                    format!("cannot reopen the target: {error}"),
                )
            }
        };
        let identity = match file.metadata() {
            Ok(metadata) => Identity::of(&metadata),
            Err(error) => {
                return refuse(
                    reason_for(&error),
                    format!("cannot inspect the target: {error}"),
                )
            }
        };
        if identity != Identity::of(&existing.metadata) {
            return refuse(
                stale,
                "the target was replaced by another file before it could be replaced".into(),
            );
        }
        if let Some(expected) = expected {
            let mut current = Vec::new();
            if let Err(error) = file.read_to_end(&mut current) {
                return refuse(
                    reason_for(&error),
                    format!("cannot read the target: {error}"),
                );
            }
            if current != expected {
                return refuse(
                    NotCommittedReason::StaleExpected,
                    "the target no longer holds the expected content".into(),
                );
            }
        }
        Ok(())
    }

    fn check_volume(&self) -> Result<(), ReplaceOutcome> {
        check_volume_at(self.faults, self.parent, self.request.supported_filesystems)
            .map_err(|(reason, detail)| not_committed(reason, detail, Vec::new()))
    }

    /// Stage 7 onwards: the replacement has happened. Nothing below can undo it.
    fn finish(
        &self,
        replaced: Replaced,
        mut gaps: Vec<DurabilityGap>,
        by_inspection: bool,
        leftovers: Vec<PathBuf>,
    ) -> ReplaceOutcome {
        let synced = File::open(self.parent)
            .and_then(|directory| flush_fd(self.faults, Step::SyncDir, directory.as_raw_fd()));
        match synced {
            Ok(FlushLevel::Full) => {}
            Ok(FlushLevel::FsyncOnly) => gaps.push(DurabilityGap::DirectoryFsyncOnly),
            Err(error) => gaps.push(DurabilityGap::DirectorySyncFailed(error.to_string())),
        }
        ReplaceOutcome::Committed {
            replaced,
            durability: if gaps.is_empty() {
                Durability::Confirmed
            } else {
                Durability::Unconfirmed(gaps)
            },
            confirmed_by_inspection: by_inspection,
            metadata_notes: self.notes.borrow().clone(),
            leftovers,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;
    use std::time::Duration;

    // ---- helpers --------------------------------------------------------------------------------------

    struct Scratch(PathBuf);

    impl Scratch {
        fn new(label: &str) -> Self {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let dir = std::env::temp_dir().join(format!(
                "clutter-atomic-replace-{label}-{}-{nanos}",
                std::process::id()
            ));
            fs::create_dir_all(&dir).unwrap();
            Scratch(fs::canonicalize(dir).unwrap())
        }

        fn path(&self, name: &str) -> PathBuf {
            self.0.join(name)
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            // Tests set flags, ACLs and read-only modes; undo them so the directory can be removed.
            let _ = Command::new("chflags")
                .args(["-R", "nouchg"])
                .arg(&self.0)
                .status();
            let _ = Command::new("chmod")
                .args(["-R", "-N"])
                .arg(&self.0)
                .status();
            let _ = Command::new("chmod")
                .args(["-R", "u+rwX"])
                .arg(&self.0)
                .status();
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn put(path: &Path, bytes: &[u8]) {
        fs::write(path, bytes).unwrap();
    }

    fn temps(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .filter(|name| name.starts_with(TEMP_PREFIX))
            .collect();
        names.sort();
        names
    }

    fn ino(path: &Path) -> u64 {
        fs::symlink_metadata(path).unwrap().ino()
    }

    fn assert_committed(outcome: &ReplaceOutcome) {
        assert!(
            outcome.is_committed(),
            "expected Committed, got {outcome:?}"
        );
    }

    fn not_committed_reason(outcome: &ReplaceOutcome) -> (NotCommittedReason, Vec<PathBuf>) {
        match outcome {
            ReplaceOutcome::NotCommitted {
                reason, leftovers, ..
            } => (reason.clone(), leftovers.clone()),
            other => panic!("expected NotCommitted, got {other:?}"),
        }
    }

    fn step_log() -> (Arc<Mutex<Vec<Step>>>, impl Fn(Step) + Send + Sync + 'static) {
        let log = Arc::new(Mutex::new(Vec::new()));
        let sink = Arc::clone(&log);
        (log, move |step| sink.lock().unwrap().push(step))
    }

    fn acl_lines(path: &Path) -> Vec<String> {
        let output = Command::new("ls").args(["-le"]).arg(path).output().unwrap();
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .skip(1)
            .map(|line| line.trim().to_string())
            .collect()
    }

    fn volume_is_case_insensitive(dir: &Path) -> bool {
        put(&dir.join("CaseProbe"), b"x");
        dir.join("caseprobe").exists()
    }

    // ---- 1. replacing and creating --------------------------------------------------------------------

    #[test]
    fn replaces_an_existing_file_with_the_complete_new_contents() {
        let scratch = Scratch::new("replace");
        let note = scratch.path("note.md");
        put(&note, b"old contents");
        let inode_before = ino(&note);

        let outcome = replace(&ReplaceRequest::new(&note, b"new complete contents"));

        match &outcome {
            ReplaceOutcome::Committed {
                replaced,
                durability,
                confirmed_by_inspection,
                leftovers,
                ..
            } => {
                assert_eq!(*replaced, Replaced::Existing);
                assert_eq!(*durability, Durability::Confirmed);
                assert!(!confirmed_by_inspection);
                assert!(leftovers.is_empty());
            }
            other => panic!("{other:?}"),
        }
        assert_eq!(fs::read(&note).unwrap(), b"new complete contents");
        assert!(temps(&scratch.0).is_empty());
        // Documented: replacement changes inode identity.
        assert_ne!(ino(&note), inode_before);
    }

    #[test]
    fn birth_times_are_compared_exactly_with_a_reported_whole_second_allowance() {
        assert_eq!(compare_birth_times((10, 5), (10, 5)), BirthMatch::Exact);
        assert_eq!(
            compare_birth_times((10, 70_000_000), (10, 0)),
            BirthMatch::WholeSecond
        );
        assert_eq!(compare_birth_times((10, 0), (11, 0)), BirthMatch::Different);
    }

    #[test]
    fn creates_a_missing_file() {
        let scratch = Scratch::new("create");
        let note = scratch.path("fresh.md");

        let outcome = replace(&ReplaceRequest::new(&note, b"brand new"));

        assert!(
            matches!(
                &outcome,
                ReplaceOutcome::Committed {
                    replaced: Replaced::Created,
                    ..
                }
            ),
            "{outcome:?}"
        );
        assert_eq!(fs::read(&note).unwrap(), b"brand new");
        assert_eq!(
            fs::metadata(&note).unwrap().mode() & 0o111,
            0,
            "a new note must not be executable"
        );
        assert!(temps(&scratch.0).is_empty());
    }

    #[test]
    fn a_destination_that_appears_during_a_create_is_never_overwritten() {
        let scratch = Scratch::new("appears");
        let note = scratch.path("race.md");
        let appearing = note.clone();
        let faults = Faults::none().observe(move |step| {
            if step == Step::RenameExcl {
                fs::write(&appearing, b"somebody else's note").unwrap();
            }
        });

        let outcome = replace_with(&ReplaceRequest::new(&note, b"mine"), &faults);

        let (reason, leftovers) = not_committed_reason(&outcome);
        assert_eq!(reason, NotCommittedReason::DestinationAppeared);
        assert!(leftovers.is_empty());
        assert_eq!(fs::read(&note).unwrap(), b"somebody else's note");
        assert!(temps(&scratch.0).is_empty());
    }

    // ---- 2. metadata ----------------------------------------------------------------------------------

    #[test]
    fn metadata_of_an_existing_file_is_preserved_and_the_modification_time_is_new() {
        let scratch = Scratch::new("metadata");
        let note = scratch.path("note.md");
        put(&note, b"old");
        fs::set_permissions(&note, std::os::unix::fs::PermissionsExt::from_mode(0o640)).unwrap();
        for args in [
            vec!["-w", "com.test.custom", "hello"],
            vec![
                "-wx",
                "com.apple.metadata:_kMDItemUserTags",
                "62706c6973743030a1015352656400086f",
            ],
        ] {
            assert!(Command::new("xattr")
                .args(args)
                .arg(&note)
                .status()
                .unwrap()
                .success());
        }
        assert!(Command::new("chflags")
            .arg("nodump")
            .arg(&note)
            .status()
            .unwrap()
            .success());
        assert!(Command::new("chmod")
            .args(["+a", "everyone allow read"])
            .arg(&note)
            .status()
            .unwrap()
            .success());
        {
            let file = OpenOptions::new().write(true).open(&note).unwrap();
            set_birth_time(file.as_raw_fd(), 1_577_836_800, 123_000_000).unwrap(); // 2020-01-01
            file.set_modified(UNIX_EPOCH + Duration::from_secs(1_609_459_200))
                .unwrap(); // 2021-01-01
        }
        let before = fs::metadata(&note).unwrap();
        let attributes_before = read_xattrs(&File::open(&note).unwrap()).unwrap();
        let acl_before = acl_lines(&note);
        assert!(
            !acl_before.is_empty(),
            "the test volume must support ACLs for this test"
        );
        let started = SystemTime::now();

        let outcome = replace(&ReplaceRequest::new(&note, b"new"));

        assert_committed(&outcome);
        let after = fs::metadata(&note).unwrap();
        assert_eq!(fs::read(&note).unwrap(), b"new");
        assert_eq!(after.mode() & 0o7777, 0o640);
        assert_eq!((after.uid(), after.gid()), (before.uid(), before.gid()));
        assert_eq!(after.st_flags(), before.st_flags());
        assert_eq!(
            (after.st_birthtime(), after.st_birthtime_nsec()),
            (1_577_836_800, 123_000_000)
        );
        let attributes_after = read_xattrs(&File::open(&note).unwrap()).unwrap();
        for (name, value) in &attributes_before {
            assert_eq!(
                attributes_after.get(name),
                Some(value),
                "xattr {}",
                String::from_utf8_lossy(name)
            );
        }
        assert_eq!(acl_lines(&note), acl_before);
        let modified = after.modified().unwrap();
        assert!(
            modified >= started - Duration::from_secs(2),
            "mtime must be the time of the new write"
        );
        assert_ne!(
            modified,
            before.modified().unwrap(),
            "the old modification time must not survive"
        );
    }

    #[test]
    fn the_durability_barrier_is_the_last_change_to_the_temporary_file() {
        let scratch = Scratch::new("order");
        let note = scratch.path("note.md");
        put(&note, b"old");
        let (log, observer) = step_log();

        assert_committed(&replace_with(
            &ReplaceRequest::new(&note, b"new"),
            &Faults::none().observe(observer),
        ));

        assert_eq!(
            *log.lock().unwrap(),
            vec![
                Step::StatTarget,
                Step::CheckVolume,
                Step::CreateTemp,
                Step::LockTemp,
                Step::WriteData,
                Step::CopyMetadata,
                Step::SetBirthTime,
                Step::SetMtime,
                Step::VerifyMetadata,
                Step::FlushTemp,
                // The final look at the target comes after the flush and changes nothing in the temporary file.
                Step::VerifyTarget,
                Step::RenameOver,
                Step::SyncDir
            ]
        );

        let fresh = scratch.path("fresh.md");
        let (log, observer) = step_log();
        assert_committed(&replace_with(
            &ReplaceRequest::new(&fresh, b"new"),
            &Faults::none().observe(observer),
        ));
        assert_eq!(
            *log.lock().unwrap(),
            vec![
                Step::StatTarget,
                Step::CheckVolume,
                Step::CreateTemp,
                Step::LockTemp,
                Step::WriteData,
                Step::FlushTemp,
                Step::RenameExcl,
                Step::SyncDir
            ]
        );
    }

    // ---- 3. refusals ----------------------------------------------------------------------------------

    #[test]
    fn read_only_targets_are_refused() {
        let scratch = Scratch::new("readonly");
        let note = scratch.path("note.md");
        put(&note, b"precious");
        fs::set_permissions(&note, std::os::unix::fs::PermissionsExt::from_mode(0o444)).unwrap();

        let outcome = replace(&ReplaceRequest::new(&note, b"new"));
        assert_eq!(
            not_committed_reason(&outcome).0,
            NotCommittedReason::ReadOnlyTarget
        );
        assert_eq!(fs::read(&note).unwrap(), b"precious");

        // The immutable flag is the other way a file is "read-only".
        let locked = scratch.path("locked.md");
        put(&locked, b"locked");
        assert!(Command::new("chflags")
            .arg("uchg")
            .arg(&locked)
            .status()
            .unwrap()
            .success());
        let outcome = replace(&ReplaceRequest::new(&locked, b"new"));
        assert_eq!(
            not_committed_reason(&outcome).0,
            NotCommittedReason::ReadOnlyTarget
        );
        assert_eq!(fs::read(&locked).unwrap(), b"locked");
        assert!(temps(&scratch.0).is_empty());
    }

    #[test]
    fn symlink_targets_are_refused_and_nothing_is_written_through_them() {
        let scratch = Scratch::new("symlink");
        let real = scratch.path("real.md");
        let link = scratch.path("link.md");
        put(&real, b"real");
        std::os::unix::fs::symlink("real.md", &link).unwrap();

        let outcome = replace(&ReplaceRequest::new(&link, b"new"));
        assert_eq!(
            not_committed_reason(&outcome).0,
            NotCommittedReason::UnsupportedSymlink
        );
        assert!(fs::symlink_metadata(&link)
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(fs::read(&real).unwrap(), b"real");

        // A dangling link must not be "created through" either.
        let dangling = scratch.path("dangling.md");
        std::os::unix::fs::symlink("nowhere.md", &dangling).unwrap();
        let outcome = replace(&ReplaceRequest::new(&dangling, b"new"));
        assert_eq!(
            not_committed_reason(&outcome).0,
            NotCommittedReason::UnsupportedSymlink
        );
        assert!(!scratch.path("nowhere.md").exists());
        assert!(temps(&scratch.0).is_empty());
    }

    #[test]
    fn a_directory_target_is_refused() {
        let scratch = Scratch::new("directory");
        fs::create_dir(scratch.path("folder.md")).unwrap();
        let outcome = replace(&ReplaceRequest::new(&scratch.path("folder.md"), b"new"));
        assert_eq!(
            not_committed_reason(&outcome).0,
            NotCommittedReason::NotARegularFile
        );
    }

    #[test]
    fn targets_outside_the_scope_root_are_refused() {
        let scratch = Scratch::new("scope");
        let vault = scratch.path("vault");
        let outside = scratch.path("outside");
        fs::create_dir_all(&vault).unwrap();
        fs::create_dir_all(&outside).unwrap();
        std::os::unix::fs::symlink(&outside, vault.join("escape")).unwrap();

        let inside = vault.join("ok.md");
        fn scoped<'a>(path: &'a Path, root: &'a Path) -> ReplaceRequest<'a> {
            ReplaceRequest {
                scope_root: Some(root),
                ..ReplaceRequest::new(path, b"x")
            }
        }
        assert_committed(&replace(&scoped(&inside, &vault)));

        let cases = [
            outside.join("a.md"),
            vault.join("..").join("outside").join("b.md"),
            vault.join("escape").join("c.md"),
        ];
        for case in &cases {
            let outcome = replace(&scoped(case, &vault));
            assert_eq!(
                not_committed_reason(&outcome).0,
                NotCommittedReason::OutOfScope,
                "{}",
                case.display()
            );
        }
        assert_eq!(
            fs::read_dir(&outside).unwrap().count(),
            0,
            "nothing may be written outside the scope"
        );
    }

    #[test]
    fn hard_links_are_broken_by_replacement() {
        let scratch = Scratch::new("hardlink");
        let (a, b) = (scratch.path("a.md"), scratch.path("b.md"));
        put(&a, b"shared");
        fs::hard_link(&a, &b).unwrap();

        assert_committed(&replace(&ReplaceRequest::new(&a, b"new")));

        assert_eq!(fs::read(&a).unwrap(), b"new");
        assert_eq!(
            fs::read(&b).unwrap(),
            b"shared",
            "the other name keeps the old file"
        );
        assert_ne!(ino(&a), ino(&b));
    }

    #[test]
    fn a_deny_delete_acl_blocks_replacement_and_any_unremovable_temporary_file_is_reported() {
        // Replacing a file by rename deletes the old name, so an ACL that denies delete refuses the write. The ACL
        // is copied to the temporary file too, which can then not be removed: that must be reported, not hidden.
        // (In-place writing, the old behaviour, was not blocked by this ACL: a documented regression for such files.)
        let scratch = Scratch::new("acl-delete");
        let note = scratch.path("note.md");
        put(&note, b"protected");
        assert!(Command::new("chmod")
            .args(["+a", "everyone deny delete"])
            .arg(&note)
            .status()
            .unwrap()
            .success());

        let outcome = replace(&ReplaceRequest::new(&note, b"new"));

        let (reason, leftovers) = not_committed_reason(&outcome);
        assert_eq!(reason, NotCommittedReason::PermissionDenied);
        assert_eq!(fs::read(&note).unwrap(), b"protected");
        for leftover in &leftovers {
            assert!(leftover.exists(), "a reported leftover must exist");
        }
        assert_eq!(
            temps(&scratch.0).len(),
            leftovers.len(),
            "every remaining temporary file is reported"
        );
    }

    // ---- 4. names -------------------------------------------------------------------------------------

    #[test]
    fn temporary_names_have_a_fixed_length_so_long_target_names_work() {
        assert_eq!(temp_name().len(), TEMP_NAME_LEN);
        assert_eq!(temp_name().len(), temp_name().len());
        assert_ne!(temp_name(), temp_name());

        let scratch = Scratch::new("long");
        let name = format!("{}.md", "n".repeat(252)); // 255 bytes: the filesystem maximum
        assert_eq!(name.len(), 255);
        let note = scratch.path(&name);

        assert_committed(&replace(&ReplaceRequest::new(&note, b"created")));
        assert_committed(&replace(&ReplaceRequest::new(&note, b"replaced")));
        assert_eq!(fs::read(&note).unwrap(), b"replaced");
        let conditional = ReplaceRequest {
            intent: Intent::ReplaceIfContent(b"replaced"),
            ..ReplaceRequest::new(&note, b"third")
        };
        assert_committed(&replace(&conditional));
        assert_eq!(fs::read(&note).unwrap(), b"third");
    }

    #[test]
    fn replacing_through_a_differently_cased_path_keeps_the_on_disk_name() {
        let scratch = Scratch::new("case");
        if !volume_is_case_insensitive(&scratch.0) {
            eprintln!("SKIPPED: the test volume is case-sensitive");
            return;
        }
        put(&scratch.path("Note.md"), b"old");

        assert_committed(&replace(&ReplaceRequest::new(
            &scratch.path("note.md"),
            b"new",
        )));

        let names: Vec<String> = fs::read_dir(&scratch.0)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert!(
            names.contains(&"Note.md".to_string()) && !names.contains(&"note.md".to_string()),
            "{names:?}"
        );
        assert_eq!(fs::read(scratch.path("Note.md")).unwrap(), b"new");
    }

    // ---- 5. expected content and concurrency ------------------------------------------------------------

    #[test]
    fn a_stale_expectation_refuses_to_overwrite_and_changes_nothing() {
        let scratch = Scratch::new("stale");
        let note = scratch.path("note.md");
        put(&note, b"current");
        let inode_before = ino(&note);

        let stale = ReplaceRequest {
            intent: Intent::ReplaceIfContent(b"older"),
            ..ReplaceRequest::new(&note, b"repair")
        };
        let outcome = replace(&stale);
        assert_eq!(
            not_committed_reason(&outcome).0,
            NotCommittedReason::StaleExpected
        );
        assert_eq!(fs::read(&note).unwrap(), b"current");
        assert_eq!(ino(&note), inode_before);
        assert!(temps(&scratch.0).is_empty());

        let gone = scratch.path("gone.md");
        let missing = ReplaceRequest {
            intent: Intent::ReplaceIfContent(b"x"),
            ..ReplaceRequest::new(&gone, b"repair")
        };
        assert_eq!(
            not_committed_reason(&replace(&missing)).0,
            NotCommittedReason::StaleExpected
        );
        assert!(
            !scratch.path("gone.md").exists(),
            "a conditional write never creates a file"
        );

        let fresh = ReplaceRequest {
            intent: Intent::ReplaceIfContent(b"current"),
            ..ReplaceRequest::new(&note, b"repair")
        };
        assert_committed(&replace(&fresh));
        assert_eq!(fs::read(&note).unwrap(), b"repair");
        assert!(
            temps(&scratch.0).is_empty(),
            "the displaced old file must be removed"
        );
    }

    #[test]
    fn an_external_write_between_the_early_and_the_final_comparison_is_detected() {
        let scratch = Scratch::new("external");
        let note = scratch.path("note.md");
        put(&note, b"expected");
        let target = note.clone();
        let faults = Faults::none().observe(move |step| {
            if step == Step::VerifyTarget {
                // An external editor saves in place after the writer's first comparison passed.
                fs::write(&target, b"external, newer").unwrap();
            }
        });
        let request = ReplaceRequest {
            intent: Intent::ReplaceIfContent(b"expected"),
            ..ReplaceRequest::new(&note, b"repair")
        };

        let outcome = replace_with(&request, &faults);

        assert_eq!(
            not_committed_reason(&outcome).0,
            NotCommittedReason::StaleExpected
        );
        assert_eq!(
            fs::read(&note).unwrap(),
            b"external, newer",
            "the newer external content must survive"
        );
        assert!(temps(&scratch.0).is_empty());
    }

    #[test]
    fn a_target_deleted_before_the_final_check_is_stale_not_recreated() {
        let scratch = Scratch::new("vanish");
        let note = scratch.path("note.md");
        put(&note, b"expected");
        let target = note.clone();
        let faults = Faults::none().observe(move |step| {
            if step == Step::VerifyTarget {
                fs::remove_file(&target).unwrap();
            }
        });
        let request = ReplaceRequest {
            intent: Intent::ReplaceIfContent(b"expected"),
            ..ReplaceRequest::new(&note, b"repair")
        };

        let outcome = replace_with(&request, &faults);

        assert_eq!(
            not_committed_reason(&outcome).0,
            NotCommittedReason::StaleExpected
        );
        assert!(!note.exists());
        assert!(temps(&scratch.0).is_empty());
    }

    #[test]
    fn concurrent_replacements_never_leave_or_expose_torn_contents() {
        let scratch = Scratch::new("torn");
        let note = scratch.path("note.md");
        const SIZE: usize = 256 * 1024;
        put(&note, &vec![b'z'; SIZE]);
        let done = Arc::new(std::sync::atomic::AtomicBool::new(false));

        let reader = {
            let (note, done) = (note.clone(), Arc::clone(&done));
            std::thread::spawn(move || {
                let mut reads = 0u32;
                while !done.load(Ordering::SeqCst) {
                    let content = fs::read(&note).unwrap();
                    assert_eq!(content.len(), SIZE, "a reader saw a truncated file");
                    assert!(
                        content.iter().all(|byte| *byte == content[0]),
                        "a reader saw mixed contents"
                    );
                    reads += 1;
                }
                reads
            })
        };
        let writers: Vec<_> = (0..4u8)
            .map(|id| {
                let note = note.clone();
                std::thread::spawn(move || {
                    let block = vec![b'a' + id; SIZE];
                    for _ in 0..12 {
                        assert_committed(&replace(&ReplaceRequest::new(&note, &block)));
                    }
                })
            })
            .collect();
        for writer in writers {
            writer.join().unwrap();
        }
        done.store(true, Ordering::SeqCst);
        assert!(reader.join().unwrap() > 0);

        let content = fs::read(&note).unwrap();
        assert!(content.iter().all(|byte| *byte == content[0]) && content.len() == SIZE);
        assert!(temps(&scratch.0).is_empty());
    }

    #[test]
    fn conditional_replacements_lose_no_update() {
        let scratch = Scratch::new("cas");
        let note = scratch.path("counter.md");
        put(&note, b"0");
        let successes = Arc::new(std::sync::atomic::AtomicU64::new(0));

        let threads: Vec<_> = (0..4)
            .map(|_| {
                let (note, successes) = (note.clone(), Arc::clone(&successes));
                std::thread::spawn(move || {
                    for _ in 0..15 {
                        let current = fs::read(&note).unwrap();
                        let next = (String::from_utf8(current.clone())
                            .unwrap()
                            .parse::<u64>()
                            .unwrap()
                            + 1)
                        .to_string();
                        let request = ReplaceRequest {
                            intent: Intent::ReplaceIfContent(&current),
                            ..ReplaceRequest::new(&note, next.as_bytes())
                        };
                        match replace(&request) {
                            ReplaceOutcome::Committed { .. } => {
                                successes.fetch_add(1, Ordering::SeqCst);
                            }
                            ReplaceOutcome::NotCommitted {
                                reason: NotCommittedReason::StaleExpected,
                                ..
                            } => {}
                            other => panic!("{other:?}"),
                        }
                    }
                })
            })
            .collect();
        for thread in threads {
            thread.join().unwrap();
        }

        let final_value: u64 = String::from_utf8(fs::read(&note).unwrap())
            .unwrap()
            .parse()
            .unwrap();
        assert_eq!(
            final_value,
            successes.load(Ordering::SeqCst),
            "every committed increment must be visible"
        );
        assert!(final_value > 0);
        assert!(temps(&scratch.0).is_empty());
    }

    #[test]
    fn a_target_replaced_by_another_file_with_equal_content_is_still_stale() {
        let scratch = Scratch::new("same-bytes");
        let note = scratch.path("note.md");
        put(&note, b"expected");
        let target = note.clone();
        let faults = Faults::none().observe(move |step| {
            if step == Step::VerifyTarget {
                // Another application replaces the file (new inode), content unchanged.
                let other = target.with_file_name("other-app.tmp");
                fs::write(&other, b"expected").unwrap();
                fs::rename(&other, &target).unwrap();
            }
        });
        let request = ReplaceRequest {
            intent: Intent::ReplaceIfContent(b"expected"),
            ..ReplaceRequest::new(&note, b"repair")
        };

        let outcome = replace_with(&request, &faults);

        assert_eq!(
            not_committed_reason(&outcome).0,
            NotCommittedReason::StaleExpected
        );
        assert_eq!(fs::read(&note).unwrap(), b"expected");
        assert!(temps(&scratch.0).is_empty());
    }

    #[test]
    fn an_unconditional_write_refuses_when_the_file_was_replaced_meanwhile_and_is_retryable() {
        let scratch = Scratch::new("replaced");
        let note = scratch.path("note.md");
        put(&note, b"old");
        let target = note.clone();
        let replaced = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let flag = Arc::clone(&replaced);
        let faults = Faults::none().observe(move |step| {
            if step == Step::VerifyTarget && !flag.swap(true, Ordering::SeqCst) {
                let other = target.with_file_name("other-app.tmp");
                fs::write(&other, b"external, newer").unwrap();
                fs::rename(&other, &target).unwrap();
            }
        });

        let outcome = replace_with(&ReplaceRequest::new(&note, b"new"), &faults);

        assert_eq!(
            not_committed_reason(&outcome).0,
            NotCommittedReason::TargetChanged
        );
        assert_eq!(
            fs::read(&note).unwrap(),
            b"external, newer",
            "the other application's file must not be overwritten by a stale copy of its metadata"
        );
        assert!(temps(&scratch.0).is_empty());

        // A retry starts again from the file that is there now.
        assert_committed(&replace(&ReplaceRequest::new(&note, b"new")));
        assert_eq!(fs::read(&note).unwrap(), b"new");
    }

    #[test]
    fn an_unconditional_write_whose_target_vanished_is_refused_not_recreated() {
        let scratch = Scratch::new("vanished");
        let note = scratch.path("note.md");
        put(&note, b"old");
        let target = note.clone();
        let faults = Faults::none().observe(move |step| {
            if step == Step::VerifyTarget {
                fs::remove_file(&target).unwrap();
            }
        });

        let outcome = replace_with(&ReplaceRequest::new(&note, b"new"), &faults);

        assert_eq!(
            not_committed_reason(&outcome).0,
            NotCommittedReason::TargetChanged
        );
        assert!(!note.exists() && temps(&scratch.0).is_empty());
    }

    /// The documented limit (ADR-063, decision 6): an external application does not take Clutter's lock, so a
    /// write that lands after the final check and before the rename is overwritten. This test pins that behaviour
    /// so nobody mistakes the final check for a guarantee against external writers.
    #[test]
    fn known_window_an_external_write_after_the_final_check_is_overwritten() {
        let scratch = Scratch::new("window");
        let note = scratch.path("note.md");
        put(&note, b"expected");
        let target = note.clone();
        let faults = Faults::none().observe(move |step| {
            if step == Step::RenameOver {
                fs::write(&target, b"external, in the window").unwrap();
            }
        });
        let request = ReplaceRequest {
            intent: Intent::ReplaceIfContent(b"expected"),
            ..ReplaceRequest::new(&note, b"repair")
        };

        let outcome = replace_with(&request, &faults);

        assert_committed(&outcome);
        assert_eq!(fs::read(&note).unwrap(), b"repair");
    }

    // ---- 5b. volume and directory policy ------------------------------------------------------------------

    fn volume_type_of(dir: &Path) -> String {
        let directory = File::open(dir).unwrap();
        let mut info: Statfs = unsafe { std::mem::zeroed() };
        assert_eq!(unsafe { fstatfs(directory.as_raw_fd(), &mut info) }, 0);
        let length = info.f_fstypename.iter().position(|b| *b == 0).unwrap();
        String::from_utf8_lossy(&info.f_fstypename[..length]).to_string()
    }

    #[test]
    fn the_default_policy_accepts_apfs_and_nothing_is_written_to_other_volumes() {
        let scratch = Scratch::new("volume");
        let note = scratch.path("note.md");
        put(&note, b"old");

        // The scratch directory is on this machine's data volume.
        assert_eq!(volume_type_of(&scratch.0), "apfs");
        assert_committed(&replace(&ReplaceRequest::new(&note, b"new")));

        // A volume that is not on the list is refused before anything is created: no temporary file, no write.
        let request = ReplaceRequest {
            supported_filesystems: &["exfat"],
            ..ReplaceRequest::new(&note, b"unsafe")
        };
        let outcome = replace(&request);
        assert_eq!(
            not_committed_reason(&outcome).0,
            NotCommittedReason::UnsupportedFilesystem
        );
        assert_eq!(fs::read(&note).unwrap(), b"new");
        assert!(temps(&scratch.0).is_empty());

        let fresh = scratch.path("fresh.md");
        let outcome = replace(&ReplaceRequest {
            supported_filesystems: &[],
            ..ReplaceRequest::new(&fresh, b"unsafe")
        });
        assert_eq!(
            not_committed_reason(&outcome).0,
            NotCommittedReason::UnsupportedFilesystem
        );
        assert!(!fresh.exists() && temps(&scratch.0).is_empty());
    }

    #[test]
    fn a_read_only_directory_refuses_the_save_and_leaves_the_old_file_untouched() {
        use std::os::unix::fs::PermissionsExt;
        let scratch = Scratch::new("ro-dir");
        let folder = scratch.path("locked");
        fs::create_dir(&folder).unwrap();
        let note = folder.join("note.md");
        put(&note, b"old");
        let inode_before = ino(&note);
        fs::set_permissions(&folder, fs::Permissions::from_mode(0o555)).unwrap();

        let existing = replace(&ReplaceRequest::new(&note, b"new"));
        let created = replace(&ReplaceRequest::new(&folder.join("fresh.md"), b"new"));

        // Restore before asserting, so a failure cannot leave an undeletable scratch directory behind.
        fs::set_permissions(&folder, fs::Permissions::from_mode(0o755)).unwrap();
        assert_eq!(
            not_committed_reason(&existing).0,
            NotCommittedReason::PermissionDenied,
            "{existing:?}"
        );
        assert_eq!(
            not_committed_reason(&created).0,
            NotCommittedReason::PermissionDenied,
            "{created:?}"
        );
        assert_eq!(fs::read(&note).unwrap(), b"old");
        assert_eq!(ino(&note), inode_before);
        assert!(temps(&folder).is_empty() && !folder.join("fresh.md").exists());
    }

    // ---- 6. failure contract ----------------------------------------------------------------------------

    #[test]
    fn failures_before_the_replacement_leave_the_old_file_untouched() {
        let cases = [
            (Step::CreateTemp, EIO, NotCommittedReason::Io),
            (Step::LockTemp, EIO, NotCommittedReason::Io),
            (
                Step::WriteData,
                ENOSPC,
                NotCommittedReason::InsufficientSpace,
            ),
            (
                Step::CopyMetadata,
                EIO,
                NotCommittedReason::MetadataPreservationFailed,
            ),
            (
                Step::SetBirthTime,
                EIO,
                NotCommittedReason::MetadataPreservationFailed,
            ),
            (Step::SetMtime, EIO, NotCommittedReason::Io),
            (
                Step::VerifyMetadata,
                EIO,
                NotCommittedReason::MetadataPreservationFailed,
            ),
            (Step::FlushTemp, EIO, NotCommittedReason::Io),
        ];
        for (step, errno, expected) in cases {
            let scratch = Scratch::new("early");
            let note = scratch.path("note.md");
            put(&note, b"old");
            let inode_before = ino(&note);

            let outcome = replace_with(
                &ReplaceRequest::new(&note, b"new"),
                &Faults::none().fail(step, errno),
            );

            let (reason, leftovers) = not_committed_reason(&outcome);
            assert_eq!(reason, expected, "{step:?}");
            assert!(leftovers.is_empty(), "{step:?}");
            assert_eq!(fs::read(&note).unwrap(), b"old", "{step:?}");
            assert_eq!(ino(&note), inode_before, "{step:?}");
            assert!(
                temps(&scratch.0).is_empty(),
                "{step:?} must not leave a temporary file"
            );
        }

        let scratch = Scratch::new("early-new");
        let fresh = scratch.path("fresh.md");
        let outcome = replace_with(
            &ReplaceRequest::new(&fresh, b"new"),
            &Faults::none().fail(Step::WriteData, ENOSPC),
        );
        assert_eq!(
            not_committed_reason(&outcome).0,
            NotCommittedReason::InsufficientSpace
        );
        assert!(!fresh.exists() && temps(&scratch.0).is_empty());
    }

    #[test]
    fn a_temporary_file_that_cannot_be_removed_is_reported_not_hidden() {
        let scratch = Scratch::new("leftover");
        let note = scratch.path("note.md");
        put(&note, b"old");
        let faults = Faults::none()
            .fail(Step::WriteData, ENOSPC)
            .fail(Step::RemoveTemp, EIO);

        let outcome = replace_with(&ReplaceRequest::new(&note, b"new"), &faults);

        let (_, leftovers) = not_committed_reason(&outcome);
        assert_eq!(leftovers.len(), 1);
        assert!(leftovers[0].exists());
        assert_eq!(fs::read(&note).unwrap(), b"old");
    }

    #[test]
    fn a_rename_that_fails_without_effect_is_not_committed() {
        let scratch = Scratch::new("rename-fails");
        let note = scratch.path("note.md");
        put(&note, b"old");
        let inode_before = ino(&note);

        let outcome = replace_with(
            &ReplaceRequest::new(&note, b"new"),
            &Faults::none().fail(Step::RenameOver, EACCES),
        );

        assert_eq!(
            not_committed_reason(&outcome).0,
            NotCommittedReason::PermissionDenied
        );
        assert_eq!(fs::read(&note).unwrap(), b"old");
        assert_eq!(ino(&note), inode_before);
        assert!(temps(&scratch.0).is_empty());
    }

    #[test]
    fn a_rename_that_reports_an_error_after_taking_effect_is_committed() {
        let scratch = Scratch::new("rename-after");
        let note = scratch.path("note.md");
        put(&note, b"old");

        let outcome = replace_with(
            &ReplaceRequest::new(&note, b"new"),
            &Faults::none().fail_after_effect(Step::RenameOver, EIO),
        );

        assert!(
            matches!(
                &outcome,
                ReplaceOutcome::Committed {
                    confirmed_by_inspection: true,
                    ..
                }
            ),
            "{outcome:?}"
        );
        assert_eq!(fs::read(&note).unwrap(), b"new");

        let fresh = scratch.path("fresh.md");
        let outcome = replace_with(
            &ReplaceRequest::new(&fresh, b"x"),
            &Faults::none().fail_after_effect(Step::RenameExcl, EIO),
        );
        assert!(
            matches!(
                &outcome,
                ReplaceOutcome::Committed {
                    confirmed_by_inspection: true,
                    replaced: Replaced::Created,
                    ..
                }
            ),
            "{outcome:?}"
        );
    }

    #[test]
    fn an_ambiguous_rename_error_is_never_classified_as_not_committed() {
        let scratch = Scratch::new("ambiguous");
        let note = scratch.path("note.md");
        put(&note, b"old");
        let dir = scratch.0.clone();
        // The error comes with the temporary file vanishing: neither "unchanged" nor "applied" can be proven.
        let faults = Faults::none()
            .fail(Step::RenameOver, EIO)
            .observe(move |step| {
                if step == Step::RenameOver {
                    for name in temps(&dir) {
                        fs::remove_file(dir.join(name)).unwrap();
                    }
                }
            });

        let outcome = replace_with(&ReplaceRequest::new(&note, b"new"), &faults);

        assert!(
            matches!(outcome, ReplaceOutcome::Uncertain { .. }),
            "{outcome:?}"
        );
    }

    #[test]
    fn when_inspection_itself_fails_the_outcome_is_uncertain_and_the_new_revision_is_kept() {
        let scratch = Scratch::new("inspect-fails");
        let note = scratch.path("note.md");
        put(&note, b"old");
        let faults = Faults::none()
            .fail(Step::RenameOver, EIO)
            .fail(Step::InspectAfterRename, EIO);

        let outcome = replace_with(&ReplaceRequest::new(&note, b"new revision"), &faults);

        let ReplaceOutcome::Uncertain { recovery_paths, .. } = &outcome else {
            panic!("{outcome:?}")
        };
        assert_eq!(recovery_paths.len(), 1);
        assert_eq!(
            fs::read(&recovery_paths[0]).unwrap(),
            b"new revision",
            "the temporary file may hold the only copy"
        );
        assert_eq!(fs::read(&note).unwrap(), b"old");
        assert_eq!(
            temps(&scratch.0).len(),
            1,
            "nothing may be deleted after an uncertain outcome"
        );
    }

    #[test]
    fn unsupported_filesystem_operations_are_refused_never_downgraded() {
        let scratch = Scratch::new("unsupported");
        let fresh = scratch.path("fresh.md");
        let outcome = replace_with(
            &ReplaceRequest::new(&fresh, b"x"),
            &Faults::none().fail(Step::RenameExcl, ENOTSUP),
        );
        assert_eq!(
            not_committed_reason(&outcome).0,
            NotCommittedReason::UnsupportedOperation
        );
        assert!(!fresh.exists() && temps(&scratch.0).is_empty());

        // An existing file is replaced with a plain rename, which every supported volume has; a refusal of
        // that step is reported and the old file stays.
        let note = scratch.path("note.md");
        put(&note, b"old");
        let outcome = replace_with(
            &ReplaceRequest::new(&note, b"x"),
            &Faults::none().fail(Step::RenameOver, ENOTSUP),
        );
        assert_eq!(
            not_committed_reason(&outcome).0,
            NotCommittedReason::UnsupportedOperation
        );
        assert_eq!(fs::read(&note).unwrap(), b"old");
        assert!(temps(&scratch.0).is_empty());
    }

    // ---- 7. durability ------------------------------------------------------------------------------------

    #[test]
    fn a_directory_sync_failure_after_the_replacement_is_committed_with_unconfirmed_durability() {
        let scratch = Scratch::new("dirsync");
        let note = scratch.path("note.md");
        put(&note, b"old");

        let outcome = replace_with(
            &ReplaceRequest::new(&note, b"new"),
            &Faults::none().fail(Step::SyncDir, EIO),
        );

        let ReplaceOutcome::Committed {
            durability: Durability::Unconfirmed(gaps),
            ..
        } = &outcome
        else {
            panic!("{outcome:?}")
        };
        assert!(
            matches!(gaps.as_slice(), [DurabilityGap::DirectorySyncFailed(_)]),
            "{gaps:?}"
        );
        assert_eq!(
            fs::read(&note).unwrap(),
            b"new",
            "the new contents are already visible"
        );
    }

    #[test]
    fn a_volume_without_full_sync_falls_back_to_fsync_and_says_so() {
        let scratch = Scratch::new("fsync-only");
        let note = scratch.path("note.md");
        put(&note, b"old");

        let outcome = replace_with(
            &ReplaceRequest::new(&note, b"new"),
            &Faults::none()
                .fail(Step::FlushTemp, ENOTSUP)
                .fail(Step::SyncDir, ENOTSUP),
        );

        let ReplaceOutcome::Committed {
            durability: Durability::Unconfirmed(gaps),
            ..
        } = &outcome
        else {
            panic!("{outcome:?}")
        };
        assert_eq!(
            gaps,
            &vec![
                DurabilityGap::FileFsyncOnly,
                DurabilityGap::DirectoryFsyncOnly
            ]
        );
        assert_eq!(fs::read(&note).unwrap(), b"new");
    }

    // ---- 8. recovery safety -------------------------------------------------------------------------------

    #[test]
    fn an_orphaned_temporary_file_is_never_deleted_by_a_later_write() {
        let scratch = Scratch::new("orphan");
        let orphan = scratch.path(&format!("{TEMP_PREFIX}deadbeef.00000000.0000000000000000"));
        put(&orphan, b"a complete newer revision from a crashed run");
        let note = scratch.path("note.md");
        put(&note, b"old");

        assert_committed(&replace(&ReplaceRequest::new(&note, b"new")));

        assert_eq!(
            fs::read(&orphan).unwrap(),
            b"a complete newer revision from a crashed run"
        );
    }

    // ---- 8. intents: a create stays a create, a replace never creates ------------------------------------

    #[test]
    fn a_create_never_replaces_an_existing_file() {
        let scratch = Scratch::new("create-exists");
        let note = scratch.path("note.md");
        put(&note, b"someone else's");
        let inode = ino(&note);

        let outcome = replace(&ReplaceRequest::create(&note, b"mine"));

        assert_eq!(
            not_committed_reason(&outcome).0,
            NotCommittedReason::DestinationExists
        );
        assert_eq!(fs::read(&note).unwrap(), b"someone else's");
        assert_eq!(ino(&note), inode);
        assert!(temps(&scratch.0).is_empty());
    }

    #[test]
    fn a_retried_create_is_still_a_create_and_cannot_overwrite_a_file_made_in_between() {
        let scratch = Scratch::new("create-retry");
        let note = scratch.path("note.md");

        // First attempt fails before the replacement (the disk was full, say).
        let first = replace_with(
            &ReplaceRequest::create(&note, b"mine"),
            &Faults::none().fail(Step::WriteData, ENOSPC),
        );
        assert_eq!(
            not_committed_reason(&first).0,
            NotCommittedReason::InsufficientSpace
        );
        assert!(!note.exists());

        // Another process creates the file before the retry.
        put(&note, b"another process's file");

        // The retry carries the same intent and refuses, instead of treating "a file exists" as leave to replace it.
        let retry = replace(&ReplaceRequest::create(&note, b"mine"));
        assert_eq!(
            not_committed_reason(&retry).0,
            NotCommittedReason::DestinationExists
        );
        assert_eq!(fs::read(&note).unwrap(), b"another process's file");
        assert!(temps(&scratch.0).is_empty());
    }

    #[test]
    fn a_create_that_loses_the_race_at_the_rename_is_refused_by_the_kernel() {
        let scratch = Scratch::new("create-race");
        let note = scratch.path("note.md");
        let target = note.clone();
        let faults = Faults::none().observe(move |step| {
            if step == Step::RenameExcl {
                fs::write(&target, b"appeared first").unwrap();
            }
        });

        let outcome = replace_with(&ReplaceRequest::create(&note, b"mine"), &faults);

        assert_eq!(
            not_committed_reason(&outcome).0,
            NotCommittedReason::DestinationAppeared
        );
        assert_eq!(fs::read(&note).unwrap(), b"appeared first");
        assert!(temps(&scratch.0).is_empty());
    }

    #[test]
    fn a_replace_never_creates_a_missing_file() {
        let scratch = Scratch::new("replace-missing");
        let note = scratch.path("gone.md");

        let outcome = replace(&ReplaceRequest::replace(&note, b"resurrected?"));

        assert_eq!(
            not_committed_reason(&outcome).0,
            NotCommittedReason::TargetMissing
        );
        assert!(!note.exists() && temps(&scratch.0).is_empty());

        // Deleted between the check and the rename: the final check refuses; nothing is recreated.
        let note = scratch.path("vanishing.md");
        put(&note, b"old");
        let target = note.clone();
        let faults = Faults::none().observe(move |step| {
            if step == Step::VerifyTarget {
                fs::remove_file(&target).unwrap();
            }
        });
        let outcome = replace_with(&ReplaceRequest::replace(&note, b"new"), &faults);
        assert_eq!(
            not_committed_reason(&outcome).0,
            NotCommittedReason::TargetChanged
        );
        assert!(!note.exists());
    }

    #[test]
    fn a_replace_replaces_and_an_upsert_creates_or_replaces() {
        let scratch = Scratch::new("intents-ok");
        let note = scratch.path("note.md");
        put(&note, b"old");
        assert_committed(&replace(&ReplaceRequest::replace(&note, b"new")));
        assert_eq!(fs::read(&note).unwrap(), b"new");

        let fresh = scratch.path("state.json");
        assert_committed(&replace(&ReplaceRequest::new(&fresh, b"{}")));
        assert_committed(&replace(&ReplaceRequest::new(&fresh, b"{\"a\":1}")));
        assert_eq!(fs::read(&fresh).unwrap(), b"{\"a\":1}");

        let created = scratch.path("created.md");
        assert_committed(&replace(&ReplaceRequest::create(&created, b"x")));
        assert_eq!(fs::read(&created).unwrap(), b"x");
    }

    // ---- 8b. a partial write followed by an error ----------------------------------------------------------

    #[test]
    fn a_partial_write_that_then_fails_leaves_the_original_complete_and_unchanged() {
        let scratch = Scratch::new("partial");
        let note = scratch.path("note.md");
        let old = "COMPLETE OLD NOTE ".repeat(500);
        put(&note, old.as_bytes());
        let (inode, mtime) = (ino(&note), fs::metadata(&note).unwrap().modified().unwrap());
        let new = "A LONGER NEW NOTE ".repeat(900);

        let outcome = replace_with(
            &ReplaceRequest::replace(&note, new.as_bytes()),
            &Faults::none().partial_write(4096, ENOSPC),
        );

        let (reason, leftovers) = not_committed_reason(&outcome);
        assert_eq!(reason, NotCommittedReason::InsufficientSpace);
        assert!(leftovers.is_empty());
        assert_eq!(fs::read_to_string(&note).unwrap(), old, "the original must be complete");
        assert_eq!(ino(&note), inode);
        assert_eq!(fs::metadata(&note).unwrap().modified().unwrap(), mtime);
        assert!(temps(&scratch.0).is_empty(), "the partial temporary file must be removed");

        // Same for a create: nothing at the destination, nothing left behind.
        let fresh = scratch.path("fresh.md");
        let outcome = replace_with(
            &ReplaceRequest::create(&fresh, new.as_bytes()),
            &Faults::none().partial_write(10, EIO),
        );
        assert_eq!(not_committed_reason(&outcome).0, NotCommittedReason::Io);
        assert!(!fresh.exists() && temps(&scratch.0).is_empty());
    }

    #[test]
    fn a_partial_temporary_file_that_cannot_be_removed_is_reported_and_never_installed() {
        let scratch = Scratch::new("partial-leftover");
        let note = scratch.path("note.md");
        put(&note, b"old and complete");
        let faults = Faults::none()
            .partial_write(5, EIO)
            .fail(Step::RemoveTemp, EIO);

        let outcome = replace_with(&ReplaceRequest::replace(&note, b"a much longer new note"), &faults);

        let (_, leftovers) = not_committed_reason(&outcome);
        assert_eq!(leftovers.len(), 1);
        assert_eq!(fs::read(&leftovers[0]).unwrap(), b"a muc", "the half-written file is reported, not hidden");
        assert_eq!(fs::read(&note).unwrap(), b"old and complete");
    }

    // ---- 8c. confirm_durability: flush only ----------------------------------------------------------------

    #[test]
    fn confirming_durability_flushes_without_rewriting_anything() {
        let scratch = Scratch::new("confirm");
        let note = scratch.path("note.md");
        put(&note, b"revision N");
        let (inode, mtime) = (ino(&note), fs::metadata(&note).unwrap().modified().unwrap());
        let (log, observer) = step_log();

        let outcome = confirm_durability_with(
            &DurabilityRequest::new(&note, b"revision N"),
            &Faults::none().observe(observer),
        );

        assert_eq!(outcome, DurabilityOutcome::Confirmed);
        assert_eq!(
            *log.lock().unwrap(),
            vec![
                Step::CheckVolume,
                Step::InspectRead,
                Step::ConfirmFlushFile,
                Step::ConfirmSyncDir
            ],
            "no temporary file, no write, no rename"
        );
        assert_eq!(fs::read(&note).unwrap(), b"revision N");
        assert_eq!(ino(&note), inode);
        assert_eq!(fs::metadata(&note).unwrap().modified().unwrap(), mtime);
        assert!(temps(&scratch.0).is_empty());
    }

    #[test]
    fn confirming_revision_n_never_touches_or_vouches_for_a_newer_revision() {
        let scratch = Scratch::new("confirm-newer");
        let note = scratch.path("note.md");
        put(&note, b"revision N+1");
        let (log, observer) = step_log();

        let outcome = confirm_durability_with(
            &DurabilityRequest::new(&note, b"revision N"),
            &Faults::none().observe(observer),
        );

        assert_eq!(outcome, DurabilityOutcome::Superseded);
        assert!(
            !log.lock().unwrap().contains(&Step::ConfirmFlushFile),
            "nothing is flushed on behalf of content that is no longer on disk"
        );
        assert_eq!(fs::read(&note).unwrap(), b"revision N+1");
    }

    #[test]
    fn confirming_reports_a_missing_file_a_failed_flush_and_a_failed_read_explicitly() {
        let scratch = Scratch::new("confirm-errors");
        let gone = scratch.path("gone.md");
        assert_eq!(
            confirm_durability(&DurabilityRequest::new(&gone, b"x")),
            DurabilityOutcome::Missing
        );

        let note = scratch.path("note.md");
        put(&note, b"x");
        let request = DurabilityRequest::new(&note, b"x");
        assert_eq!(
            confirm_durability_with(&request, &Faults::none().fail(Step::ConfirmSyncDir, EIO)),
            DurabilityOutcome::Unconfirmed(vec![DurabilityGap::DirectorySyncFailed(
                io::Error::from_raw_os_error(EIO).to_string()
            )])
        );
        assert_eq!(
            confirm_durability_with(&request, &Faults::none().fail(Step::ConfirmFlushFile, EIO)),
            DurabilityOutcome::Unconfirmed(vec![DurabilityGap::FileSyncFailed(
                io::Error::from_raw_os_error(EIO).to_string()
            )])
        );
        let failed = confirm_durability_with(&request, &Faults::none().fail(Step::InspectRead, EIO));
        assert!(matches!(failed, DurabilityOutcome::Failed { .. }), "{failed:?}");
        assert_eq!(fs::read(&note).unwrap(), b"x");
    }

    #[test]
    fn confirming_refuses_symlinks_directories_out_of_scope_paths_and_other_volumes() {
        let scratch = Scratch::new("confirm-refusals");
        let real = scratch.path("real.md");
        put(&real, b"x");
        let link = scratch.path("link.md");
        std::os::unix::fs::symlink(&real, &link).unwrap();
        let refused = |outcome: DurabilityOutcome| match outcome {
            DurabilityOutcome::Refused { reason, .. } => reason,
            other => panic!("{other:?}"),
        };

        assert_eq!(
            refused(confirm_durability(&DurabilityRequest::new(&link, b"x"))),
            NotCommittedReason::UnsupportedSymlink
        );
        let folder = scratch.path("folder");
        fs::create_dir(&folder).unwrap();
        assert_eq!(
            refused(confirm_durability(&DurabilityRequest::new(&folder, b"x"))),
            NotCommittedReason::NotARegularFile
        );
        let elsewhere = Scratch::new("confirm-elsewhere");
        let request = DurabilityRequest {
            scope_root: Some(&elsewhere.0),
            ..DurabilityRequest::new(&real, b"x")
        };
        assert_eq!(refused(confirm_durability(&request)), NotCommittedReason::OutOfScope);
        let request = DurabilityRequest {
            supported_filesystems: &["exfat"],
            ..DurabilityRequest::new(&real, b"x")
        };
        assert_eq!(
            refused(confirm_durability(&request)),
            NotCommittedReason::UnsupportedFilesystem
        );
    }

    #[test]
    fn confirming_waits_for_a_write_of_the_same_file_instead_of_interleaving_with_it() {
        let scratch = Scratch::new("confirm-lock");
        let note = scratch.path("note.md");
        put(&note, b"old");
        let (entered_tx, entered_rx) = std::sync::mpsc::channel::<()>();
        let entered_tx = Mutex::new(entered_tx);
        let writer = {
            let note = note.clone();
            std::thread::spawn(move || {
                let faults = Faults::none().observe(move |step| {
                    if step == Step::VerifyTarget {
                        entered_tx.lock().unwrap().send(()).unwrap();
                        std::thread::sleep(Duration::from_millis(400));
                    }
                });
                replace_with(&ReplaceRequest::replace(&note, b"new"), &faults)
            })
        };
        entered_rx.recv().unwrap();
        let started = std::time::Instant::now();

        // The write is mid-flight and holds the lock: this call can only run once it has finished.
        let outcome = confirm_durability(&DurabilityRequest::new(&note, b"new"));

        assert!(started.elapsed() >= Duration::from_millis(250), "it did not wait for the lock");
        assert_eq!(outcome, DurabilityOutcome::Confirmed);
        assert_committed(&writer.join().unwrap());
    }

    // ---- 8d. inspect: what happened to an uncertain write --------------------------------------------------

    /// An uncertain outcome whose rename did NOT take effect: the temporary file is still listed.
    fn uncertain_not_applied(note: &Path, content: &[u8]) -> Vec<PathBuf> {
        let faults = Faults::none()
            .fail(Step::RenameOver, EIO)
            .fail(Step::InspectAfterRename, EIO);
        match replace_with(&ReplaceRequest::replace(note, content), &faults) {
            ReplaceOutcome::Uncertain { recovery_paths, .. } => recovery_paths,
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn inspecting_an_uncertain_write_that_did_not_take_effect_finds_the_previous_content() {
        let scratch = Scratch::new("inspect-previous");
        let note = scratch.path("note.md");
        put(&note, b"previous");
        let temp_paths = uncertain_not_applied(&note, b"attempted");
        assert_eq!(temp_paths.len(), 1);

        let result = inspect(&InspectRequest {
            temp_paths: &temp_paths,
            ..InspectRequest::new(&note, b"attempted", Some(b"previous"))
        });

        assert_eq!(
            result,
            Inspection::Inspected {
                target: TargetState::HoldsPrevious,
                temps: vec![TempReport {
                    path: temp_paths[0].clone(),
                    state: TempState::HoldsAttempted,
                }],
            }
        );
        // Inspection changes nothing: the temporary file may hold the only copy.
        assert_eq!(fs::read(&temp_paths[0]).unwrap(), b"attempted");
        assert_eq!(fs::read(&note).unwrap(), b"previous");
    }

    #[test]
    fn inspecting_an_uncertain_write_that_took_effect_finds_the_attempted_content() {
        let scratch = Scratch::new("inspect-attempted");
        let note = scratch.path("note.md");
        put(&note, b"previous");
        let faults = Faults::none()
            .fail_after_effect(Step::RenameOver, EIO)
            .fail(Step::InspectAfterRename, EIO);
        let outcome = replace_with(&ReplaceRequest::replace(&note, b"attempted"), &faults);
        assert!(matches!(outcome, ReplaceOutcome::Uncertain { .. }), "{outcome:?}");

        let result = inspect(&InspectRequest::new(&note, b"attempted", Some(b"previous")));

        assert_eq!(
            result,
            Inspection::Inspected {
                target: TargetState::HoldsAttempted,
                temps: Vec::new()
            }
        );
    }

    #[test]
    fn inspecting_distinguishes_a_third_state_a_missing_file_and_an_unresolved_temporary_file() {
        let scratch = Scratch::new("inspect-third");
        let note = scratch.path("note.md");
        put(&note, b"previous");
        let temp_paths = uncertain_not_applied(&note, b"attempted");

        // Somebody else changed the destination meanwhile.
        fs::write(&note, b"someone else, newer").unwrap();
        let other = inspect(&InspectRequest {
            temp_paths: &temp_paths,
            ..InspectRequest::new(&note, b"attempted", Some(b"previous"))
        });
        let Inspection::Inspected { target, temps } = other else { panic!("{other:?}") };
        assert_eq!(target, TargetState::HoldsOther, "never mistaken for either of ours");
        assert_eq!(temps[0].state, TempState::HoldsAttempted);

        // The destination was deleted.
        fs::remove_file(&note).unwrap();
        let missing = inspect(&InspectRequest::new(&note, b"attempted", Some(b"previous")));
        assert_eq!(
            missing,
            Inspection::Inspected { target: TargetState::Missing, temps: Vec::new() }
        );

        // The temporary file vanished (or holds something else).
        fs::remove_file(&temp_paths[0]).unwrap();
        let gone = inspect(&InspectRequest {
            temp_paths: &temp_paths,
            ..InspectRequest::new(&note, b"attempted", Some(b"previous"))
        });
        let Inspection::Inspected { temps, .. } = gone else { panic!("{gone:?}") };
        assert_eq!(temps[0].state, TempState::Absent);
    }

    #[test]
    fn when_previous_and_attempted_are_identical_the_file_counts_as_holding_the_attempted_content() {
        let scratch = Scratch::new("inspect-tie");
        let note = scratch.path("note.md");
        put(&note, b"same");

        let result = inspect(&InspectRequest::new(&note, b"same", Some(b"same")));

        assert_eq!(
            result,
            Inspection::Inspected { target: TargetState::HoldsAttempted, temps: Vec::new() }
        );
    }

    #[test]
    fn inspecting_reads_only_this_writers_temporary_files_and_refuses_everything_else() {
        let scratch = Scratch::new("inspect-scope");
        let note = scratch.path("note.md");
        put(&note, b"previous");
        let secret = scratch.path("secret.txt");
        put(&secret, b"not a temporary file");
        let elsewhere = Scratch::new("inspect-elsewhere");
        let foreign_temp = elsewhere.path(&format!("{TEMP_PREFIX}{}", "0".repeat(TEMP_NAME_LEN - TEMP_PREFIX.len())));
        put(&foreign_temp, b"in another directory");

        for temp in [&secret, &foreign_temp] {
            let result = inspect(&InspectRequest {
                temp_paths: std::slice::from_ref(temp),
                ..InspectRequest::new(&note, b"attempted", Some(b"previous"))
            });
            assert!(
                matches!(&result, Inspection::Refused { reason: NotCommittedReason::OutOfScope, .. }),
                "{result:?}"
            );
        }

        let link = scratch.path("link.md");
        std::os::unix::fs::symlink(&note, &link).unwrap();
        assert!(matches!(
            inspect(&InspectRequest::new(&link, b"a", Some(b"p"))),
            Inspection::Refused { reason: NotCommittedReason::UnsupportedSymlink, .. }
        ));
        assert!(matches!(
            inspect(&InspectRequest { scope_root: Some(&elsewhere.0), ..InspectRequest::new(&note, b"a", Some(b"p")) }),
            Inspection::Refused { reason: NotCommittedReason::OutOfScope, .. }
        ));
        assert!(matches!(
            inspect(&InspectRequest { supported_filesystems: &["exfat"], ..InspectRequest::new(&note, b"a", Some(b"p")) }),
            Inspection::Refused { reason: NotCommittedReason::UnsupportedFilesystem, .. }
        ));
        let failed = inspect_with(
            &InspectRequest::new(&note, b"a", Some(b"p")),
            &Faults::none().fail(Step::InspectRead, EIO),
        );
        assert!(matches!(failed, Inspection::Failed { .. }), "{failed:?}");
    }

    #[test]
    fn the_hand_written_statfs_layout_matches_the_sdk() {
        // Checked against <sys/mount.h> with a C compiler on this SDK: sizeof 2168, f_fstypename at offset 72.
        assert_eq!(std::mem::size_of::<Statfs>(), 2168);
        assert_eq!(std::mem::offset_of!(Statfs, f_fstypename), 72);
        assert_eq!(std::mem::size_of::<AttrList>(), 24);
        assert_eq!(std::mem::size_of::<Timespec>(), 16);
    }

    // ---- 8e. lock identity and descriptor hygiene ----------------------------------------------------------

    #[test]
    fn writers_naming_one_file_with_different_letter_case_share_one_lock() {
        let scratch = Scratch::new("case-lock");
        if !volume_is_case_insensitive(&scratch.0) {
            eprintln!("skipped: this volume is case-sensitive");
            return;
        }
        let upper = scratch.path("Note.md");
        let lower = scratch.path("note.md");
        put(&upper, b"old");
        let active = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let overlapped = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let run = |path: PathBuf, content: &'static [u8]| {
            let (active, overlapped) = (Arc::clone(&active), Arc::clone(&overlapped));
            std::thread::spawn(move || {
                let faults = Faults::none().observe(move |step| match step {
                    Step::StatTarget => {
                        if active.fetch_add(1, Ordering::SeqCst) != 0 {
                            overlapped.store(true, Ordering::SeqCst);
                        }
                        std::thread::sleep(Duration::from_millis(150));
                    }
                    Step::SyncDir => {
                        active.fetch_sub(1, Ordering::SeqCst);
                    }
                    _ => {}
                });
                replace_with(&ReplaceRequest::replace(&path, content), &faults)
            })
        };

        let (a, b) = (run(upper.clone(), b"from Note.md"), run(lower.clone(), b"from note.md"));
        assert_committed(&a.join().unwrap());
        assert_committed(&b.join().unwrap());

        assert!(
            !overlapped.load(Ordering::SeqCst),
            "two spellings of one file ran at the same time: the lock key must be case-folded"
        );
    }

    /// Run in a child process (so no other test's descriptors are counted) by `no_descriptor_leaks_on_any_exit_path`.
    #[test]
    #[ignore = "run by no_descriptor_leaks_on_any_exit_path in a child process"]
    fn descriptor_probe() {
        fn open_descriptors() -> usize {
            fs::read_dir("/dev/fd").unwrap().count()
        }
        let scratch = Scratch::new("fds");
        let note = scratch.path("note.md");
        put(&note, b"old");
        let before = open_descriptors();

        for round in 0..20 {
            let content = format!("round {round}");
            // success, every refusal, failures at every stage, an uncertain outcome, flush-only and inspection.
            assert_committed(&replace(&ReplaceRequest::replace(&note, content.as_bytes())));
            let _ = replace(&ReplaceRequest::create(&note, b"x"));
            let _ = replace(&ReplaceRequest::replace(&scratch.path("missing.md"), b"x"));
            let _ = replace(&ReplaceRequest::replace_if(&note, b"x", b"not the content"));
            for step in [
                Step::CheckVolume, Step::CreateTemp, Step::LockTemp, Step::WriteData, Step::CopyMetadata, Step::SetBirthTime,
                Step::SetMtime, Step::VerifyMetadata, Step::FlushTemp, Step::VerifyTarget, Step::RenameOver,
                Step::SyncDir, Step::RemoveTemp,
            ] {
                let _ = replace_with(&ReplaceRequest::replace(&note, b"y"), &Faults::none().fail(step, EIO));
            }
            let _ = replace_with(&ReplaceRequest::replace(&note, b"y"), &Faults::none().partial_write(1, EIO));
            let _ = replace_with(
                &ReplaceRequest::replace(&note, b"y"),
                &Faults::none().fail_after_effect(Step::RenameOver, EIO).fail(Step::InspectAfterRename, EIO),
            );
            let current = fs::read(&note).unwrap();
            let _ = confirm_durability(&DurabilityRequest::new(&note, &current));
            let _ = confirm_durability_with(&DurabilityRequest::new(&note, &current), &Faults::none().fail(Step::ConfirmFlushFile, EIO));
            let _ = confirm_durability_with(&DurabilityRequest::new(&note, &current), &Faults::none().fail(Step::InspectRead, EIO));
            let _ = inspect(&InspectRequest::new(&note, &current, Some(b"old")));
            let _ = inspect_with(&InspectRequest::new(&note, &current, Some(b"old")), &Faults::none().fail(Step::InspectRead, EIO));
            for entry in fs::read_dir(&scratch.0).unwrap().flatten() {
                if entry.file_name().to_string_lossy().starts_with(TEMP_PREFIX) {
                    let _ = fs::remove_file(entry.path());
                }
            }
        }

        assert_eq!(open_descriptors(), before, "descriptors leaked");
        println!("FD-PROBE-OK");
    }

    #[test]
    fn no_descriptor_leaks_on_any_exit_path() {
        let output = Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "atomic_replace::tests::descriptor_probe",
                "--include-ignored",
                "--nocapture",
                "--test-threads=1",
            ])
            .output()
            .unwrap();
        let text = String::from_utf8_lossy(&output.stdout).to_string()
            + &String::from_utf8_lossy(&output.stderr);
        assert!(output.status.success() && text.contains("FD-PROBE-OK"), "{text}");
    }

    // ---- 9. real volumes (run by hand: see the milestone report) --------------------------------------------

    fn volume_dir() -> Option<PathBuf> {
        std::env::var_os("CLUTTER_ATOMIC_TEST_DIR").map(PathBuf::from)
    }

    /// Manual volume checks widen the policy to the volume under test, explicitly and visibly: that is the only
    /// way a non-APFS volume is ever written to.
    fn volume_policy(dir: &Path) -> &'static [&'static str] {
        let name: &'static str = Box::leak(volume_type_of(dir).into_boxed_str());
        eprintln!("volume type under test: {name}");
        Box::leak(vec![name].into_boxed_slice())
    }

    #[test]
    #[ignore = "needs CLUTTER_ATOMIC_TEST_DIR pointing at a scratch directory on the volume under test"]
    fn volume_smoke() {
        let dir = volume_dir().expect("CLUTTER_ATOMIC_TEST_DIR");
        let policy = volume_policy(&dir);
        let note = dir.join("smoke.md");
        let _ = fs::remove_file(&note);
        let created = replace(&ReplaceRequest {
            supported_filesystems: policy,
            ..ReplaceRequest::new(&note, b"one")
        });
        eprintln!("create:      {created:?}");
        if !path_exists(&note) {
            // Creating is refused on volumes without RENAME_EXCL; seed the file so replace and conditional
            // replace are still exercised on this volume.
            fs::write(&note, b"one").unwrap();
        }
        let replaced = replace(&ReplaceRequest {
            supported_filesystems: policy,
            ..ReplaceRequest::new(&note, b"two")
        });
        eprintln!("replace:     {replaced:?}");
        let conditional = replace(&ReplaceRequest {
            intent: Intent::ReplaceIfContent(b"two"),
            supported_filesystems: policy,
            ..ReplaceRequest::new(&note, b"three")
        });
        eprintln!("conditional: {conditional:?}");
        eprintln!(
            "final contents: {:?}",
            String::from_utf8_lossy(&fs::read(&note).unwrap())
        );
        eprintln!("temporary files left: {:?}", temps(&dir));
        let usable = |outcome: &ReplaceOutcome| {
            outcome.is_committed()
                || matches!(
                    outcome,
                    ReplaceOutcome::NotCommitted {
                        reason: NotCommittedReason::UnsupportedOperation,
                        ..
                    }
                )
        };
        assert!(usable(&created) && usable(&replaced) && usable(&conditional));
        assert!(temps(&dir).is_empty());
        let _ = fs::remove_file(&note);
    }

    #[test]
    #[ignore = "fills the volume under test; needs CLUTTER_ATOMIC_TEST_DIR on a small disposable volume"]
    fn volume_full_leaves_the_old_note_complete() {
        let dir = volume_dir().expect("CLUTTER_ATOMIC_TEST_DIR");
        let policy = volume_policy(&dir);
        let note = dir.join("full.md");
        let old = "COMPLETE OLD NOTE ".repeat(2000);
        put(&note, old.as_bytes());
        let mut filler = Vec::new();
        for index in 0.. {
            let path = dir.join(format!("filler-{index}.bin"));
            match fs::write(&path, vec![b'x'; 256 * 1024]) {
                Ok(()) => filler.push(path),
                Err(_) => {
                    let _ = fs::remove_file(&path);
                    break;
                }
            }
        }
        let outcome = replace(&ReplaceRequest {
            supported_filesystems: policy,
            ..ReplaceRequest::new(&note, "COMPLETE NEW NOTE ".repeat(8000).as_bytes())
        });
        let content_after = fs::read_to_string(&note).unwrap();
        let leftovers = temps(&dir);
        for path in &filler {
            let _ = fs::remove_file(path);
        }
        eprintln!("outcome: {outcome:?}");
        assert_eq!(
            not_committed_reason(&outcome).0,
            NotCommittedReason::InsufficientSpace
        );
        assert_eq!(
            content_after, old,
            "the previous complete note must survive a full disk"
        );
        assert!(leftovers.is_empty(), "{leftovers:?}");
        let _ = fs::remove_file(&note);
    }
}
