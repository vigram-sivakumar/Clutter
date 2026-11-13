use super::*;
use std::sync::{Arc, Barrier};

fn token(result: ClaimResult) -> ClaimTok {
    match result {
        ClaimResult::Claimed {
            claim_id, fence, ..
        } => ClaimTok { claim_id, fence },
        other => panic!("{other:?}"),
    }
}

#[test]
fn e4_three_simultaneous_claimants_have_one_holder() {
    let root = scratch("e4-three");
    let (store, _) = open(&root);
    let store = Arc::new(store);
    let barrier = Arc::new(Barrier::new(3));
    let handles: Vec<_> = (0..3)
        .map(|w| {
            let store = store.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                store.claim("/same", &format!("w{w}"))
            })
        })
        .collect();
    let outcomes: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    assert_eq!(
        outcomes
            .iter()
            .filter(|r| matches!(r, ClaimResult::Claimed { .. }))
            .count(),
        1
    );
    assert_eq!(
        outcomes
            .iter()
            .filter(|r| matches!(r, ClaimResult::Held { .. }))
            .count(),
        2
    );
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn e4_expiry_heartbeat_and_takeover_fence_stale_holders() {
    let root = scratch("e4-expiry");
    let clock = Clock::manual();
    let (store, _) = Store::open(&root.join("spaces"), clock.clone());
    let old = token(store.claim("/same", "A"));
    clock.advance(LEASE_MS - 1);
    assert!(matches!(
        store.claim_step("/same", &old),
        StepResult::Ok { .. }
    ));
    clock.advance(2);
    assert!(matches!(
        store.claim("/same", "B"),
        ClaimResult::Held { .. }
    ));
    clock.advance(LEASE_MS);
    let next = token(store.claim("/same", "B"));
    assert!(next.fence > old.fence);
    assert_eq!(store.claim_step("/same", &old), StepResult::Revoked);
    store.release("/same", &old); // A late release must not remove B's lease.
    assert!(matches!(
        store.claim("/same", "C"),
        ClaimResult::Held { .. }
    ));
    assert_eq!(
        store.mutate(
            "late",
            Intent::Add {
                path: "/same".into(),
                space_id: "same".into(),
                claim: Some(("/same".into(), old))
            },
            "A"
        ),
        MutResult::ClaimRevoked
    );
    assert!(matches!(
        store.mutate(
            "winner",
            Intent::Add {
                path: "/same".into(),
                space_id: "same".into(),
                claim: Some(("/same".into(), next))
            },
            "B"
        ),
        MutResult::Committed { .. }
    ));
    assert_eq!(store.read().registry.entries.len(), 1);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn e4_destroying_a_window_releases_only_its_own_claims() {
    let root = scratch("e4-destroy");
    let (store, _) = open(&root);
    let a = token(store.claim("/A", "A"));
    let b = token(store.claim("/B", "B"));
    store.window_destroyed("A");
    assert_eq!(store.claim_step("/A", &a), StepResult::Revoked);
    let replacement = token(store.claim("/A", "C"));
    assert!(replacement.fence > a.fence);
    assert!(matches!(store.claim_step("/B", &b), StepResult::Ok { .. }));
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn e4_a_claim_for_one_folder_cannot_authorize_registration_of_another() {
    let root = scratch("e4-wrong-path");
    let (store, _) = open(&root);
    let a = token(store.claim("/A", "A"));
    assert_eq!(
        store.mutate(
            "wrong-target",
            Intent::Add {
                path: "/B".into(),
                space_id: "B".into(),
                claim: Some(("/A".into(), a))
            },
            "A"
        ),
        MutResult::ClaimRevoked
    );
    assert!(store.read().registry.entries.is_empty());
    std::fs::remove_dir_all(root).unwrap();
}
