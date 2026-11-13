use super::*;

#[test]
fn live_and_parsed_documents_have_identical_canonical_bytes_but_different_checksum_fields() {
    let live = fixture();
    let bytes = live.to_bytes();
    let restored = Doc::parse(&bytes).unwrap();
    assert!(
        live.checksum.is_empty(),
        "serialization must not mutate its input"
    );
    assert!(!restored.checksum.is_empty());
    assert_eq!(restored.to_bytes(), bytes);
    assert_eq!(live.to_bytes(), bytes);

    let mut changed = restored.clone();
    changed.registry.entries[0].space_id = "changed-on-disk".into();
    assert_ne!(
        changed.to_bytes(),
        bytes,
        "canonical comparison must still detect a payload change"
    );
    let mut damaged: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    damaged["checksum"] = "wrong".into();
    assert!(
        Doc::parse(&serde_json::to_vec(&damaged).unwrap()).is_err(),
        "checksum validation must not be bypassed"
    );
}

#[test]
fn last_opened_checks_identity_even_when_the_path_is_already_current() {
    let doc = fixture();
    let intent = |id: &str| Intent::SetLastOpened {
        path: "/B".into(),
        space_id: id.into(),
    };
    let changed = next(&doc, &intent("B"));
    assert_eq!(changed.registry.last_opened.as_deref(), Some("/B"));
    assert!(matches!(
        evaluate(&changed, &intent("B")),
        Applied::NoChange
    ));
    assert!(matches!(
        evaluate(&changed, &intent("old-B")),
        Applied::Stale(_)
    ));
}

fn fixture() -> Doc {
    let mut doc = Doc::empty();
    for name in ["A", "B", "C"] {
        doc.registry.entries.push(Entry {
            path: format!("/{name}"),
            space_id: name.into(),
        });
    }
    doc.registry.last_opened = Some("/A".into());
    doc
}

fn evaluate(doc: &Doc, intent: &Intent) -> Applied {
    apply(
        doc,
        intent,
        "window",
        100,
        &HashMap::new(),
        "launch",
        &HashMap::new(),
    )
}

fn remove(path: &str, id: &str, fallback: Option<&str>) -> Intent {
    Intent::Remove {
        path: path.into(),
        space_id: id.into(),
        fallback: fallback.map(String::from),
    }
}

fn next(doc: &Doc, intent: &Intent) -> Doc {
    match evaluate(doc, intent) {
        Applied::Next(doc) => doc,
        other => panic!("expected mutation, got {other:?}"),
    }
}

#[test]
fn checksums_schema_and_registry_invariants_are_independent() {
    let doc = fixture();
    assert_eq!(Doc::parse(&doc.to_bytes()).unwrap().registry, doc.registry);
    let mut corrupt: serde_json::Value = serde_json::from_slice(&doc.to_bytes()).unwrap();
    corrupt["rev"] = 10.into();
    assert!(Doc::parse(&serde_json::to_vec(&corrupt).unwrap())
        .unwrap_err()
        .contains("checksum"));
    let mut future = doc.clone();
    future.schema = SCHEMA + 1;
    assert!(Doc::parse(&future.to_bytes())
        .unwrap_err()
        .contains("schema"));
    let mut duplicate = doc.clone();
    duplicate
        .registry
        .entries
        .push(duplicate.registry.entries[0].clone());
    assert!(Doc::parse(&duplicate.to_bytes())
        .unwrap_err()
        .contains("duplicate"));
    let mut stale_last = doc.clone();
    stale_last.registry.last_opened = Some("/gone".into());
    assert!(Doc::parse(&stale_last.to_bytes()).is_err());
}

#[test]
fn removals_update_only_the_target_last_opened_and_pending_rename() {
    let mut before = fixture();
    before.registry.pending_rename = Some(PendingRename {
        from: "/A".into(),
        to: "/renamed".into(),
        space_id: "A".into(),
    });
    let after = next(&before, &remove("/A", "A", Some("/B")));
    after.validate().unwrap();
    assert_eq!(
        after
            .registry
            .entries
            .iter()
            .map(|e| e.path.as_str())
            .collect::<Vec<_>>(),
        ["/B", "/C"]
    );
    assert_eq!(after.registry.last_opened.as_deref(), Some("/B"));
    assert!(after.registry.pending_rename.is_none());
    assert_eq!(before.registry.entries.len(), 3, "input is immutable");
}

#[test]
fn every_stale_non_add_intent_leaves_the_document_unchanged() {
    let doc = next(&fixture(), &remove("/A", "A", Some("/B")));
    let intents = [
        remove("/A", "A", Some("/B")),
        Intent::Replace {
            from: "/A".into(),
            to: "/moved".into(),
            space_id: "A".into(),
        },
        Intent::BeginRename {
            path: "/A".into(),
            to: "/new".into(),
            space_id: "A".into(),
        },
        Intent::CompleteRename {
            from: "/A".into(),
            to: "/new".into(),
            space_id: "A".into(),
        },
        Intent::SetLastOpened {
            path: "/A".into(),
            space_id: "A".into(),
        },
    ];
    let bytes = doc.to_bytes();
    for intent in intents {
        assert!(
            matches!(evaluate(&doc, &intent), Applied::Stale(_)),
            "{intent:?}"
        );
        assert_eq!(doc.to_bytes(), bytes);
    }
}

#[test]
fn stale_identity_cannot_change_a_new_space_at_the_same_path() {
    let mut doc = fixture();
    doc.registry.entries[0].space_id = "new-A".into();
    for intent in [
        remove("/A", "A", None),
        Intent::SetLastOpened {
            path: "/A".into(),
            space_id: "A".into(),
        },
        Intent::Replace {
            from: "/A".into(),
            to: "/new".into(),
            space_id: "A".into(),
        },
        Intent::BeginRename {
            path: "/A".into(),
            to: "/new".into(),
            space_id: "A".into(),
        },
    ] {
        assert!(matches!(evaluate(&doc, &intent), Applied::Stale(_)));
    }
}

#[test]
fn fallback_removed_since_the_decision_is_stale_and_never_recomputed_by_the_evaluator() {
    let doc = next(&fixture(), &remove("/B", "B", Some("/C")));
    assert!(matches!(
        evaluate(&doc, &remove("/A", "A", Some("/B"))),
        Applied::Stale(_)
    ));
    let next = next(&doc, &remove("/A", "A", Some("/C")));
    assert_eq!(next.registry.last_opened.as_deref(), Some("/C"));
}

#[test]
fn remove_move_interleavings_never_resurrect_the_old_entry() {
    for first_is_remove in [false, true] {
        let doc = fixture();
        let removal = remove("/A", "A", Some("/B"));
        let movement = Intent::Replace {
            from: "/A".into(),
            to: "/moved".into(),
            space_id: "A".into(),
        };
        let (first, second) = if first_is_remove {
            (&removal, &movement)
        } else {
            (&movement, &removal)
        };
        let after = next(&doc, first);
        assert!(matches!(evaluate(&after, second), Applied::Stale(_)));
        assert!(after
            .registry
            .entries
            .iter()
            .all(|entry| entry.path != "/A"));
        after.validate().unwrap();
    }
}

#[test]
fn rename_completion_needs_the_matching_pending_operation() {
    let doc = fixture();
    let pending = next(
        &doc,
        &Intent::BeginRename {
            path: "/A".into(),
            to: "/new".into(),
            space_id: "A".into(),
        },
    );
    assert!(matches!(
        evaluate(
            &pending,
            &Intent::CompleteRename {
                from: "/A".into(),
                to: "/wrong".into(),
                space_id: "A".into()
            }
        ),
        Applied::Stale(_)
    ));
    let renamed = next(
        &pending,
        &Intent::CompleteRename {
            from: "/A".into(),
            to: "/new".into(),
            space_id: "A".into(),
        },
    );
    renamed.validate().unwrap();
    assert_eq!(renamed.registry.last_opened.as_deref(), Some("/new"));
    assert!(renamed.registry.pending_rename.is_none());
}

#[test]
fn registration_claim_must_be_live_and_bound_to_the_exact_target() {
    let doc = fixture();
    let mut claims = HashMap::new();
    claims.insert(
        "/claimed".into(),
        ClaimRec {
            claim_id: 1,
            fence: 2,
            window: "A".into(),
            expires_at: 200,
        },
    );
    let intent = |path: &str, fence| Intent::Add {
        path: path.into(),
        space_id: "new".into(),
        claim: Some(("/claimed".into(), ClaimTok { claim_id: 1, fence })),
    };
    assert!(matches!(
        apply(
            &doc,
            &intent("/claimed", 2),
            "A",
            100,
            &claims,
            "launch",
            &HashMap::new()
        ),
        Applied::Next(_)
    ));
    assert!(matches!(
        apply(
            &doc,
            &intent("/claimed", 1),
            "A",
            100,
            &claims,
            "launch",
            &HashMap::new()
        ),
        Applied::ClaimRevoked
    ));
    assert!(matches!(
        apply(
            &doc,
            &intent("/claimed", 2),
            "A",
            200,
            &claims,
            "launch",
            &HashMap::new()
        ),
        Applied::ClaimRevoked
    ));
    assert!(matches!(
        apply(
            &doc,
            &intent("/different", 2),
            "A",
            100,
            &claims,
            "launch",
            &HashMap::new()
        ),
        Applied::ClaimRevoked
    ));
}

#[test]
fn a_claim_token_cannot_be_used_from_another_window() {
    let mut claims = HashMap::new();
    claims.insert(
        "/claimed".into(),
        ClaimRec {
            claim_id: 1,
            fence: 2,
            window: "A".into(),
            expires_at: 200,
        },
    );
    let intent = Intent::Add {
        path: "/claimed".into(),
        space_id: "new".into(),
        claim: Some((
            "/claimed".into(),
            ClaimTok {
                claim_id: 1,
                fence: 2,
            },
        )),
    };
    assert!(matches!(
        apply(
            &fixture(),
            &intent,
            "B",
            100,
            &claims,
            "launch",
            &HashMap::new()
        ),
        Applied::ClaimRevoked
    ));
}

#[test]
fn a_loss_episode_is_bound_to_its_space_not_just_its_launch() {
    let wrong = Intent::PublishLost {
        from: "/B".into(),
        space_id: "B".into(),
        fallback: None,
        epoch_key: "launch:/A:0".into(),
    };
    assert!(matches!(evaluate(&fixture(), &wrong), Applied::Refused(_)));
}

#[test]
fn a_loss_from_an_older_reopen_epoch_is_refused() {
    let mut epochs = HashMap::new();
    epochs.insert("/A".into(), 1);
    let intent = |epoch| Intent::PublishLost {
        from: "/A".into(),
        space_id: "A".into(),
        fallback: None,
        epoch_key: format!("launch:/A:{epoch}"),
    };
    assert!(matches!(
        apply(
            &fixture(),
            &intent(0),
            "A",
            100,
            &HashMap::new(),
            "launch",
            &epochs
        ),
        Applied::Refused(_)
    ));
    assert!(matches!(
        apply(
            &fixture(),
            &intent(1),
            "A",
            100,
            &HashMap::new(),
            "launch",
            &epochs
        ),
        Applied::Next(_)
    ));
}
