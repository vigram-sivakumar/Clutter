//! Crash-harness assertions, not registry policy or a substitute atomic writer.
use crate::model::Doc;

/// Validate generations AFTER startup recovery/normalization. No registry is valid only before the first commit.
pub fn validate_recovered_generations(
    recovered: &Doc,
    main_bytes: Option<&[u8]>,
    prev_bytes: Option<&[u8]>,
    confirmed_floor: u64,
) -> Result<(), String> {
    recovered.validate()?;
    if recovered.rev < confirmed_floor {
        return Err(format!(
            "confirmed revision {confirmed_floor} lost; recovered {}",
            recovered.rev
        ));
    }
    match (main_bytes, prev_bytes) {
        (None, None) => {
            if confirmed_floor == 0 && recovered.to_bytes() == Doc::empty().to_bytes() {
                Ok(())
            } else {
                Err("registry generations missing after a confirmed commit or with nonempty recovered state".into())
            }
        }
        (Some(main), Some(prev)) => {
            let main = Doc::parse(main).map_err(|error| format!("main: {error}"))?;
            let prev = Doc::parse(prev).map_err(|error| format!("prev: {error}"))?;
            if prev.rev > main.rev || main.rev - prev.rev > 1 {
                return Err(format!(
                    "invalid generation order: prev={}, main={}",
                    prev.rev, main.rev
                ));
            }
            if main.to_bytes() != recovered.to_bytes() {
                return Err(
                    "recovered snapshot differs from the complete persisted main document".into(),
                );
            }
            Ok(())
        }
        _ => Err("startup normalization left one registry generation missing".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Entry;

    fn doc(rev: u64) -> Doc {
        let mut doc = Doc::empty();
        doc.rev = rev;
        doc.registry.entries.push(Entry {
            path: "/A".into(),
            space_id: "A".into(),
        });
        doc
    }

    #[test]
    fn killing_before_the_first_commit_allows_no_registry_generations() {
        assert!(validate_recovered_generations(&Doc::empty(), None, None, 0).is_ok());
    }

    #[test]
    fn missing_files_cannot_hide_a_lost_confirmed_revision_or_nonempty_state() {
        assert!(validate_recovered_generations(&Doc::empty(), None, None, 1).is_err());
        assert!(validate_recovered_generations(&doc(1), None, None, 0).is_err());
    }

    #[test]
    fn normal_generations_retain_all_confirmed_content() {
        let current = doc(5).to_bytes();
        let previous = doc(4).to_bytes();
        assert!(
            validate_recovered_generations(&doc(5), Some(&current), Some(&previous), 5).is_ok()
        );
        assert!(validate_recovered_generations(&doc(5), Some(&current), Some(&current), 5).is_ok());
        assert!(
            validate_recovered_generations(&doc(5), Some(&current), Some(&previous), 6).is_err()
        );
    }

    #[test]
    fn corruption_or_a_missing_normalized_generation_is_not_treated_as_cold_startup() {
        let good = doc(1).to_bytes();
        for (main, prev) in [
            (Some(b"broken".as_slice()), Some(good.as_slice())),
            (Some(good.as_slice()), Some(b"broken".as_slice())),
            (Some(good.as_slice()), None),
            (None, Some(good.as_slice())),
        ] {
            assert!(validate_recovered_generations(&doc(1), main, prev, 0).is_err());
        }
    }

    #[test]
    fn invalid_revision_order_and_different_payloads_fail() {
        let current = doc(5).to_bytes();
        for previous in [doc(6).to_bytes(), doc(3).to_bytes()] {
            assert!(
                validate_recovered_generations(&doc(5), Some(&current), Some(&previous), 0)
                    .is_err()
            );
        }
        let mut different = doc(5);
        different.registry.entries[0].space_id = "different".into();
        assert!(validate_recovered_generations(
            &different,
            Some(&current),
            Some(&doc(4).to_bytes()),
            0
        )
        .is_err());
    }
}
