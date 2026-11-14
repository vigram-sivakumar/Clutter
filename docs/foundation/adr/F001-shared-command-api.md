# ADR-F001: One shared capability API

Status: Proposed. Requirements: P-02, P-09, P-16, P-20, P-24. Decision: D-04, D-06.

## Context

UI-only operations and independently implemented CLI/MCP writes create competing
validation, permission, revision and persistence rules. External AI is a core
Clutter workflow and must work without a window.

## Proposal

Make app, CLI and MCP thin first-class adapters over the same command/query and
vault API. A headless-capable local authority coordinates shared live state and
all domain mutations. Keep transport and runtime language open until qualification.

## Alternatives and consequences

Direct SQL/file writes bypass invariants. Driving the UI prevents dependable
headless automation. Duplicating facades per interface creates semantic drift.
A shared authority adds lifecycle/IPC/authentication requirements, which must be
tested rather than hidden behind a singleton. Future adapters gain common policy
without forcing identical protocol payloads.

## Qualification and existing rules

T-04, T-07 and T-13 must establish parity, takeover, outcomes and permission checks.
This proposal is compatible with the intent of one capability owner but does not
supersede any current facade or persistence implementation yet.
