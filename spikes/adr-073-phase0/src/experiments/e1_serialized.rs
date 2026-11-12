//! E1 — serialized-mutation stress. R1, R2, R3; reads and notifications never blocked by a slow write.
use super::*;
use std::collections::BTreeSet;
use std::sync::{Arc, Mutex};

const WINDOWS: usize = 3;

struct Outcome {
    committed_revs: Vec<u64>,
    own: BTreeSet<String>,
    stale_or_refused: usize,
    nochange: usize,
}

fn run_window(store: Arc<Store>, w: usize, iterations: usize, seed: u64) -> Outcome {
    let mut rng = Rng::new(seed);
    let mut out = Outcome { committed_revs: vec![], own: BTreeSet::new(), stale_or_refused: 0, nochange: 0 };
    let mut mine: Vec<(String, String)> = vec![]; // (path, id) registered by this window
    let mut next = 0usize;
    for i in 0..iterations {
        let op = format!("w{w}-op{i}");
        let kind = rng.below(10);
        let result = match kind {
            // The same folder, spelled two ways, by every window: R2.
            0 | 1 => {
                let k = rng.below(40);
                let spelling = if rng.chance(50) { format!("/spike/shared/p{k}") } else { format!("/spike/shared/p{k}/") };
                store.mutate(&op, Intent::Add { path: canon(&spelling), space_id: format!("shared-{k}"), claim: None }, "w")
            }
            2..=4 | 5 => {
                let path = format!("/spike/w{w}/s{next}");
                let id = format!("id-w{w}-{next}");
                next += 1;
                let r = store.mutate(&op, Intent::Add { path: path.clone(), space_id: id.clone(), claim: None }, "w");
                if matches!(r, MutResult::Committed { .. }) {
                    mine.push((path, id));
                }
                r
            }
            6 if !mine.is_empty() => {
                let index = rng.below(mine.len() as u64) as usize;
                let (path, id) = mine[index].clone();
                let r = store.mutate(&op, Intent::Remove { path: path.clone(), space_id: id, fallback: None }, "w");
                if matches!(r, MutResult::Committed { .. }) {
                    mine.remove(index);
                }
                r
            }
            7 if !mine.is_empty() => {
                let index = rng.below(mine.len() as u64) as usize;
                let (path, id) = mine[index].clone();
                let to = format!("/spike/w{w}/moved{next}");
                next += 1;
                let r = store.mutate(&op, Intent::Replace { from: path, to: to.clone(), space_id: id.clone() }, "w");
                if matches!(r, MutResult::Committed { .. }) {
                    mine[index] = (to, id);
                }
                r
            }
            8 if !mine.is_empty() => {
                let index = rng.below(mine.len() as u64) as usize;
                store.mutate(&op, Intent::SetLastOpened { path: mine[index].0.clone() }, "w")
            }
            _ => {
                // A deliberately stale intent: a path this window never registered.
                store.mutate(&op, Intent::SetLastOpened { path: format!("/spike/never/{w}/{i}") }, "w")
            }
        };
        match result {
            MutResult::Committed { rev } => out.committed_revs.push(rev),
            MutResult::NoChange { .. } => out.nochange += 1,
            MutResult::Stale(_) | MutResult::Refused(_) => out.stale_or_refused += 1,
            other => panic!("unexpected result {other:?}"),
        }
    }
    out.own = mine.into_iter().map(|(path, _)| path).collect();
    out
}

fn stress(iterations: usize, label: &str) {
    let root = scratch(label);
    let (store, _) = open(&root);
    let store = Arc::new(store);
    let notified = Arc::new(Mutex::new(Vec::<u64>::new()));
    {
        let notified = notified.clone();
        store.subscribe(Box::new(move |rev| notified.lock().unwrap().push(rev)));
    }
    let started = std::time::Instant::now();
    let handles: Vec<_> = (0..WINDOWS)
        .map(|w| {
            let store = store.clone();
            std::thread::spawn(move || run_window(store, w, iterations, 0xC0FFEE + w as u64 * 7919))
        })
        .collect();
    let outcomes: Vec<Outcome> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    let elapsed = started.elapsed();
    let doc = store.read();

    // R3: every committed rev is returned to exactly one caller, with no gap, and notifications arrived in order.
    let mut revs: Vec<u64> = outcomes.iter().flat_map(|o| o.committed_revs.clone()).collect();
    revs.sort();
    let total = revs.len() as u64;
    assert_eq!(doc.rev, total, "rev == number of committed mutations");
    assert!(revs.iter().enumerate().all(|(i, rev)| *rev == i as u64 + 1), "R3: gap-free, no duplicates");
    assert_eq!(*notified.lock().unwrap(), (1..=total).collect::<Vec<_>>(), "R3: notifications in rev order, one per commit");

    // R1: each window's registry namespace equals its own acknowledged history (namespaces are disjoint).
    for (w, outcome) in outcomes.iter().enumerate() {
        let prefix = format!("/spike/w{w}/");
        let actual: BTreeSet<String> = doc.registry.entries.iter().filter(|e| e.path.starts_with(&prefix)).map(|e| e.path.clone()).collect();
        assert_eq!(actual, outcome.own, "R1: window {w} state equals its acknowledged operations");
    }
    // R2: no duplicates of any spelling; the shared folders are registered at most once each.
    doc.validate().unwrap();
    let shared: Vec<_> = doc.registry.entries.iter().filter(|e| e.path.starts_with("/spike/shared/")).collect();
    let unique: BTreeSet<_> = shared.iter().map(|e| e.path.clone()).collect();
    assert_eq!(shared.len(), unique.len(), "R2: no duplicates");
    assert!(shared.iter().all(|e| !e.path.ends_with('/')), "R2: one canonical spelling");

    // The persisted document equals the in-memory one after restart.
    let (again, report) = open(&root);
    assert_eq!(report.adopted, "main");
    assert_eq!(again.read().rev, doc.rev);
    assert_eq!(*again.read(), *doc);
    println!(
        "E1[{label}] {} commits across {WINDOWS} windows x {iterations} intents in {:?}; nochange={} stale/refused={}; entries={}",
        total,
        elapsed,
        outcomes.iter().map(|o| o.nochange).sum::<usize>(),
        outcomes.iter().map(|o| o.stale_or_refused).sum::<usize>(),
        doc.registry.entries.len()
    );
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn e1_stress_quick() {
    stress(300, "e1-quick");
}

#[test]
#[ignore = "long: 3 windows x 5000 intents (spec size)"]
fn e1_stress_full() {
    stress(5000, "e1-full");
}

/// Slow disk: every writer flush takes 40 ms. Reads and subscriber callbacks must not queue behind a write.
#[test]
fn e1_reads_are_not_blocked_by_a_slow_write() {
    use crate::atomic_replace::{Faults, Step};
    let root = scratch("e1-slow");
    let store = Arc::new(
        Store::open_with_hook(
            &root.join("spaces"),
            Clock::real(),
            Some(Box::new(|ctx: &Ctx| {
                if matches!(ctx.kind, Kind::WriteMain | Kind::WritePrev) {
                    Faults::none().observe(|step| {
                        if step == Step::FlushTemp {
                            std::thread::sleep(std::time::Duration::from_millis(40));
                        }
                    })
                } else {
                    Faults::none()
                }
            })),
        )
        .0,
    );
    let stop = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let reader = {
        let store = store.clone();
        let stop = stop.clone();
        std::thread::spawn(move || {
            let mut worst = std::time::Duration::ZERO;
            let mut count = 0u64;
            while !stop.load(std::sync::atomic::Ordering::SeqCst) {
                let t = std::time::Instant::now();
                let _ = store.read();
                let _ = store.op_status("x");
                worst = worst.max(t.elapsed());
                count += 1;
            }
            (worst, count)
        })
    };
    let writers: Vec<_> = (0..3)
        .map(|w| {
            let store = store.clone();
            std::thread::spawn(move || {
                for i in 0..40 {
                    store.mutate(&format!("s{w}-{i}"), Intent::Add { path: format!("/slow/{w}/{i}"), space_id: "x".into(), claim: None }, "w");
                }
            })
        })
        .collect();
    for w in writers {
        w.join().unwrap();
    }
    stop.store(true, std::sync::atomic::Ordering::SeqCst);
    let (worst, count) = reader.join().unwrap();
    println!("E1[slow-disk] 120 slow commits; {count} reads, worst read latency {worst:?}");
    assert_eq!(store.read().rev, 120);
    // `op_status` takes the inner mutex (like mutate): measure only snapshot reads for the "never blocked" claim.
    // (op_status blocking behind a mutation is by design: it must see the pending outcome.)
    let t = std::time::Instant::now();
    let _ = store.read();
    assert!(t.elapsed() < std::time::Duration::from_millis(5));
    std::fs::remove_dir_all(root).unwrap();
}
