use super::*;

/// Tests authoritative snapshot replay only. There is no Tauri notification delivery or frontend timer here.
#[test]
fn e7_dropped_duplicated_and_reordered_signals_do_not_change_snapshot_replay() {
    let root = scratch("e7-replay");
    let (store, _) = open(&root);
    for path in ["/A", "/B", "/C"] {
        add(&store, path, path, path);
    }
    let initial = store.read().rev;
    store.mutate(
        "remove-A",
        Intent::Remove {
            path: "/A".into(),
            space_id: "/A".into(),
            fallback: Some("/B".into()),
        },
        "A",
    );
    store.mutate(
        "move-B",
        Intent::Replace {
            from: "/B".into(),
            to: "/moved".into(),
            space_id: "/B".into(),
        },
        "B",
    );
    store.mutate(
        "remove-B",
        Intent::Remove {
            path: "/moved".into(),
            space_id: "/B".into(),
            fallback: Some("/C".into()),
        },
        "C",
    );
    let doc = store.read();
    for signals in [vec![], vec![6, 6, 4, 5, 3], vec![4], vec![999]] {
        let mut current = "/A".to_string();
        let mut applied = initial;
        // The notification number is never applied as state. Empty delivery still ends with one backstop read.
        for _signal in signals.into_iter().map(Some).chain(std::iter::once(None)) {
            let (destination, high) = follow(&doc, &current, applied);
            current = match destination {
                Dest::Space(path) => path,
                Dest::Welcome => panic!("unexpected Welcome"),
            };
            applied = high;
        }
        assert_eq!(current, "/C");
        assert_eq!(applied, doc.rev);
    }
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn e7_a_follower_older_than_retained_notices_resolves_by_stable_space_id() {
    let root = scratch("e7-retention");
    let (store, _) = open(&root);
    add(&store, "A", "/A", "A");
    let initial = store.read().rev;
    let mut from = "/A".to_string();
    for n in 0..NOTICES_KEPT + 2 {
        let to = format!("/move-{n}");
        assert!(matches!(
            store.mutate(
                &format!("move-{n}"),
                Intent::Replace {
                    from: from.clone(),
                    to: to.clone(),
                    space_id: "A".into()
                },
                "A"
            ),
            MutResult::Committed { .. }
        ));
        from = to;
    }
    let doc = store.read();
    assert_eq!(doc.notices.len(), NOTICES_KEPT);
    assert!(doc
        .notices
        .iter()
        .all(|notice| notice.from.as_deref() != Some("/A")));
    assert_eq!(settle(&doc, "/A", "A", initial), Dest::Space(from));
    std::fs::remove_dir_all(root).unwrap();
}
