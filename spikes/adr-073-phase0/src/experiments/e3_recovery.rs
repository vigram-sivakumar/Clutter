use super::*;
use crate::atomic_replace::{Faults, Step};
use std::fs;

fn generation(rev: u64) -> Doc {
    let mut doc = Doc::empty();
    doc.rev = rev;
    doc.registry.entries.push(Entry {
        path: "/fixture/A".into(),
        space_id: "A".into(),
    });
    doc.registry.last_opened = Some("/fixture/A".into());
    doc.ops.push(OpRec {
        op_id: format!("op-{rev}"),
        rev,
    });
    doc
}

fn seed(name: &str, main: Option<&[u8]>, prev: Option<&[u8]>) -> PathBuf {
    let root = scratch(name);
    let dir = root.join("spaces");
    fs::create_dir_all(&dir).unwrap();
    if let Some(bytes) = main {
        fs::write(dir.join("registry.json"), bytes).unwrap();
    }
    if let Some(bytes) = prev {
        fs::write(dir.join("registry.prev.json"), bytes).unwrap();
    }
    root
}

fn normalized(root: &std::path::Path, expected: &Doc) {
    let bytes = expected.to_bytes();
    for file in ["registry.json", "registry.prev.json"] {
        assert_eq!(
            fs::read(root.join("spaces").join(file)).unwrap(),
            bytes,
            "{file}"
        );
    }
}

#[test]
fn e3_adoption_table_and_normalization() {
    // Disk images model interruption points. They do not themselves prove power-loss durability.
    for (label, main, prev, adopted, rev) in [
        (
            "prev-written-before-main",
            Some(generation(7).to_bytes()),
            Some(generation(7).to_bytes()),
            "main",
            7,
        ),
        (
            "main-landed-before-ack",
            Some(generation(8).to_bytes()),
            Some(generation(7).to_bytes()),
            "main",
            8,
        ),
        (
            "missing-prev",
            Some(generation(8).to_bytes()),
            None,
            "main",
            8,
        ),
        (
            "bad-prev",
            Some(generation(8).to_bytes()),
            Some(b"truncated".to_vec()),
            "main",
            8,
        ),
        (
            "bad-main",
            Some(b"truncated".to_vec()),
            Some(generation(7).to_bytes()),
            "prev",
            7,
        ),
        (
            "missing-main",
            None,
            Some(generation(7).to_bytes()),
            "prev",
            7,
        ),
        (
            "forged-prev-ahead",
            Some(generation(7).to_bytes()),
            Some(generation(8).to_bytes()),
            "prev",
            8,
        ),
    ] {
        let root = seed(label, main.as_deref(), prev.as_deref());
        let (store, report) = open(&root);
        assert_eq!(report.adopted, adopted, "{label}: {report:?}");
        assert_eq!(store.mode(), Mode::Normal, "{label}");
        assert_eq!(store.read().rev, rev, "{label}");
        assert_eq!(
            store.op_status(&format!("op-{rev}")),
            OpStatus::Committed(rev)
        );
        normalized(&root, &generation(rev));
        if label == "forged-prev-ahead" || label == "bad-main" {
            assert!(!report.diagnostics.is_empty());
        }
        if label == "bad-main" {
            assert_eq!(report.quarantined.len(), 1);
            assert_eq!(
                fs::read(root.join("spaces").join(&report.quarantined[0])).unwrap(),
                b"truncated"
            );
        }
        fs::remove_dir_all(root).unwrap();
    }
}

#[test]
fn e3_checksum_or_invariant_damage_uses_previous_generation() {
    let mut invalid = generation(8);
    invalid
        .registry
        .entries
        .push(invalid.registry.entries[0].clone()); // Checksummed, but invalid.
    let mut wrong_checksum: serde_json::Value =
        serde_json::from_slice(&generation(8).to_bytes()).unwrap();
    wrong_checksum["rev"] = 9.into();
    for bytes in [
        invalid.to_bytes(),
        serde_json::to_vec(&wrong_checksum).unwrap(),
    ] {
        let root = seed("e3-damage", Some(&bytes), Some(&generation(7).to_bytes()));
        let (store, report) = open(&root);
        assert_eq!(store.read().rev, 7);
        assert_eq!(report.adopted, "prev");
        assert_eq!(report.quarantined.len(), 1);
        assert_eq!(
            fs::read(root.join("spaces").join(&report.quarantined[0])).unwrap(),
            bytes
        );
        normalized(&root, &generation(7));
        fs::remove_dir_all(root).unwrap();
    }
}

#[test]
fn e3_both_corrupt_preserves_bytes_baseline_and_recovery_records() {
    let root = seed("e3-both-corrupt", Some(b"bad-main"), Some(b"bad-prev"));
    let baseline = root.join("spaces/legacy-import.json");
    fs::write(&baseline, b"baseline-must-survive").unwrap();
    let recovery = root.join("recovery/legacy-session.json");
    fs::create_dir_all(recovery.parent().unwrap()).unwrap();
    fs::write(&recovery, b"unsaved-user-content").unwrap();
    let (store, report) = open(&root);
    assert!(report.unreadable);
    assert_eq!(report.quarantined.len(), 2);
    let mut kept: Vec<_> = report
        .quarantined
        .iter()
        .map(|name| fs::read(root.join("spaces").join(name)).unwrap())
        .collect();
    kept.sort();
    assert_eq!(kept, vec![b"bad-main".to_vec(), b"bad-prev".to_vec()]);
    assert_eq!(fs::read(baseline).unwrap(), b"baseline-must-survive");
    assert_eq!(fs::read(recovery).unwrap(), b"unsaved-user-content");
    assert!(store.read().registry.entries.is_empty());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn e3_unknown_schema_refuses_mutation_without_rewriting_either_generation() {
    let mut future = generation(8);
    future.schema = SCHEMA + 1;
    for future_in_main in [true, false] {
        let (main, prev) = if future_in_main {
            (future.to_bytes(), generation(7).to_bytes())
        } else {
            (generation(8).to_bytes(), future.to_bytes())
        };
        let root = seed("e3-future", Some(&main), Some(&prev));
        let (store, report) = open(&root);
        assert!(report.unknown_schema);
        assert!(matches!(
            add(&store, "refused", "/new", "new"),
            MutResult::Unavailable(_)
        ));
        assert_eq!(fs::read(root.join("spaces/registry.json")).unwrap(), main);
        assert_eq!(
            fs::read(root.join("spaces/registry.prev.json")).unwrap(),
            prev
        );
        fs::remove_dir_all(root).unwrap();
    }
}

#[test]
fn e3_failed_normalization_never_publishes_an_unconfirmed_startup_snapshot() {
    let root = seed(
        "e3-normalization-fails",
        Some(&generation(8).to_bytes()),
        Some(&generation(7).to_bytes()),
    );
    let (store, report) = Store::open_with_hook(
        &root.join("spaces"),
        Clock::real(),
        Some(Box::new(|ctx| {
            if ctx.kind == Kind::WritePrev {
                Faults::none().fail(Step::CreateTemp, 5)
            } else {
                Faults::none()
            }
        })),
    );
    assert!(report.read_only.is_some());
    assert!(matches!(store.mode(), Mode::ReadOnly(_)));
    assert!(matches!(
        add(&store, "refused", "/new", "new"),
        MutResult::Unavailable(_)
    ));
    assert_eq!(
        store.read().rev,
        0,
        "no startup snapshot may be published until normalization confirms durability"
    );
    assert_eq!(
        fs::read(root.join("spaces/registry.json")).unwrap(),
        generation(8).to_bytes()
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn e3_orphan_temporaries_are_kept_outside_the_registry() {
    let root = seed(
        "e3-orphans",
        Some(&generation(8).to_bytes()),
        Some(&generation(7).to_bytes()),
    );
    let name = ".clutter-tmp.orphan-fixture";
    fs::write(root.join("spaces").join(name), b"never-committed").unwrap();
    let (store, report) = open(&root);
    assert_eq!(store.read().rev, 8);
    assert_eq!(report.moved_aside_temps, 1);
    assert_eq!(
        fs::read(root.join("spaces/orphaned-temps").join(name)).unwrap(),
        b"never-committed"
    );
    fs::remove_dir_all(root).unwrap();
}
