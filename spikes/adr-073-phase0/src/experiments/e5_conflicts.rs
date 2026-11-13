use super::*;
use std::sync::{Arc, Barrier};

fn removed(store: &Store, op: &str, path: &str, id: &str, fallback: Option<&str>) -> MutResult {
    store.mutate(
        op,
        Intent::Remove {
            path: path.into(),
            space_id: id.into(),
            fallback: fallback.map(String::from),
        },
        "test",
    )
}

#[test]
fn e5_stale_intents_never_resurrect_a_removed_space() {
    let root = scratch("e5-stale");
    let (store, _) = open(&root);
    assert!(matches!(
        add(&store, "add-A", "/A", "A"),
        MutResult::Committed { .. }
    ));
    assert!(matches!(
        add(&store, "add-B", "/B", "B"),
        MutResult::Committed { .. }
    ));
    assert!(matches!(
        removed(&store, "remove", "/A", "A", Some("/B")),
        MutResult::Committed { .. }
    ));
    let before = store.read().to_bytes();
    for (n, intent) in [
        Intent::Remove {
            path: "/A".into(),
            space_id: "A".into(),
            fallback: Some("/B".into()),
        },
        Intent::Replace {
            from: "/A".into(),
            to: "/moved".into(),
            space_id: "A".into(),
        },
        Intent::BeginRename {
            path: "/A".into(),
            to: "/renamed".into(),
            space_id: "A".into(),
        },
        Intent::CompleteRename {
            from: "/A".into(),
            to: "/renamed".into(),
            space_id: "A".into(),
        },
        Intent::SetLastOpened {
            path: "/A".into(),
            space_id: "A".into(),
        },
    ]
    .into_iter()
    .enumerate()
    {
        assert!(matches!(
            store.mutate(&format!("stale-{n}"), intent, "test"),
            MutResult::Stale(_)
        ));
        assert_eq!(store.read().to_bytes(), before);
    }
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn e5_stale_identity_at_a_reused_path_cannot_remove_the_replacement() {
    let root = scratch("e5-path-reuse");
    let (store, _) = open(&root);
    add(&store, "old", "/A", "old-id");
    removed(&store, "remove-old", "/A", "old-id", None);
    add(&store, "replacement", "/A", "new-id");
    let before = store.read().to_bytes();
    assert!(matches!(
        removed(&store, "stale-remove", "/A", "old-id", None),
        MutResult::Stale(_)
    ));
    assert!(matches!(
        store.mutate(
            "stale-move",
            Intent::Replace {
                from: "/A".into(),
                to: "/X".into(),
                space_id: "old-id".into()
            },
            "test"
        ),
        MutResult::Stale(_)
    ));
    assert_eq!(store.read().to_bytes(), before);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn e5_removing_a_fallback_invalidates_the_old_decision_and_chains_existing_notices() {
    let root = scratch("e5-fallback");
    let (store, _) = open(&root);
    for path in ["/A", "/B", "/C"] {
        add(&store, path, path, path);
    }
    removed(&store, "remove-B", "/B", "/B", Some("/C"));
    let before = store.read().to_bytes();
    assert!(matches!(
        removed(&store, "outdated-choice", "/A", "/A", Some("/B")),
        MutResult::Stale(_)
    ));
    assert_eq!(store.read().to_bytes(), before);
    assert!(matches!(
        removed(&store, "new-choice", "/A", "/A", Some("/C")),
        MutResult::Committed { .. }
    ));
    assert_eq!(follow(&store.read(), "/B", 0).0, Dest::Space("/C".into()));
    assert_eq!(follow(&store.read(), "/A", 0).0, Dest::Space("/C".into()));
    std::fs::remove_dir_all(root).unwrap();
}

fn relocation_race(iterations: usize) {
    for iteration in 0..iterations {
        let root = scratch("e5-remove-move");
        let (store, _) = open(&root);
        add(&store, "A", "/A", "A");
        add(&store, "B", "/B", "B");
        let store = Arc::new(store);
        let barrier = Arc::new(Barrier::new(2));
        let a = {
            let store = store.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                let mut rng = Rng::new(0xE500 + iteration as u64);
                barrier.wait();
                rng.jitter(if iterations >= 1000 { 50 } else { 5 });
                store.mutate(
                    "relocate",
                    Intent::Replace {
                        from: "/A".into(),
                        to: "/moved".into(),
                        space_id: "A".into(),
                    },
                    "A",
                )
            })
        };
        let b = {
            let store = store.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                let mut rng = Rng::new(0xE600 + iteration as u64);
                barrier.wait();
                rng.jitter(if iterations >= 1000 { 50 } else { 5 });
                removed(&store, "remove", "/A", "A", Some("/B"))
            })
        };
        let outcomes = [a.join().unwrap(), b.join().unwrap()];
        assert_eq!(
            outcomes
                .iter()
                .filter(|r| matches!(r, MutResult::Committed { .. }))
                .count(),
            1,
            "{outcomes:?}"
        );
        assert_eq!(
            outcomes
                .iter()
                .filter(|r| matches!(r, MutResult::Stale(_)))
                .count(),
            1
        );
        let doc = store.read();
        doc.validate().unwrap();
        assert_eq!(doc.rev, 3);
        assert!(doc.registry.entries.iter().all(|e| e.path != "/A"));
        let expected = if doc.registry.entries.iter().any(|e| e.path == "/moved") {
            Dest::Space("/moved".into())
        } else {
            Dest::Space("/B".into())
        };
        // Three independent followers, including one that missed every notification, read one final order.
        for _ in 0..3 {
            assert_eq!(follow(&doc, "/A", 0).0, expected);
        }
        std::fs::remove_dir_all(root).unwrap();
    }
}

#[test]
fn e5_remove_relocate_race_quick() {
    relocation_race(12);
}

#[test]
#[ignore = "long: 1000 remove/relocate interleavings; run using the full Mac profile"]
fn e5_remove_relocate_race_full() {
    relocation_race(1000);
}
