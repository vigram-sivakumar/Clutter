# ADR-003: Vault as the Sole Authoritative In-Memory Domain Model

**Status:** Accepted

## Context

`Vault` was already, in the pre-migration codebase, the only object holding page/folder state, with no filesystem I/O of its own and explicit invariant checks (duplicate-id rejection, path-availability assertion). This was one of the review's confirmed-working findings, not a problem to fix. The question this ADR settles is whether to change that shape while addressing the write-path fragmentation (ADR-001) elsewhere — specifically, whether `Vault` should gain awareness of persistence state, or whether mutation access should be opened up to more callers as the application layer is restructured.

## Decision

`Vault` keeps its current shape exactly: full in-memory model, zero I/O, mutation methods (`addPage`/`replacePage`/`removePage`/`updatePagePath`/`moveFolder`) restricted to being called only by the Persistence Gate and Sync. Live projections (tags, tasks) continue to fully rebuild on every mutation, unchanged. The only modification is that speculative projections (knowledge graph, embeds, aliases) move to lazy evaluation (ADR-004) — a change in *when* they compute, not in `Vault`'s ownership boundary.

## Alternatives Considered

- **Let `PageOperations`/`FolderOperations` mutate `Vault` directly, skipping the Gate for simple cases.** Rejected: this reopens exactly the gap ADR-001 closes — "simple" cases are exactly where a bypass starts, and yesterday's "simple" case (create) is today's example of why the exception grew.
- **Introduce a repository/DAO abstraction between `Vault` and its callers.** Rejected: `Vault` already *is* the boundary — the domain model itself has no I/O and enforces its own invariants. An additional repository layer wrapping it would be a forwarding layer with no new responsibility, which the review specifically flagged as a pattern to avoid (see `NavigationService`'s pass-through methods).
- **Give `Vault` incremental (patch-based) projection updates instead of full rebuilds, for performance.** Rejected for now: full rebuild trades CPU for correctness-by-construction (no possibility of a projection drifting from source data via a missed incremental update), and the review found this trade-off still reasonable at current file counts. Revisit only if profiling shows it's a real bottleneck — not preemptively.

## Consequences

- `Vault`'s invariant tests (duplicate-id rejection, id/path map consistency) remain the highest-leverage tests in the codebase and should be prioritized accordingly during migration.
- Restricting mutation access to two callers is only meaningful if it's actually enforced (an ESLint import-boundary rule, per ARCHITECTURE_RULES.md rule 3) — without that, "should only be called by X and Y" degrades into "is usually called by X and Y" over time, which is exactly how the six-service fragmentation happened to `NavigationService`'s intended scope originally.

## Why This Approach Is Preferred

This ADR is mostly a decision to *not* change something that already works, with an explicit rationale for why each tempting addition (repository layer, incremental updates, wider mutation access) would either reintroduce a solved problem or trade away a working correctness guarantee for a performance gain the current scale doesn't need.
