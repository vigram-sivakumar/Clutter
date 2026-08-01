# ADR-007: Platform Abstraction Kept Minimal — No Premature Multi-Backend Design

**Status:** Accepted

## Context

The review scored storage-backend extensibility 6/10: the `VaultFileSystem`/`VaultFileSystemWatcher` interfaces are real, minimal (8 and 3 methods respectively), and already have both a production implementation (`LocalFileSystem`) and a test double (`InMemoryVaultFileSystem`) — genuine evidence the seam works. What limits it is path-string logic leaking past the boundary into `MoveService`, `PagePathResolver`, and `IdentityResolver`, all of which assume a single local POSIX-style root.

The tempting next step, given the product's stated long-term ambition ("today local filesystem, tomorrow Google Drive/Dropbox/OneDrive/iCloud/Git"), is to build a full multi-backend abstraction now — a `StorageBackend` type, backend-selection UI, auth/token management scaffolding, etc.

## Decision

Do not build multi-backend infrastructure now. Fix exactly the one thing that would block it later: confine path-string manipulation to `platform/` and a single new `vault/path/` helper (`VaultPath`), so a future second backend is a "swap `platform/` plus `VaultPath`" change rather than a codebase-wide audit. No `StorageBackend` interface, no backend-selection mechanism, no auth scaffolding is built until a second backend is an actual, committed piece of work.

## Alternatives Considered

- **Build a full `StorageBackend` abstraction and a second (e.g., mock cloud) implementation now, to prove it out.** Rejected on the review's own stated principle: "every abstraction must earn its existence... if the abstraction disappeared tomorrow, what functionality would actually be lost?" A `StorageBackend` interface with one real implementation and one speculative one is architecturally identical to the knowledge-graph situation (ADR-004) but without that subsystem's redeeming quality — the knowledge graph is at least fully built and correct; a speculative second backend would be partially built and unvalidated against real cloud-sync semantics (conflict resolution, offline queuing, auth expiry) that a fake implementation can't actually exercise.
- **Do nothing — leave the path-string leakage as-is until a second backend is actually being built.** Rejected: unlike the knowledge graph (which is inert until read), the path-string leakage actively grows every time a new file does its own `path.split('/')` — each new instance is a new site a future migration has to find and fix. The `VaultPath` extraction is cheap now and gets more expensive the longer it's deferred, which is the opposite cost curve from "build it now to be ready," making this the one piece of forward-looking work in this specification that isn't speculative.

## Consequences

- No new product capability ships as a result of this ADR — this is purely a containment measure, invisible to users, exactly like ADR-004.
- The Composition Root remains the only place `LocalFileSystem`/`LocalFileSystemWatcher` are constructed (ARCHITECTURE_RULES.md rule 4 and rule 11), which is already required by other decisions in this set and is the actual mechanism that would make a future backend swap a one-file change once `VaultPath` also exists.
- If a second backend is committed to later, that work starts from a clean path boundary instead of also having to first do an archaeology pass to find every POSIX assumption in the codebase.

## Why This Approach Is Preferred

It resolves the tension between "the review found storage extensibility genuinely important to the product's stated goals" and "don't build speculative abstractions" by identifying the one piece of the extensibility story that is cheap, non-speculative, and actively degrades if deferred (path confinement), and explicitly declining the rest until it's needed.
