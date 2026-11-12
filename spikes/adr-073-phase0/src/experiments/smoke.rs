use super::*;

#[test]
fn smoke_commit_and_latency() {
    let root = scratch("smoke");
    let (store, report) = open(&root);
    assert_eq!(report.adopted, "empty");
    let space = make_space(&root, "A", "id-A");
    let started = std::time::Instant::now();
    assert_eq!(add(&store, "op-1", &space, "id-A"), MutResult::Committed { rev: 1 });
    for n in 2..22 {
        let other = make_space(&root, &format!("S{n}"), &format!("id-{n}"));
        assert!(matches!(add(&store, &format!("op-{n}"), &other, &format!("id-{n}")), MutResult::Committed { .. }));
    }
    println!("21 durable commits in {:?} ({:?} each)", started.elapsed(), started.elapsed() / 21);
    assert_eq!(store.read().rev, 21);
    let (again, report) = open(&root);
    assert_eq!(report.adopted, "main");
    assert_eq!(again.read().rev, 21);
    assert_eq!(again.op_status("op-5"), OpStatus::Committed(5));
    assert_eq!(again.op_status("nope"), OpStatus::UnknownOpId);
    std::fs::remove_dir_all(root).unwrap();
}
