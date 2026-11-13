//! E2 — durable commit, failure classes and indeterminate outcomes (R6, R11). E3 covers startup recovery separately.
use super::*;
use crate::atomic_replace::{Faults, Step};
use std::sync::{Arc, Mutex};

type Log = Arc<Mutex<Vec<String>>>;

#[derive(Clone, Copy, Debug)]
enum F {
    Before(Step, i32),
    AfterEffect(Step, i32),
    Partial(usize),
}

const EIO: i32 = 5;
const ENOTSUP: i32 = 45;

fn faults_for(spec: &[F], log: Option<(&Log, &'static str)>) -> Faults {
    let mut faults = Faults::none();
    for fault in spec {
        faults = match *fault {
            F::Before(step, errno) => faults.fail(step, errno),
            F::AfterEffect(step, errno) => faults.fail_after_effect(step, errno),
            F::Partial(bytes) => faults.partial_write(bytes, EIO),
        };
    }
    if let Some((log, label)) = log {
        let log = log.clone();
        faults = faults.observe(move |step| log.lock().unwrap().push(format!("{label}:{step:?}")));
    }
    faults
}

/// A store with three committed revisions, then a hook that faults only the 4th mutation (seq == 3).
fn primed(root: &std::path::Path) -> (Store, Log, Arc<Mutex<Vec<u64>>>) {
    let (store, _) = open(root);
    for n in 1..=3 {
        assert!(matches!(add(&store, &format!("base-{n}"), &format!("/base/{n}"), &format!("id{n}")), MutResult::Committed { .. }));
    }
    let log: Log = Arc::new(Mutex::new(vec![]));
    let notified = Arc::new(Mutex::new(vec![]));
    {
        let log = log.clone();
        let notified = notified.clone();
        store.subscribe(Box::new(move |rev| {
            log.lock().unwrap().push(format!("notify:{rev}"));
            notified.lock().unwrap().push(rev);
        }));
    }
    (store, log, notified)
}

fn hook(kind: Kind, spec: Vec<F>, log: &Log) -> FaultHook {
    let log = log.clone();
    Box::new(move |ctx: &Ctx| {
        let label: &'static str = match ctx.kind {
            Kind::WritePrev => "prev",
            Kind::WriteMain => "main",
            Kind::Inspect => "inspect",
            Kind::Confirm => "confirm",
            _ => "other",
        };
        if ctx.seq == 3 && ctx.kind == kind {
            faults_for(&spec, Some((&log, label)))
        } else {
            faults_for(&[], Some((&log, label)))
        }
    })
}

fn disk(root: &std::path::Path, which: &str) -> Option<Doc> {
    Doc::parse(&std::fs::read(root.join("spaces").join(which)).ok()?).ok()
}

#[derive(Debug, PartialEq)]
enum Class {
    Committed,
    Failed,
    Indeterminate,
}

/// Runs the 4th mutation under `spec` and asserts every R6/R11 property for whichever class results.
fn scenario(label: &str, kind: Kind, spec: Vec<F>) -> Class {
    let root = scratch("e2");
    let (store, log, notified) = primed(&root);
    let before = std::fs::read(root.join("spaces/registry.json")).unwrap();
    store.set_hook(Some(hook(kind, spec, &log)));
    let result = add(&store, "op-4", "/base/4", "id4");
    let snapshot = store.read();
    let main = disk(&root, "registry.json");
    let class = match &result {
        MutResult::Committed { rev } => {
            assert_eq!(*rev, 4, "{label}");
            assert_eq!(snapshot.rev, 4, "{label}: published only after confirmation");
            assert_eq!(main.as_ref().unwrap().rev, 4, "{label}");
            assert_eq!(store.op_status("op-4"), OpStatus::Committed(4), "{label}");
            assert_eq!(*notified.lock().unwrap().last().unwrap(), 4);
            // Order: the confirmation (main's directory flush) happens before the notification.
            let log = log.lock().unwrap();
            let notify = log.iter().position(|l| l == "notify:4").unwrap();
            let main_sync = log.iter().rposition(|l| l == "main:SyncDir" || l.starts_with("confirm:")).unwrap_or(0);
            assert!(main_sync < notify, "{label}: flush confirmed before notify: {log:?}");
            Class::Committed
        }
        MutResult::Failed(_) => {
            assert_eq!(snapshot.rev, 3, "{label}: pre-replacement failure advances nothing");
            assert_eq!(std::fs::read(root.join("spaces/registry.json")).unwrap(), before, "{label}: target byte-identical");
            assert_eq!(store.op_status("op-4"), OpStatus::NotCommitted, "{label}");
            assert!(!notified.lock().unwrap().contains(&4), "{label}: no notification for an uncommitted rev");
            assert_eq!(store.mode(), Mode::Normal, "{label}");
            // A fresh intent (new opId) afterwards works.
            store.set_hook(None);
            assert_eq!(add(&store, "op-5", "/base/4", "id4"), MutResult::Committed { rev: 4 }, "{label}: retry as a new intent");
            Class::Failed
        }
        MutResult::Indeterminate { op_id } => {
            assert_eq!(op_id, "op-4");
            assert_eq!(snapshot.rev, 3, "{label}: readers still see the last confirmed snapshot");
            assert_eq!(store.op_status("op-4"), OpStatus::Indeterminate, "{label}");
            assert_eq!(store.mode(), Mode::Degraded, "{label}");
            assert!(!notified.lock().unwrap().contains(&4), "{label}: unconfirmed => not notified");
            assert_eq!(add(&store, "op-x", "/base/9", "id9"), MutResult::Degraded, "{label}: no further mutation while degraded");
            assert_eq!(main.as_ref().map(|d| d.rev), Some(4), "{label}: the file is the new revision (that is why it is indeterminate)");
            // Restart WITHOUT reconciling: the disk is authoritative, so the operation turns out committed.
            {
                let (restarted, report) = open(&root);
                assert_eq!(report.adopted, "main", "{label}");
                assert_eq!(restarted.read().rev, 4, "{label}: an indeterminate op may turn out committed");
                assert_eq!(restarted.op_status("op-4"), OpStatus::Committed(4), "{label}");
            }
            // Never blindly repeated: the original opId stays Indeterminate until the store reconciles.
            store.set_hook(None);
            assert_eq!(store.retry_degraded(), Mode::Normal, "{label}: reconciliation succeeds once flushes are confirmable");
            assert_eq!(store.op_status("op-4"), OpStatus::Committed(4), "{label}");
            assert_eq!(*notified.lock().unwrap().last().unwrap(), 4, "{label}: promoted => notified");
            Class::Indeterminate
        }
        other => panic!("{label}: unexpected {other:?}"),
    };
    // Whatever happened, a restart adopts a valid, consistent document (R6) and prev honours the invariant (R12).
    {
        let (restarted, report) = open(&root);
        assert!(["main"].contains(&report.adopted.as_str()), "{label}: {report:?}");
        let rev = restarted.read().rev;
        assert!(rev == 3 || rev >= 4, "{label}");
        let main = disk(&root, "registry.json").unwrap();
        let prev = disk(&root, "registry.prev.json").unwrap();
        assert!(prev.rev <= main.rev && main.rev <= prev.rev + 1, "{label}: R12 {} / {}", prev.rev, main.rev);
    }
    std::fs::remove_dir_all(root).unwrap();
    class
}

#[test]
fn e2_fault_matrix_every_writer_step_for_both_files() {
    let steps = [
        Step::StatTarget, Step::CreateTemp, Step::LockTemp, Step::WriteData, Step::CopyMetadata, Step::SetBirthTime,
        Step::SetMtime, Step::VerifyMetadata, Step::FlushTemp, Step::CheckVolume, Step::VerifyTarget, Step::RenameOver,
        Step::InspectAfterRename, Step::RemoveTemp, Step::SyncDir,
    ];
    let mut table = vec![];
    for (kind, name) in [(Kind::WritePrev, "prev"), (Kind::WriteMain, "main")] {
        for step in steps {
            for (mode, spec) in [("fail-before", F::Before(step, EIO)), ("fail-after-effect", F::AfterEffect(step, EIO))] {
                let label = format!("{name}/{step:?}/{mode}");
                let class = scenario(&label, kind, vec![spec]);
                table.push((label, class));
            }
        }
        let label = format!("{name}/partial-write");
        let class = scenario(&label, kind, vec![F::Partial(40)]);
        table.push((label, class));
    }
    let count = |c: Class| table.iter().filter(|(_, class)| *class == c).count();
    println!(
        "E2[matrix] {} cases: committed={} failed={} indeterminate-then-reconciled={}",
        table.len(),
        count(Class::Committed),
        count(Class::Failed),
        count(Class::Indeterminate)
    );
    for (label, class) in &table {
        println!("E2[matrix] {label:45} {class:?}");
    }
    // A prev-file fault can never leave the commit point reached: it must refuse the whole mutation.
    assert!(table.iter().filter(|(l, _)| l.starts_with("prev/")).all(|(_, c)| *c != Class::Indeterminate));
}

#[test]
fn e2_directory_flush_failure_after_rename_is_indeterminate_then_reconciled() {
    // The directory flush fails during the write (rename already took effect) but works later: promoted, notified.
    let class = scenario("main/SyncDir fails once", Kind::WriteMain, vec![F::Before(Step::SyncDir, EIO)]);
    assert!(matches!(class, Class::Committed | Class::Indeterminate));
    println!("E2[dir-flush-once] classified {class:?}");
}

#[test]
fn e2_persistent_unconfirmable_flush_stays_indeterminate_and_refuses_mutation() {
    let root = scratch("e2-persist");
    let (store, log, notified) = primed(&root);
    // Rename took effect, the directory flush fails, and every confirmation attempt also fails (both flush kinds).
    let hook: FaultHook = {
        let log = log.clone();
        Box::new(move |ctx: &Ctx| {
            let spec: Vec<F> = match (ctx.kind, ctx.seq) {
                (Kind::WriteMain, 3) => vec![F::Before(Step::SyncDir, EIO)],
                (Kind::Confirm, _) => vec![F::Before(Step::ConfirmSyncDir, EIO), F::Before(Step::ConfirmFlushFile, EIO)],
                _ => vec![],
            };
            faults_for(&spec, Some((&log, "x")))
        })
    };
    store.set_hook(Some(hook));
    let result = add(&store, "op-4", "/base/4", "id4");
    assert_eq!(result, MutResult::Indeterminate { op_id: "op-4".into() });
    assert_eq!(store.read().rev, 3);
    assert_eq!(store.op_status("op-4"), OpStatus::Indeterminate);
    assert!(!notified.lock().unwrap().contains(&4));
    assert_eq!(add(&store, "op-5", "/base/5", "id5"), MutResult::Degraded);
    // The slow timer keeps retrying; still unconfirmable.
    assert_eq!(store.retry_degraded(), Mode::Degraded);
    assert_eq!(store.op_status("op-4"), OpStatus::Indeterminate);
    // Repeating the SAME opId must not blindly re-apply: it is refused while degraded, and status stays Indeterminate.
    assert_eq!(add(&store, "op-4", "/base/4", "id4"), MutResult::Degraded);
    store.set_hook(None);
    assert_eq!(store.retry_degraded(), Mode::Normal);
    assert_eq!(store.op_status("op-4"), OpStatus::Committed(4));
    // Idempotent retry of the same opId now returns the original result and applies nothing again.
    assert_eq!(add(&store, "op-4", "/base/4", "id4"), MutResult::Committed { rev: 4 });
    assert_eq!(store.read().rev, 4);
    println!("E2[persistent] degraded -> retried -> promoted; same-opId retry is idempotent");
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn e2_lost_acknowledgement_after_rename_is_resolved_by_inspection() {
    let class = scenario("main/RenameOver error after effect", Kind::WriteMain, vec![F::AfterEffect(Step::RenameOver, EIO)]);
    println!("E2[lost-ack] classified {class:?}");
    assert_ne!(class, Class::Failed, "the rename took effect, so the commit cannot be reported as not committed");
}

#[test]
fn e2_unsupported_full_flush_never_acknowledges() {
    // F_FULLFSYNC rejected (ENOTSUP): the writer falls back to fsync and reports Unconfirmed. The store must NOT
    // acknowledge it as a commit; with confirmation also unsupported it ends degraded, never `Committed`.
    let root = scratch("e2-unsup");
    let (store, log, notified) = primed(&root);
    store.set_hook(Some({
        let log = log.clone();
        Box::new(move |ctx: &Ctx| {
            let spec: Vec<F> = match (ctx.kind, ctx.seq) {
                (Kind::WriteMain, 3) => vec![F::Before(Step::FlushTemp, ENOTSUP), F::Before(Step::SyncDir, ENOTSUP)],
                (Kind::Confirm, _) => vec![F::Before(Step::ConfirmFlushFile, ENOTSUP), F::Before(Step::ConfirmSyncDir, ENOTSUP)],
                _ => vec![],
            };
            faults_for(&spec, Some((&log, "x")))
        })
    }));
    let result = add(&store, "op-4", "/base/4", "id4");
    println!("E2[unsupported-flush] result = {result:?}");
    assert!(!matches!(result, MutResult::Committed { .. }), "an unsupported flush is never a successful commit");
    assert_eq!(store.read().rev, 3);
    assert!(!notified.lock().unwrap().contains(&4));
    std::fs::remove_dir_all(root).unwrap();

    // At launch, a volume that cannot confirm flushes starts read-only and acknowledges nothing.
    let root = scratch("e2-unsup-launch");
    let (store, _) = Store::open_with_hook(
        &root.join("spaces"),
        Clock::real(),
        Some(Box::new(|ctx: &Ctx| {
            if ctx.kind == Kind::WriteProbe {
                Faults::none().fail(Step::FlushTemp, ENOTSUP).fail(Step::SyncDir, ENOTSUP)
            } else {
                Faults::none()
            }
        })),
    );
    assert!(matches!(store.mode(), Mode::ReadOnly(_)));
    assert!(matches!(add(&store, "op-1", "/a", "a"), MutResult::Unavailable(_)));
    assert_eq!(store.read().rev, 0);
    println!("E2[unsupported-flush] launch probe => read-only, mutation refused");
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn e2_acknowledgement_order_flushes_then_publish_then_notify() {
    let root = scratch("e2-order");
    let (store, log, _) = primed(&root);
    store.set_hook(Some(hook(Kind::WriteMain, vec![], &log)));
    log.lock().unwrap().clear();
    assert!(matches!(add(&store, "op-4", "/base/4", "id4"), MutResult::Committed { rev: 4 }));
    let log = log.lock().unwrap().clone();
    let at = |needle: &str| log.iter().position(|l| l == needle).unwrap_or_else(|| panic!("{needle} missing in {log:?}"));
    let prev_flush = at("prev:FlushTemp");
    let prev_dir = at("prev:SyncDir");
    let main_flush = at("main:FlushTemp");
    let main_rename = at("main:RenameOver");
    let main_dir = at("main:SyncDir");
    let notify = at("notify:4");
    assert!(prev_flush < prev_dir && prev_dir < main_flush && main_flush < main_rename && main_rename < main_dir && main_dir < notify);
    println!("E2[order] prev(flush,dir) -> main(flush,rename,dir) -> notify : {log:?}");
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
#[ignore = "long: >= 500 SIGKILLs; build the worker first: cargo build --release --bin crash_worker"]
fn e2_kill_minus_nine_at_random_instants() {
    use std::io::BufRead;
    let exe = std::env::current_exe().unwrap();
    let worker = std::env::var_os("ADR073_CRASH_WORKER").map(std::path::PathBuf::from)
        .unwrap_or_else(|| exe.parent().unwrap().parent().unwrap().join("crash_worker"));
    assert!(worker.exists(), "build the worker first: {worker:?}");
    let root = scratch("e2-kill");
    let dir = root.join("spaces");
    let mut rng = Rng::new(0xDEAD_BEEF);
    let mut max_acked = 0u64;
    let mut last_recovered = 0u64;
    let mut cold_starts = 0usize;
    let kills: usize = std::env::var("E2_KILLS").ok().and_then(|v| v.parse().ok()).unwrap_or(500);
    let (mut prev_adopted, mut unacked_present, mut unacked_absent) = (0, 0, 0);
    for cycle in 0..kills {
        let mut child = std::process::Command::new(&worker)
            .arg(&dir)
            .arg(format!("c{cycle}"))
            .stdout(std::process::Stdio::piped())
            .spawn()
            .unwrap();
        let stdout = child.stdout.take().unwrap();
        let acks: Arc<Mutex<Vec<(String, u64)>>> = Arc::new(Mutex::new(vec![]));
        let attempted: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(vec![]));
        let reader = {
            let acks = acks.clone();
            let attempted = attempted.clone();
            std::thread::spawn(move || {
                let mut output = std::io::BufReader::new(stdout);
                loop {
                    let mut line = String::new();
                    if output.read_line(&mut line).expect("read worker output") == 0 { break; }
                    // SIGKILL may interrupt the last log frame. An incomplete line is not an observed ACK.
                    if !line.ends_with('\n') { break; }
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    match parts.as_slice() {
                        ["ACK", op, rev] => acks.lock().unwrap().push((op.to_string(), rev.parse().unwrap())),
                        _ => {}
                    }
                    attempted.lock().unwrap().push(line);
                }
            })
        };
        // 40..400 ms: commits take ~30 ms each, so kills land inside every phase of the write sequence.
        std::thread::sleep(std::time::Duration::from_millis(40 + rng.below(360)));
        child.kill().unwrap(); // SIGKILL
        child.wait().unwrap();
        reader.join().unwrap();
        let (store, report) = Store::open(&dir, Clock::real());
        let doc = store.read();
        assert!(!report.unreadable && !report.unknown_schema, "cycle {cycle}: {report:?}");
        assert_eq!(store.mode(), Mode::Normal, "cycle {cycle}: recovery must finish: {report:?}");
        if report.adopted == "prev" {
            prev_adopted += 1;
        }
        assert!(doc.rev >= max_acked, "cycle {cycle}: acknowledged revision {max_acked} lost (doc at {})", doc.rev);
        for (op, rev) in acks.lock().unwrap().iter() {
            max_acked = max_acked.max(*rev);
            assert_eq!(store.op_status(op), OpStatus::Committed(*rev), "cycle {cycle}: acknowledged {op} not durable");
        }
        // A complete ACK is durable. A revision confirmed by the preceding recovery also cannot disappear.
        let confirmed_floor = max_acked.max(last_recovered);
        assert!(doc.rev <= confirmed_floor + 1, "cycle {cycle}: more than one unacknowledged commit");
        if doc.rev > confirmed_floor { unacked_present += 1 } else { unacked_absent += 1 }
        let read_generation = |name: &str| match std::fs::read(dir.join(name)) {
            Ok(bytes) => Some(bytes),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => panic!("cycle {cycle}: cannot read {name}: {error}"),
        };
        let main = read_generation("registry.json");
        let prev = read_generation("registry.prev.json");
        if main.is_none() && prev.is_none() { cold_starts += 1; }
        crate::crash_checks::validate_recovered_generations(&doc, main.as_deref(), prev.as_deref(), confirmed_floor)
            .unwrap_or_else(|error| panic!("cycle {cycle}: {error}; recovery={report:?}; worker output={:?}", attempted.lock().unwrap()));
        last_recovered = doc.rev;
        if (cycle + 1) % 50 == 0 {
            println!("E2[kill-9] {}/{} cycles checked; confirmed rev {}; cold-start kills {}", cycle + 1, kills, last_recovered, cold_starts);
        }
    }
    println!(
        "E2[kill-9] {kills} kills: acknowledged commits always present; prev adopted {prev_adopted}x (media damage only); \
         an unacknowledged commit had landed in {unacked_present} cycles and was absent in {unacked_absent}; final rev {}",
        open(&root).0.read().rev
    );
    println!("E2[kill-9] valid pre-first-commit recoveries: {cold_starts}");
    assert_eq!(prev_adopted, 0, "a process kill must never invalidate registry.json");
    std::fs::remove_dir_all(root).unwrap();
}
