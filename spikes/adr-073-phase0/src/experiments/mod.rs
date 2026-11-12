//! One module per Phase 0 experiment. Filter with `cargo test --release experiments::e1 -- --nocapture`.
use crate::store::*;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

static SCRATCH: AtomicU64 = AtomicU64::new(0);

pub fn scratch(name: &str) -> PathBuf {
    let n = SCRATCH.fetch_add(1, Ordering::SeqCst);
    let root = std::env::temp_dir().join(format!("adr073-{}-{}-{}", std::process::id(), name, n));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).unwrap();
    root
}

pub fn open(dir: &std::path::Path) -> (Store, OpenReport) {
    Store::open(&dir.join("spaces"), Clock::real())
}

/// A real Space folder with a Space id, so identity checks are exercised against the filesystem.
pub fn make_space(root: &std::path::Path, name: &str, id: &str) -> String {
    let dir = root.join(name);
    std::fs::create_dir_all(dir.join(".clutter")).unwrap();
    std::fs::write(dir.join(".clutter").join("workspace.json"), format!("{{\"spaceId\":\"{id}\"}}")).unwrap();
    canon(dir.to_str().unwrap())
}

pub fn add(store: &Store, op: &str, path: &str, id: &str) -> MutResult {
    store.mutate(op, Intent::Add { path: path.into(), space_id: id.into(), claim: None }, "t")
}


/// Tiny deterministic RNG (xorshift) so runs are reproducible from a printed seed.
pub struct Rng(pub u64);
impl Rng {
    pub fn new(seed: u64) -> Rng { Rng(seed.max(1)) }
    pub fn next(&mut self) -> u64 { let mut x = self.0; x ^= x << 13; x ^= x >> 7; x ^= x << 17; self.0 = x; x }
    pub fn below(&mut self, n: u64) -> u64 { self.next() % n.max(1) }
    pub fn chance(&mut self, percent: u64) -> bool { self.below(100) < percent }
    pub fn jitter(&mut self, max_ms: u64) { let ms = self.below(max_ms + 1); if ms > 0 { std::thread::sleep(std::time::Duration::from_millis(ms)); } }
}

/// Where a window ends up after following the notice chain (§6.1), a pure model of the adapt rule.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Dest { Space(String), Welcome }

/// Applies notices with `rev > applied`, in order, only while `from == current` (the adapt rule), following chains.
pub fn follow(doc: &Doc, current: &str, applied: u64) -> (Dest, u64) {
    let mut at = Dest::Space(current.to_string());
    let mut high = applied;
    for notice in doc.notices.iter().filter(|notice| notice.rev > applied) {
        high = high.max(notice.rev);
        let Dest::Space(here) = &at else { continue };
        if notice.from.as_deref() != Some(here.as_str()) { continue }
        match notice.kind.as_str() {
            "removed" | "lost" => at = match &notice.fallback { Some(f) => Dest::Space(f.clone()), None => Dest::Welcome },
            "moved" | "renamed" => if let Some(to) = &notice.to { at = Dest::Space(to.clone()) },
            _ => {}
        }
    }
    (at, high)
}

/// A window's resolution: follow notices; if it still sits on an unregistered path, fall back to Space-id lookup
/// (a window older than the notice retention bound), and a window in Welcome with a non-empty registry opens a Space.
pub fn settle(doc: &Doc, current: &str, space_id: &str, applied: u64) -> Dest {
    let (dest, _) = follow(doc, current, applied);
    let dest = match dest {
        Dest::Space(path) if doc.registry.entries.iter().any(|e| e.path == path) => Dest::Space(path),
        Dest::Space(_) => match doc.registry.entries.iter().find(|e| e.space_id == space_id) {
            Some(entry) => Dest::Space(entry.path.clone()),
            None => Dest::Welcome,
        },
        Dest::Welcome => Dest::Welcome,
    };
    match dest {
        Dest::Welcome if !doc.registry.entries.is_empty() => {
            let open = doc.registry.last_opened.clone().unwrap_or_else(|| doc.registry.entries[0].path.clone());
            Dest::Space(open)
        }
        other => other,
    }
}

pub fn first_candidate(doc: &Doc, after: &str) -> Option<String> {
    let entries = &doc.registry.entries;
    let index = entries.iter().position(|e| e.path == after)?;
    (1..entries.len()).map(|k| entries[(index + k) % entries.len()].path.clone()).next()
}

mod smoke;
mod e1_serialized;
mod e2_durability;
mod e3_recovery;
mod e4_claims;
mod e5_conflicts;
mod e6_notices;
mod e7_notifications;
mod e8_recovery_records;
mod e9_legacy;
mod e10_e11_e12;

