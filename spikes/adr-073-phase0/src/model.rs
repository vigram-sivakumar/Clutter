//! Pure registry decisions shared by the native store and portable contract tests. No I/O or durability claims.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;

pub const SCHEMA: u32 = 1;
pub const OPS_KEPT: usize = 256;
pub const NOTICES_KEPT: usize = 50;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct Entry {
    pub path: String,
    pub space_id: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct PendingRename {
    pub from: String,
    pub to: String,
    pub space_id: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, Default)]
pub struct Registry {
    pub entries: Vec<Entry>,
    pub last_opened: Option<String>,
    pub pending_rename: Option<PendingRename>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct Notice {
    pub rev: u64,
    pub kind: String,
    pub from: Option<String>,
    pub to: Option<String>,
    pub fallback: Option<String>,
    pub space_id: String,
    pub origin: String,
    pub episode: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct OpRec {
    pub op_id: String,
    pub rev: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, Default)]
pub struct Legacy {
    pub baseline_digest: String,
    pub consumed: Vec<String>,
    pub merged_digest: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct Doc {
    pub schema: u32,
    pub rev: u64,
    pub registry: Registry,
    pub notices: Vec<Notice>,
    pub ops: Vec<OpRec>,
    pub legacy: Legacy,
    pub checksum: String,
}

impl Doc {
    pub fn empty() -> Doc {
        Doc {
            schema: SCHEMA,
            rev: 0,
            registry: Registry::default(),
            notices: vec![],
            ops: vec![],
            legacy: Legacy::default(),
            checksum: String::new(),
        }
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        let mut copy = self.clone();
        copy.checksum = String::new();
        let body = serde_json::to_vec(&copy).unwrap();
        copy.checksum = hex(&Sha256::digest(&body));
        serde_json::to_vec(&copy).unwrap()
    }

    pub fn parse(bytes: &[u8]) -> Result<Doc, String> {
        let doc: Doc = serde_json::from_slice(bytes).map_err(|error| format!("parse: {error}"))?;
        if doc.schema != SCHEMA {
            return Err(format!("unknown schema {}", doc.schema));
        }
        let mut copy = doc.clone();
        copy.checksum = String::new();
        let expected = hex(&Sha256::digest(&serde_json::to_vec(&copy).unwrap()));
        if expected != doc.checksum {
            return Err("checksum mismatch".into());
        }
        doc.validate()?;
        Ok(doc)
    }

    /// The document-level invariants (§2 point 2). Historical notices are not re-validated: a notice's fallback was
    /// valid when committed and may legitimately be gone later.
    pub fn validate(&self) -> Result<(), String> {
        let mut seen = std::collections::HashSet::new();
        for entry in &self.registry.entries {
            if entry.path.is_empty() {
                return Err("empty path".into());
            }
            if !seen.insert(entry.path.clone()) {
                return Err(format!("duplicate path {}", entry.path));
            }
        }
        if let Some(last) = &self.registry.last_opened {
            if !seen.contains(last) {
                return Err("last_opened not registered".into());
            }
        }
        if let Some(pending) = &self.registry.pending_rename {
            if !seen.contains(&pending.from) {
                return Err("pending_rename names an unregistered entry".into());
            }
        }
        if self.ops.len() > OPS_KEPT {
            return Err("too many ops".into());
        }
        if self.notices.iter().any(|notice| notice.rev > self.rev) {
            return Err("notice from the future".into());
        }
        Ok(())
    }
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn digest_of(text: &str) -> String {
    hex(&Sha256::digest(text.as_bytes()))
}

#[derive(Clone, Debug)]
pub struct ClaimTok {
    pub claim_id: u64,
    pub fence: u64,
}

#[derive(Clone, Debug)]
pub enum Intent {
    Add {
        path: String,
        space_id: String,
        claim: Option<(String, ClaimTok)>,
    },
    Remove {
        path: String,
        space_id: String,
        fallback: Option<String>,
    },
    Replace {
        from: String,
        to: String,
        space_id: String,
    },
    SetLastOpened {
        path: String,
        space_id: String,
    },
    BeginRename {
        path: String,
        space_id: String,
        to: String,
    },
    CompleteRename {
        from: String,
        to: String,
        space_id: String,
    },
    PublishLost {
        from: String,
        space_id: String,
        fallback: Option<String>,
        epoch_key: String,
    },
}

#[derive(Clone, Debug)]
pub(crate) struct ClaimRec {
    pub(crate) claim_id: u64,
    pub(crate) fence: u64,
    pub(crate) window: String,
    pub(crate) expires_at: u64,
}

pub(crate) fn notice(
    kind: &str,
    from: Option<String>,
    to: Option<String>,
    fallback: Option<String>,
    space_id: String,
    origin: &str,
    episode: Option<String>,
) -> Notice {
    Notice {
        rev: 0,
        kind: kind.into(),
        from,
        to,
        fallback,
        space_id,
        origin: origin.into(),
        episode,
    }
}

// ---------------------------------------------------------------------------------------------------------
// apply: pure; intents evaluated against the LATEST state (§2 point 2)
// ---------------------------------------------------------------------------------------------------------

#[derive(Debug)]
pub(crate) enum Applied {
    Next(Doc),
    NoChange,
    Stale(String),
    Refused(String),
    ClaimRevoked,
}

fn find<'a>(doc: &'a Doc, path: &str) -> Option<&'a Entry> {
    doc.registry.entries.iter().find(|entry| entry.path == path)
}

pub(crate) fn apply(
    doc: &Doc,
    intent: &Intent,
    origin: &str,
    now: u64,
    claims: &HashMap<String, ClaimRec>,
    launch: &str,
    epochs: &HashMap<String, u64>,
) -> Applied {
    let mut next = doc.clone();
    match intent {
        Intent::Add {
            path,
            space_id,
            claim,
        } => {
            if let Some((claim_path, token)) = claim {
                match claims.get(claim_path) {
                    Some(record)
                        if claim_path == path
                            && record.window == origin
                            && record.claim_id == token.claim_id
                            && record.fence == token.fence
                            && record.expires_at > now => {}
                    _ => {
                        // A revoked holder never creates a second entry (R5/R13): idempotent if present, refused otherwise.
                        return if find(doc, path).is_some() {
                            Applied::NoChange
                        } else {
                            Applied::ClaimRevoked
                        };
                    }
                }
            }
            if find(doc, path).is_some() {
                return Applied::NoChange;
            }
            next.registry.entries.push(Entry {
                path: path.clone(),
                space_id: space_id.clone(),
            });
            next.registry.last_opened = Some(path.clone());
            next.notices.push(notice(
                "added",
                None,
                Some(path.clone()),
                None,
                space_id.clone(),
                origin,
                None,
            ));
        }
        Intent::Remove {
            path,
            space_id,
            fallback,
        } => {
            match find(doc, path) {
                Some(entry) if &entry.space_id == space_id => {}
                _ => return Applied::Stale("target is not registered with that identity".into()),
            }
            if let Some(fallback) = fallback {
                if fallback == path || find(doc, fallback).is_none() {
                    return Applied::Stale("fallback is no longer registered".into());
                }
            }
            next.registry.entries.retain(|entry| &entry.path != path);
            if next.registry.last_opened.as_ref() == Some(path) {
                next.registry.last_opened = fallback.clone();
            }
            if next
                .registry
                .pending_rename
                .as_ref()
                .is_some_and(|pending| &pending.from == path)
            {
                next.registry.pending_rename = None;
            }
            next.notices.push(notice(
                "removed",
                Some(path.clone()),
                None,
                fallback.clone(),
                space_id.clone(),
                origin,
                None,
            ));
        }
        Intent::Replace { from, to, space_id } => {
            match find(doc, from) {
                Some(entry) if &entry.space_id == space_id => {}
                _ => return Applied::Stale("target is not registered with that identity".into()),
            }
            if find(doc, to).is_some() {
                return Applied::Refused("destination already registered".into());
            }
            for entry in next
                .registry
                .entries
                .iter_mut()
                .filter(|entry| &entry.path == from)
            {
                entry.path = to.clone();
            }
            if next.registry.last_opened.as_ref() == Some(from) {
                next.registry.last_opened = Some(to.clone());
            }
            next.notices.push(notice(
                "moved",
                Some(from.clone()),
                Some(to.clone()),
                None,
                space_id.clone(),
                origin,
                None,
            ));
        }
        Intent::SetLastOpened { path, space_id } => {
            if !find(doc, path).is_some_and(|entry| &entry.space_id == space_id) {
                return Applied::Stale("target is not registered with that identity".into());
            }
            if next.registry.last_opened.as_ref() == Some(path) {
                return Applied::NoChange;
            }
            next.registry.last_opened = Some(path.clone());
        }
        Intent::BeginRename { path, space_id, to } => {
            match find(doc, path) {
                Some(entry) if &entry.space_id == space_id => {}
                _ => return Applied::Stale("target is not registered with that identity".into()),
            }
            if doc.registry.pending_rename.is_some() {
                return Applied::Refused("another rename is pending".into());
            }
            next.registry.pending_rename = Some(PendingRename {
                from: path.clone(),
                to: to.clone(),
                space_id: space_id.clone(),
            });
            next.notices.push(notice(
                "renaming",
                Some(path.clone()),
                Some(to.clone()),
                None,
                space_id.clone(),
                origin,
                None,
            ));
        }
        Intent::CompleteRename { from, to, space_id } => {
            match (&doc.registry.pending_rename, find(doc, from)) {
                (Some(pending), Some(entry))
                    if &pending.from == from
                        && &pending.to == to
                        && &entry.space_id == space_id => {}
                _ => return Applied::Stale("no matching pending rename".into()),
            }
            if find(doc, to).is_some() {
                return Applied::Refused("destination already registered".into());
            }
            for entry in next
                .registry
                .entries
                .iter_mut()
                .filter(|entry| &entry.path == from)
            {
                entry.path = to.clone();
            }
            if next.registry.last_opened.as_ref() == Some(from) {
                next.registry.last_opened = Some(to.clone());
            }
            next.registry.pending_rename = None;
            next.notices.push(notice(
                "renamed",
                Some(from.clone()),
                Some(to.clone()),
                None,
                space_id.clone(),
                origin,
                None,
            ));
        }
        Intent::PublishLost {
            from,
            space_id,
            fallback,
            epoch_key,
        } => {
            let expected = format!("{launch}:{from}:{}", epochs.get(from).copied().unwrap_or(0));
            if epoch_key != &expected {
                return Applied::Refused(
                    "episode no longer matches this launch, Space and reopen epoch".into(),
                );
            }
            match find(doc, from) {
                Some(entry) if &entry.space_id == space_id => {}
                _ => return Applied::Stale("target is not registered with that identity".into()),
            }
            if doc.notices.iter().any(|existing| {
                existing.kind == "lost" && existing.episode.as_deref() == Some(epoch_key.as_str())
            }) {
                return Applied::NoChange;
            }
            if let Some(fallback) = fallback {
                if fallback == from || find(doc, fallback).is_none() {
                    return Applied::Stale("fallback is no longer registered".into());
                }
            }
            next.notices.push(notice(
                "lost",
                Some(from.clone()),
                None,
                fallback.clone(),
                space_id.clone(),
                origin,
                Some(epoch_key.clone()),
            ));
        }
    }
    Applied::Next(next)
}

#[cfg(test)]
#[path = "model_tests.rs"]
mod tests;
