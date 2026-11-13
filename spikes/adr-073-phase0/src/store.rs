//! SPIKE of the ADR-073 Space Coordination Store (§2), written only to be validated by Phase 0.
//! Not production code: no Tauri, no IPC, and the contracts are exactly the ADR's, nothing more.

use crate::atomic_replace::{
    self as ar, DurabilityOutcome, DurabilityRequest, Faults, InspectRequest, Inspection, ReplaceOutcome, ReplaceRequest, TargetState,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::Instant;

pub use crate::model::*;
use crate::model::{apply, Applied, ClaimRec};
pub const LEASE_MS: u64 = 30_000;
pub const RECONCILE_ATTEMPTS: usize = 3;
static LAUNCH_SEQUENCE: AtomicU64 = AtomicU64::new(0);

// ---------------------------------------------------------------------------------------------------------
// Intents and results
// ---------------------------------------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MutResult {
    Committed { rev: u64 },
    /// Nothing to do (idempotent add of a registered path, or commit-if-absent found the first notice).
    NoChange { rev: u64 },
    Stale(String),
    Refused(String),
    ClaimRevoked,
    /// Pre-replacement failure: nothing changed.
    Failed(String),
    Indeterminate { op_id: String },
    Degraded,
    Unavailable(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum OpStatus {
    Committed(u64),
    NotCommitted,
    Indeterminate,
    UnknownOpId,
}

// ---------------------------------------------------------------------------------------------------------
// Time, faults and notifications (test seams)
// ---------------------------------------------------------------------------------------------------------

#[derive(Clone)]
pub struct Clock {
    manual: Option<Arc<AtomicU64>>,
    origin: Instant,
}

impl Clock {
    pub fn real() -> Clock {
        Clock { manual: None, origin: Instant::now() }
    }
    pub fn manual() -> Clock {
        Clock { manual: Some(Arc::new(AtomicU64::new(0))), origin: Instant::now() }
    }
    pub fn now_ms(&self) -> u64 {
        match &self.manual {
            Some(value) => value.load(Ordering::SeqCst),
            None => self.origin.elapsed().as_millis() as u64,
        }
    }
    pub fn advance(&self, ms: u64) {
        if let Some(value) = &self.manual {
            value.fetch_add(ms, Ordering::SeqCst);
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    WritePrev,
    WriteMain,
    WriteProbe,
    WriteBaseline,
    Inspect,
    Confirm,
}

pub struct Ctx {
    pub kind: Kind,
    /// Index of the mutation (0-based, counts every mutation attempt, including refused ones that reached persistence).
    pub seq: u64,
    pub attempt: usize,
}

pub(crate) type FaultHook = Box<dyn Fn(&Ctx) -> Faults + Send + Sync>;
pub type Subscriber = Box<dyn Fn(u64) + Send + Sync>;

// ---------------------------------------------------------------------------------------------------------
// Claims and window registry
// ---------------------------------------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ClaimResult {
    Claimed { claim_id: u64, fence: u64, expires_at: u64 },
    Held { holder: String },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum StepResult {
    Ok { expires_at: u64 },
    Revoked,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Mode {
    Normal,
    Degraded,
    ReadOnly(String),
}

#[derive(Default)]
struct Side {
    pending: Option<String>,
    outcomes: HashMap<String, OpStatus>,
}

struct Pending {
    op_id: String,
    bytes: Vec<u8>,
    doc: Doc,
}

struct Inner {
    mode: Mode,
    doc: Doc,
    bytes: Vec<u8>,
    pending: Option<Pending>,
    claims: HashMap<String, ClaimRec>,
    fence: u64,
    claim_seq: u64,
    seq: u64,
    epochs: HashMap<String, u64>,
    pins: HashMap<String, Vec<u64>>,
}

#[derive(Debug, Default, Clone)]
pub struct OpenReport {
    pub adopted: String,
    pub quarantined: Vec<String>,
    pub moved_aside_temps: usize,
    pub unreadable: bool,
    pub unknown_schema: bool,
    pub diagnostics: Vec<String>,
    pub read_only: Option<String>,
}

pub struct Store {
    pub dir: PathBuf,
    pub launch: String,
    inner: Mutex<Inner>,
    snapshot: RwLock<Arc<Doc>>,
    /// Operation outcomes that are not in the committed document. A separate small lock, never held across I/O, so
    /// `operation_status` (like `read`) never waits behind a write.
    side: Mutex<Side>,
    pub clock: Clock,
    subscribers: Mutex<Vec<Subscriber>>,
    hook: Mutex<Option<FaultHook>>,
    /// Instrumentation for the step-order assertions (E2): the order of writer steps and publication.
    pub trace: Mutex<Vec<String>>,
}

fn main_path(dir: &Path) -> PathBuf {
    dir.join("registry.json")
}
fn prev_path(dir: &Path) -> PathBuf {
    dir.join("registry.prev.json")
}
pub fn baseline_path(dir: &Path) -> PathBuf {
    dir.join("legacy-import.json")
}

enum Wr {
    Confirmed,
    Pre(String),
    Post(String),
}

impl Store {
    // ---- open / startup recovery (§2 point 3) -----------------------------------------------------------

    pub fn open(dir: &Path, clock: Clock) -> (Store, OpenReport) {
        Store::open_with_hook(dir, clock, None)
    }

    pub(crate) fn open_with_hook(dir: &Path, clock: Clock, hook: Option<FaultHook>) -> (Store, OpenReport) {
        let launch = format!("L{}-{}-{}", std::process::id(), nanos(), LAUNCH_SEQUENCE.fetch_add(1, Ordering::SeqCst));
        let store = Store {
            dir: dir.to_path_buf(),
            launch,
            inner: Mutex::new(Inner {
                mode: Mode::Normal,
                doc: Doc::empty(),
                bytes: vec![],
                pending: None,
                claims: HashMap::new(),
                fence: 0,
                claim_seq: 0,
                seq: 0,
                epochs: HashMap::new(),
                pins: HashMap::new(),
            }),
            snapshot: RwLock::new(Arc::new(Doc::empty())),
            side: Mutex::new(Side::default()),
            clock,
            subscribers: Mutex::new(vec![]),
            hook: Mutex::new(hook),
            trace: Mutex::new(vec![]),
        };
        let report = store.recover();
        (store, report)
    }

    fn recover(&self) -> OpenReport {
        let mut report = OpenReport::default();
        fs::create_dir_all(&self.dir).unwrap();
        // 1. stray temporaries: the writer's policy is "never delete, move aside" (see RESULTS finding F1).
        if let Ok(read) = fs::read_dir(&self.dir) {
            for item in read.flatten() {
                let name = item.file_name().to_string_lossy().into_owned();
                if name.starts_with(".clutter-tmp.") {
                    let aside = self.dir.join("orphaned-temps");
                    let _ = fs::create_dir_all(&aside);
                    if fs::rename(item.path(), aside.join(&name)).is_ok() {
                        report.moved_aside_temps += 1;
                    }
                }
            }
        }
        // 2. parse and validate both generations independently.
        let main_bytes = fs::read(main_path(&self.dir)).ok();
        let prev_bytes = fs::read(prev_path(&self.dir)).ok();
        let main = main_bytes.as_ref().map(|bytes| Doc::parse(bytes));
        let prev = prev_bytes.as_ref().map(|bytes| Doc::parse(bytes));
        let unknown = |result: &Option<Result<Doc, String>>| matches!(result, Some(Err(message)) if message.starts_with("unknown schema"));
        let main_ok = matches!(main, Some(Ok(_)));
        let prev_ok = matches!(prev, Some(Ok(_)));
        let mut inner = self.inner.lock().unwrap();
        // 3. adopt.
        let (adopted, bytes, rewrite_main): (Doc, Vec<u8>, bool) = if unknown(&main) || unknown(&prev) {
            report.unknown_schema = true;
            report.adopted = "unknown-schema".into();
            inner.mode = Mode::ReadOnly("unknown schema".into());
            report.read_only = Some("unknown schema".into());
            return report;
        } else if main_ok && prev_ok {
            let main_doc = main.clone().unwrap().unwrap();
            let prev_doc = prev.clone().unwrap().unwrap();
            if prev_doc.rev > main_doc.rev {
                report.diagnostics.push("prev ahead of main (cannot occur by invariant)".into());
                report.adopted = "prev".into();
                (prev_doc, prev_bytes.clone().unwrap(), true)
            } else {
                report.adopted = "main".into();
                (main_doc, main_bytes.clone().unwrap(), false)
            }
        } else if main_ok {
            report.adopted = "main".into();
            (main.clone().unwrap().unwrap(), main_bytes.clone().unwrap(), false)
        } else if prev_ok {
            report.adopted = "prev".into();
            report.diagnostics.push("main invalid: the most recent Space change may be missing".into());
            if main_bytes.is_some() {
                report.quarantined.push(self.quarantine(&main_path(&self.dir)));
            }
            (prev.clone().unwrap().unwrap(), prev_bytes.clone().unwrap(), true)
        } else if main_bytes.is_none() && prev_bytes.is_none() {
            report.adopted = "empty".into();
            drop(inner);
            self.probe_into_report(&mut report);
            return report;
        } else {
            report.unreadable = true;
            report.adopted = "unreadable".into();
            if main_bytes.is_some() {
                report.quarantined.push(self.quarantine(&main_path(&self.dir)));
            }
            if prev_bytes.is_some() {
                report.quarantined.push(self.quarantine(&prev_path(&self.dir)));
            }
            drop(inner);
            self.probe_into_report(&mut report);
            return report;
        };
        // 4. normalize, then publish. A failure to normalize starts read-only.
        let normalized = self.normalize(&bytes, rewrite_main || !main_ok);
        match normalized {
            Ok(()) => {
                inner.doc = adopted.clone();
                inner.bytes = bytes;
                *self.snapshot.write().unwrap() = Arc::new(adopted);
            }
            Err(reason) => {
                // Startup has no confirmed snapshot yet. Keep the empty snapshot until normalization succeeds.
                inner.mode = Mode::ReadOnly(reason.clone());
                report.read_only = Some(reason);
            }
        }
        drop(inner);
        report
    }

    fn probe_into_report(&self, report: &mut OpenReport) {
        // Capability probe (§2 point 3): the required flushes must be confirmable on this directory.
        let probe = self.dir.join(".probe");
        let ok = matches!(self.write_file(&probe, b"probe", Kind::WriteProbe, 0, 0), Wr::Confirmed);
        if !ok {
            let mut inner = self.inner.lock().unwrap();
            inner.mode = Mode::ReadOnly("required flushes unsupported".into());
            report.read_only = Some("required flushes unsupported".into());
        }
    }

    fn normalize(&self, bytes: &[u8], rewrite_main: bool) -> Result<(), String> {
        match self.write_file(&prev_path(&self.dir), bytes, Kind::WritePrev, 0, 0) {
            Wr::Confirmed => {}
            Wr::Pre(detail) | Wr::Post(detail) => return Err(format!("normalize prev: {detail}")),
        }
        if rewrite_main {
            match self.write_file(&main_path(&self.dir), bytes, Kind::WriteMain, 0, 0) {
                Wr::Confirmed => {}
                Wr::Pre(detail) | Wr::Post(detail) => return Err(format!("normalize main: {detail}")),
            }
        }
        let faults = self.faults(Kind::Confirm, 0, 0);
        match ar::confirm_durability_with(&DurabilityRequest::new(&main_path(&self.dir), bytes), &faults) {
            DurabilityOutcome::Confirmed => Ok(()),
            other => Err(format!("normalize confirm: {other:?}")),
        }
    }

    fn quarantine(&self, path: &Path) -> String {
        let target = self.dir.join(format!(
            "{}.corrupt-{}",
            path.file_name().unwrap().to_string_lossy(),
            nanos()
        ));
        let _ = fs::rename(path, &target);
        target.file_name().unwrap().to_string_lossy().into_owned()
    }

    // ---- low-level write ----------------------------------------------------------------------------------

    pub(crate) fn faults(&self, kind: Kind, seq: u64, attempt: usize) -> Faults {
        match &*self.hook.lock().unwrap() {
            Some(hook) => hook(&Ctx { kind, seq, attempt }),
            None => Faults::none(),
        }
    }

    pub(crate) fn set_hook(&self, hook: Option<FaultHook>) {
        *self.hook.lock().unwrap() = hook;
    }

    fn write_file(&self, path: &Path, bytes: &[u8], kind: Kind, seq: u64, attempt: usize) -> Wr {
        let faults = self.faults(kind, seq, attempt);
        let request = ReplaceRequest::new(path, bytes);
        match ar::replace_with(&request, &faults) {
            ReplaceOutcome::Committed { durability: ar::Durability::Confirmed, .. } => Wr::Confirmed,
            ReplaceOutcome::Committed { durability: ar::Durability::Unconfirmed(gaps), .. } => Wr::Post(format!("unconfirmed durability: {gaps:?}")),
            ReplaceOutcome::NotCommitted { reason, detail, .. } => Wr::Pre(format!("{reason:?}: {detail}")),
            ReplaceOutcome::Uncertain { detail, .. } => Wr::Post(format!("uncertain: {detail}")),
        }
    }

    // ---- reads ----------------------------------------------------------------------------------------------

    /// Readers see only the confirmed snapshot; never blocks on a write.
    pub fn read(&self) -> Arc<Doc> {
        self.snapshot.read().unwrap().clone()
    }

    pub fn mode(&self) -> Mode {
        self.inner.lock().unwrap().mode.clone()
    }

    pub fn subscribe(&self, subscriber: Subscriber) {
        self.subscribers.lock().unwrap().push(subscriber);
    }

    fn publish(&self, inner: &mut Inner, doc: Doc, bytes: Vec<u8>) {
        inner.doc = doc.clone();
        inner.bytes = bytes;
        *self.snapshot.write().unwrap() = Arc::new(doc.clone());
        self.trace.lock().unwrap().push(format!("publish:{}", doc.rev));
        for subscriber in self.subscribers.lock().unwrap().iter() {
            subscriber(doc.rev);
        }
    }

    pub fn op_status(&self, op_id: &str) -> OpStatus {
        // The committed document first (the snapshot only ever holds confirmed state), then the side table.
        if let Some(record) = self.read().ops.iter().find(|record| record.op_id == op_id) {
            return OpStatus::Committed(record.rev);
        }
        let side = self.side.lock().unwrap();
        if side.pending.as_deref() == Some(op_id) {
            return OpStatus::Indeterminate;
        }
        side.outcomes.get(op_id).cloned().unwrap_or(OpStatus::UnknownOpId)
    }

    // ---- mutations ------------------------------------------------------------------------------------------

    pub fn mutate(&self, op_id: &str, intent: Intent, origin: &str) -> MutResult {
        let mut inner = self.inner.lock().unwrap();
        match &inner.mode {
            Mode::ReadOnly(reason) => return MutResult::Unavailable(reason.clone()),
            Mode::Degraded => return MutResult::Degraded,
            Mode::Normal => {}
        }
        if let Some(record) = inner.doc.ops.iter().find(|record| record.op_id == op_id) {
            return MutResult::Committed { rev: record.rev };
        }
        let now = self.clock.now_ms();
        let launch = self.launch.clone();
        let applied = apply(&inner.doc, &intent, origin, now, &inner.claims, &launch, &inner.epochs);
        let next = match applied {
            Applied::Next(doc) => doc,
            Applied::NoChange => return MutResult::NoChange { rev: inner.doc.rev },
            Applied::Stale(reason) => return MutResult::Stale(reason),
            Applied::Refused(reason) => return MutResult::Refused(reason),
            Applied::ClaimRevoked => return MutResult::ClaimRevoked,
        };
        self.commit(&mut inner, next, op_id)
    }

    /// One persistence/retention/indeterminate-outcome path for normal intents and legacy import.
    fn commit(&self, inner: &mut Inner, mut next: Doc, op_id: &str) -> MutResult {
        next.rev = inner.doc.rev + 1;
        for notice in next.notices.iter_mut().filter(|notice| notice.rev == 0) {
            notice.rev = next.rev;
        }
        next.ops.push(OpRec { op_id: op_id.to_string(), rev: next.rev });
        if next.ops.len() > OPS_KEPT {
            let drop = next.ops.len() - OPS_KEPT;
            next.ops.drain(0..drop);
        }
        if next.notices.len() > NOTICES_KEPT {
            let drop = next.notices.len() - NOTICES_KEPT;
            next.notices.drain(0..drop);
        }
        if let Err(reason) = next.validate() {
            return MutResult::Refused(format!("invariant: {reason}"));
        }
        let bytes = next.to_bytes();
        let seq = inner.seq;
        inner.seq += 1;
        // (1) previous generation := the last confirmed bytes. Failure of any kind refuses the whole mutation.
        if !inner.bytes.is_empty() {
            self.trace.lock().unwrap().push(format!("prev:{}", seq));
            match self.write_file(&prev_path(&self.dir), &inner.bytes.clone(), Kind::WritePrev, seq, 0) {
                Wr::Confirmed => {}
                Wr::Pre(detail) | Wr::Post(detail) => {
                    self.side.lock().unwrap().outcomes.insert(op_id.to_string(), OpStatus::NotCommitted);
                    return MutResult::Failed(format!("prev: {detail}"));
                }
            }
        }
        // (2) main := next. This is the commit point once it is confirmed.
        self.trace.lock().unwrap().push(format!("main:{}", seq));
        match self.write_file(&main_path(&self.dir), &bytes, Kind::WriteMain, seq, 0) {
            Wr::Confirmed => {
                self.publish(inner, next.clone(), bytes);
                MutResult::Committed { rev: next.rev }
            }
            Wr::Pre(detail) => {
                self.side.lock().unwrap().outcomes.insert(op_id.to_string(), OpStatus::NotCommitted);
                MutResult::Failed(detail)
            }
            Wr::Post(_) => {
                self.side.lock().unwrap().pending = Some(op_id.to_string());
                inner.pending = Some(Pending { op_id: op_id.to_string(), bytes, doc: next });
                match self.reconcile(inner, seq) {
                    Reconciled::Promoted(rev) => MutResult::Committed { rev },
                    Reconciled::NotCommitted => MutResult::Failed("replacement did not take effect (reconciled)".into()),
                    Reconciled::Degraded => MutResult::Indeterminate { op_id: op_id.to_string() },
                }
            }
        }
    }

    fn reconcile(&self, inner: &mut Inner, seq: u64) -> Reconciled {
        let pending = inner.pending.take().expect("pending");
        let main = main_path(&self.dir);
        for attempt in 0..RECONCILE_ATTEMPTS {
            let faults = self.faults(Kind::Inspect, seq, attempt);
            let request = InspectRequest::new(&main, &pending.bytes, Some(&inner.bytes));
            match ar::inspect_with(&request, &faults) {
                Inspection::Inspected { target: TargetState::HoldsPrevious, .. } => {
                    let mut side = self.side.lock().unwrap();
                    side.pending = None;
                    side.outcomes.insert(pending.op_id.clone(), OpStatus::NotCommitted);
                    return Reconciled::NotCommitted;
                }
                Inspection::Inspected { target: TargetState::HoldsAttempted, .. } => {
                    let faults = self.faults(Kind::Confirm, seq, attempt);
                    match ar::confirm_durability_with(&DurabilityRequest::new(&main, &pending.bytes), &faults) {
                        DurabilityOutcome::Confirmed => {
                            let rev = pending.doc.rev;
                            self.publish(inner, pending.doc, pending.bytes);
                            self.side.lock().unwrap().pending = None;
                            return Reconciled::Promoted(rev);
                        }
                        DurabilityOutcome::Unconfirmed(_) | DurabilityOutcome::Failed { .. } => continue,
                        _ => break,
                    }
                }
                Inspection::Inspected { .. } => break,
                Inspection::Refused { .. } | Inspection::Failed { .. } => continue,
            }
        }
        inner.mode = Mode::Degraded;
        inner.pending = Some(pending);
        Reconciled::Degraded
    }

    /// The slow timer of §2 point 3: one more confirmation attempt while degraded.
    pub fn retry_degraded(&self) -> Mode {
        let mut inner = self.inner.lock().unwrap();
        if inner.mode == Mode::Degraded && inner.pending.is_some() {
            let seq = inner.seq;
            if let Reconciled::Promoted(_) | Reconciled::NotCommitted = self.reconcile(&mut inner, seq) {
                inner.mode = Mode::Normal;
            }
        }
        inner.mode.clone()
    }

    // ---- claims (§2 point 4) ----------------------------------------------------------------------------------

    pub fn claim(&self, path: &str, window: &str) -> ClaimResult {
        let mut inner = self.inner.lock().unwrap();
        let now = self.clock.now_ms();
        if let Some(existing) = inner.claims.get(path) {
            if existing.expires_at > now && existing.window != window {
                return ClaimResult::Held { holder: existing.window.clone() };
            }
        }
        inner.fence += 1;
        inner.claim_seq += 1;
        let record = ClaimRec { claim_id: inner.claim_seq, fence: inner.fence, window: window.to_string(), expires_at: now + LEASE_MS };
        inner.claims.insert(path.to_string(), record.clone());
        ClaimResult::Claimed { claim_id: record.claim_id, fence: record.fence, expires_at: record.expires_at }
    }

    pub fn claim_step(&self, path: &str, token: &ClaimTok) -> StepResult {
        let mut inner = self.inner.lock().unwrap();
        let now = self.clock.now_ms();
        match inner.claims.get_mut(path) {
            Some(record) if record.claim_id == token.claim_id && record.fence == token.fence && record.expires_at > now => {
                record.expires_at = now + LEASE_MS;
                StepResult::Ok { expires_at: record.expires_at }
            }
            _ => StepResult::Revoked,
        }
    }

    pub fn release(&self, path: &str, token: &ClaimTok) {
        let mut inner = self.inner.lock().unwrap();
        if matches!(inner.claims.get(path), Some(record) if record.claim_id == token.claim_id) {
            inner.claims.remove(path);
        }
    }

    pub fn window_destroyed(&self, window: &str) {
        let mut inner = self.inner.lock().unwrap();
        inner.claims.retain(|_, record| record.window != window);
        inner.pins.remove(window);
    }

    pub fn pin(&self, window: &str, rev: u64) {
        self.inner.lock().unwrap().pins.entry(window.to_string()).or_default().push(rev);
    }

    /// A loss episode ends when any window reopens the path (§6.5); the epoch is part of the commit-if-absent key.
    pub fn reopened(&self, path: &str) {
        *self.inner.lock().unwrap().epochs.entry(path.to_string()).or_insert(0) += 1;
    }

    pub fn episode_key(&self, path: &str) -> String {
        let epoch = self.inner.lock().unwrap().epochs.get(path).copied().unwrap_or(0);
        format!("{}:{}:{}", self.launch, path, epoch)
    }

    // ---- legacy import and merge (§2 point 7) ---------------------------------------------------------------------

    /// Idempotent, serialized under the mutex. Returns the revision after the call.
    pub fn reconcile_legacy(&self, op_prefix: &str, blob: Option<&str>) -> Result<u64, String> {
        let mut inner = self.inner.lock().unwrap();
        match &inner.mode {
            Mode::ReadOnly(reason) => return Err(format!("read-only: {reason}")),
            Mode::Degraded => return Err("store degraded: wait for the pending operation to reconcile".into()),
            Mode::Normal => {}
        }
        let baseline_file = baseline_path(&self.dir);
        // The baseline is written once, create-only, confirmed, BEFORE the first registry document.
        if !baseline_file.exists() {
            let Some(blob) = blob else { return Ok(inner.doc.rev) };
            let baseline = Baseline::from_blob(blob);
            let bytes = serde_json::to_vec(&baseline).unwrap();
            let request = ReplaceRequest::create(&baseline_file, &bytes);
            let faults = self.faults(Kind::WriteBaseline, 0, 0);
            match ar::replace_with(&request, &faults) {
                ReplaceOutcome::Committed { durability: ar::Durability::Confirmed, .. } => {}
                other => return Err(format!("baseline not confirmed: {other:?}")),
            }
        }
        let baseline_bytes = fs::read(&baseline_file).map_err(|error| error.to_string())?;
        // A previous baseline rename may have landed without a confirmed result. Existence alone is not durability.
        if inner.doc.legacy.baseline_digest.is_empty() {
            let faults = self.faults(Kind::Confirm, inner.seq, 0);
            match ar::confirm_durability_with(&DurabilityRequest::new(&baseline_file, &baseline_bytes), &faults) {
                DurabilityOutcome::Confirmed => {}
                other => return Err(format!("baseline durability not confirmed: {other:?}")),
            }
        }
        let baseline: Baseline = serde_json::from_slice(&baseline_bytes).map_err(|error| error.to_string())?;
        let mut next = inner.doc.clone();
        let mut changed = false;
        if next.legacy.baseline_digest.is_empty() {
            // Import FROM THE BASELINE (not from whatever the blob has become).
            for path in &baseline.paths {
                if !next.registry.entries.iter().any(|entry| &entry.path == path) {
                    next.registry.entries.push(Entry { path: path.clone(), space_id: read_space_id(path).unwrap_or_default() });
                }
            }
            next.registry.last_opened = baseline.active.clone().filter(|active| next.registry.entries.iter().any(|entry| &entry.path == active));
            next.legacy.baseline_digest = baseline.digest.clone();
            next.legacy.consumed = baseline.paths.clone();
            next.legacy.merged_digest = Some(baseline.digest.clone());
            changed = true;
        }
        if let Some(blob) = blob {
            let digest = digest_of(blob);
            if next.legacy.merged_digest.as_deref() != Some(digest.as_str()) {
                let now_paths = Baseline::from_blob(blob).paths;
                let additions: Vec<String> = now_paths.into_iter().filter(|path| !next.legacy.consumed.contains(path)).collect();
                for path in &additions {
                    next.legacy.consumed.push(path.clone());
                    if !Path::new(path).is_dir() || next.registry.entries.iter().any(|entry| &entry.path == path) {
                        continue;
                    }
                    let id = read_space_id(path).unwrap_or_default();
                    let renamed = (!id.is_empty())
                        .then(|| next.registry.entries.iter().position(|entry| entry.space_id == id && !Path::new(&entry.path).is_dir()))
                        .flatten();
                    let previous_last = next.registry.last_opened.clone();
                    let intent = match renamed {
                        Some(index) => Intent::Replace { from: next.registry.entries[index].path.clone(), to: path.clone(), space_id: id },
                        None => Intent::Add { path: path.clone(), space_id: id, claim: None },
                    };
                    next = match apply(&next, &intent, "legacy-merge", self.clock.now_ms(), &inner.claims, &self.launch, &inner.epochs) {
                        Applied::Next(doc) => doc,
                        other => return Err(format!("legacy intent refused: {other:?}")),
                    };
                    // Importing an old build's addition did not open it in a current window.
                    if renamed.is_none() { next.registry.last_opened = previous_last; }

                }
                next.legacy.merged_digest = Some(digest);
                changed = true;
            }
        }
        if !changed {
            return Ok(inner.doc.rev);
        }
        let op_id = format!("{op_prefix}-legacy-{}", inner.doc.rev + 1);
        match self.commit(&mut inner, next, &op_id) {
            MutResult::Committed { rev } => Ok(rev),
            other => Err(format!("legacy commit: {other:?}")),
        }
    }
}

enum Reconciled {
    Promoted(u64),
    NotCommitted,
    Degraded,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Baseline {
    pub schema: u32,
    pub raw_blob: String,
    pub digest: String,
    pub paths: Vec<String>,
    pub active: Option<String>,
}

impl Baseline {
    pub fn from_blob(blob: &str) -> Baseline {
        let value: serde_json::Value = serde_json::from_str(blob).unwrap_or(serde_json::Value::Null);
        let paths = value["paths"]
            .as_array()
            .map(|array| array.iter().filter_map(|item| item.as_str()).map(canon).collect::<Vec<_>>())
            .unwrap_or_default();
        let mut unique = vec![];
        for path in paths {
            if !unique.contains(&path) {
                unique.push(path);
            }
        }
        Baseline { schema: 1, raw_blob: blob.to_string(), digest: digest_of(blob), paths: unique, active: value["activePath"].as_str().map(canon) }
    }
}

/// `canonical_space_path` is `fs::canonicalize`; a path that no longer exists keeps its normalized spelling (as the
/// registry does today).
pub fn canon(path: &str) -> String {
    match fs::canonicalize(path) {
        Ok(resolved) => resolved.to_string_lossy().into_owned(),
        Err(_) => {
            let trimmed = path.trim().trim_end_matches('/');
            if trimmed.is_empty() && path.starts_with('/') { "/".into() } else { trimmed.into() }
        }
    }
}

pub fn read_space_id(path: &str) -> Option<String> {
    let text = fs::read_to_string(Path::new(path).join(".clutter").join("workspace.json")).ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    value["spaceId"].as_str().map(|id| id.to_string())
}

fn nanos() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos() as u64
}
