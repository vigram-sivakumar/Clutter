# ADR-F004: History and collaboration share document semantics

Status: Proposed. Requirements: P-05, P-12, P-17 through P-22.
Decisions: D-02, D-05, D-07, D-08.

## Context

Retained versions, selective undo and collaborative merging interact with block
identity, schema migration, permissions, offline state and asset retention. Adding
each later as a separate document representation creates competing truth.

## Proposal

Choose one canonical collaborative representation with defined semantic operations,
causality and schema validation. Retained versions refer to reconstructable states;
restore creates a new guarded mutation. Undo remains context-selective. Keep
recovery and backup distinct. Qualify both local multi-view and isolated multi-person
replicas before fixing document identity and persistence design.

No CRDT library, server vendor, identity provider or hosting model is selected here.

## Alternatives and consequences

Snapshot-only storage can be viable but still needs a collaborative operation model.
An append-only log alone does not provide user-readable versions or safe compaction.
A text CRDT alone does not validate table structure or authorize writes. Retention,
historical access and offline revocation become explicit product policies. Assets
must remain reachable from retained versions and recoverable pending work.

## Qualification and existing rules

T-03, T-11 through T-14 must prove convergence, restore safety, offline recovery,
permission behaviour and historical reconstruction. No existing storage rule is
superseded until the canonical representation and durability protocol are accepted.
