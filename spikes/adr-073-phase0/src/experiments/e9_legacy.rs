use super::*;
use crate::atomic_replace::{Faults, Step};
use std::fs;

fn blob(paths: &[&str], active: Option<&str>, marker: u64) -> String {
    serde_json::json!({ "paths": paths, "activePath": active, "marker": marker }).to_string()
}

#[test]
fn e9_baseline_is_immutable_and_removed_entries_never_return_on_reupgrade() {
    let root = scratch("e9-baseline");
    let (store, _) = open(&root);
    let a = make_space(&root, "A", "A");
    let b = make_space(&root, "B", "B");
    let original = blob(&[&a], Some(&a), 0);
    assert_eq!(store.reconcile_legacy("first", Some(&original)).unwrap(), 1);
    let baseline = fs::read(baseline_path(&store.dir)).unwrap();
    let rev = store.read().rev;
    assert_eq!(
        store.reconcile_legacy("again", Some(&original)).unwrap(),
        rev
    );
    store.mutate(
        "remove-A",
        Intent::Remove {
            path: a.clone(),
            space_id: "A".into(),
            fallback: None,
        },
        "A",
    );
    let upgrade = blob(&[&a, &b], Some(&a), 1);
    store.reconcile_legacy("upgrade", Some(&upgrade)).unwrap();
    assert_eq!(
        store
            .read()
            .registry
            .entries
            .iter()
            .map(|e| e.path.as_str())
            .collect::<Vec<_>>(),
        [b.as_str()]
    );
    store.mutate(
        "remove-B",
        Intent::Remove {
            path: b.clone(),
            space_id: "B".into(),
            fallback: None,
        },
        "B",
    );
    store
        .reconcile_legacy("again", Some(&blob(&[&a, &b], Some(&b), 2)))
        .unwrap();
    assert!(store.read().registry.entries.is_empty());
    assert_eq!(fs::read(baseline_path(&store.dir)).unwrap(), baseline);
    let (reopened, _) = open(&root);
    reopened
        .reconcile_legacy("relaunch", Some(&upgrade))
        .unwrap();
    assert!(reopened.read().registry.entries.is_empty());
    assert_eq!(fs::read(baseline_path(&reopened.dir)).unwrap(), baseline);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn e9_old_build_rename_follows_identity_and_preserves_last_opened() {
    let root = scratch("e9-rename");
    let (store, _) = open(&root);
    let a = make_space(&root, "A", "same-space");
    store
        .reconcile_legacy("first", Some(&blob(&[&a], Some(&a), 0)))
        .unwrap();
    let to = root.join("Renamed");
    fs::rename(&a, &to).unwrap();
    let to = canon(to.to_str().unwrap());
    store
        .reconcile_legacy("upgrade", Some(&blob(&[&to], Some(&to), 1)))
        .unwrap();
    let doc = store.read();
    doc.validate().unwrap();
    assert_eq!(doc.registry.entries.len(), 1);
    assert_eq!(doc.registry.entries[0].path, to);
    assert_eq!(doc.registry.entries[0].space_id, "same-space");
    assert_eq!(doc.registry.last_opened.as_deref(), Some(to.as_str()));
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn e9_baseline_survives_an_interruption_before_the_first_registry_document() {
    let root = scratch("e9-first-interruption");
    let a = make_space(&root, "A", "A");
    let original = blob(&[&a], Some(&a), 0);
    let dir = root.join("spaces");
    fs::create_dir_all(&dir).unwrap();
    let bytes = serde_json::to_vec(&Baseline::from_blob(&original)).unwrap();
    fs::write(baseline_path(&dir), &bytes).unwrap();
    let (store, _) = open(&root);
    store.reconcile_legacy("resume", None).unwrap();
    assert_eq!(store.read().registry.entries.len(), 1);
    assert_eq!(store.read().registry.entries[0].path, a);
    assert_eq!(fs::read(baseline_path(&dir)).unwrap(), bytes);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn e9_an_unconfirmed_baseline_cannot_be_adopted_just_because_the_file_exists() {
    let root = scratch("e9-unconfirmed-baseline");
    let (store, _) = open(&root);
    let a = make_space(&root, "A", "A");
    let original = blob(&[&a], Some(&a), 0);
    store.set_hook(Some(Box::new(|ctx| {
        if ctx.kind == Kind::WriteBaseline {
            Faults::none().fail(Step::SyncDir, 5)
        } else {
            Faults::none()
        }
    })));
    assert!(store.reconcile_legacy("first", Some(&original)).is_err());
    assert!(baseline_path(&store.dir).exists());
    assert_eq!(store.read().rev, 0);
    store.set_hook(Some(Box::new(|ctx| {
        if ctx.kind == Kind::Confirm {
            Faults::none().fail(Step::ConfirmFlushFile, 5)
        } else {
            Faults::none()
        }
    })));
    assert!(store.reconcile_legacy("retry", Some(&original)).is_err());
    assert_eq!(store.read().rev, 0);
    store.set_hook(None);
    assert_eq!(
        store
            .reconcile_legacy("confirmed", Some(&original))
            .unwrap(),
        1
    );
    fs::remove_dir_all(root).unwrap();
}
