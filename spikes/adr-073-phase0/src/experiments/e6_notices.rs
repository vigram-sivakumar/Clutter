use super::*;
use std::sync::{Arc, Barrier};

#[test]
fn e6_concurrent_loss_publishers_commit_one_notice_per_episode() {
    let root = scratch("e6-loss");
    let (store, _) = open(&root);
    add(&store, "A", "/A", "A");
    add(&store, "B", "/B", "B");
    let store = Arc::new(store);
    let barrier = Arc::new(Barrier::new(3));
    let key = store.episode_key("/A");
    let handles: Vec<_> = (0..3)
        .map(|w| {
            let store = store.clone();
            let barrier = barrier.clone();
            let key = key.clone();
            std::thread::spawn(move || {
                barrier.wait();
                store.mutate(
                    &format!("loss-{w}"),
                    Intent::PublishLost {
                        from: "/A".into(),
                        space_id: "A".into(),
                        fallback: Some("/B".into()),
                        epoch_key: key,
                    },
                    &format!("w{w}"),
                )
            })
        })
        .collect();
    let outcomes: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    assert_eq!(
        outcomes
            .iter()
            .filter(|r| matches!(r, MutResult::Committed { .. }))
            .count(),
        1
    );
    assert_eq!(
        outcomes
            .iter()
            .filter(|r| matches!(r, MutResult::NoChange { .. }))
            .count(),
        2
    );
    let doc = store.read();
    assert_eq!(doc.notices.iter().filter(|n| n.kind == "lost").count(), 1);
    assert_eq!(doc.rev, 3);
    assert_eq!(follow(&doc, "/A", 2).0, Dest::Space("/B".into()));
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn e6_old_loss_episode_is_refused_after_the_space_reopens() {
    let root = scratch("e6-stale-epoch");
    let (store, _) = open(&root);
    add(&store, "A", "/A", "A");
    let old = store.episode_key("/A");
    store.reopened("/A");
    let before = store.read().to_bytes();
    assert!(matches!(
        store.mutate(
            "stale",
            Intent::PublishLost {
                from: "/A".into(),
                space_id: "A".into(),
                fallback: None,
                epoch_key: old
            },
            "A"
        ),
        MutResult::Refused(_)
    ));
    assert_eq!(store.read().to_bytes(), before);
    assert!(matches!(
        store.mutate(
            "current",
            Intent::PublishLost {
                from: "/A".into(),
                space_id: "A".into(),
                fallback: None,
                epoch_key: store.episode_key("/A")
            },
            "A"
        ),
        MutResult::Committed { .. }
    ));
    let previous_launch = store.launch.clone();
    let previous_episode = store.episode_key("/A");
    drop(store);
    let (restarted, _) = open(&root);
    assert_ne!(restarted.launch, previous_launch);
    assert!(matches!(
        restarted.mutate(
            "previous-launch",
            Intent::PublishLost {
                from: "/A".into(),
                space_id: "A".into(),
                fallback: None,
                epoch_key: previous_episode
            },
            "A"
        ),
        MutResult::Refused(_)
    ));
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn e6_episode_for_one_space_cannot_be_published_for_another() {
    let root = scratch("e6-wrong-epoch");
    let (store, _) = open(&root);
    add(&store, "A", "/A", "A");
    add(&store, "B", "/B", "B");
    let before = store.read().to_bytes();
    assert!(matches!(
        store.mutate(
            "wrong",
            Intent::PublishLost {
                from: "/B".into(),
                space_id: "B".into(),
                fallback: None,
                epoch_key: store.episode_key("/A")
            },
            "A"
        ),
        MutResult::Refused(_)
    ));
    assert_eq!(store.read().to_bytes(), before);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn e6_notice_replay_is_ordered_and_idempotent() {
    let root = scratch("e6-chain");
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
            to: "/moved-B".into(),
            space_id: "/B".into(),
        },
        "B",
    );
    store.mutate(
        "remove-B",
        Intent::Remove {
            path: "/moved-B".into(),
            space_id: "/B".into(),
            fallback: Some("/C".into()),
        },
        "C",
    );
    let doc = store.read();
    assert!(doc.notices.windows(2).all(|pair| pair[0].rev < pair[1].rev));
    let (destination, applied) = follow(&doc, "/A", initial);
    assert_eq!(destination, Dest::Space("/C".into()));
    assert_eq!(applied, doc.rev);
    assert_eq!(follow(&doc, "/C", applied), (destination, applied));
    std::fs::remove_dir_all(root).unwrap();
}
