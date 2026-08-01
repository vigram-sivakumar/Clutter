# ADR-006: Workspace Kept as a Separate, Non-Persisted Navigation-State Subsystem

**Status:** Accepted

## Context

`Workspace` (active page/folder, open pages, expanded folders) was, in the pre-migration codebase, already a single, well-scoped, dependency-free file — one of the review's confirmed-working findings. Two things were noted as loose ends: `.clutter/workspace.json` is created by `VaultInitializer` on disk but never read or written by anything (dead infrastructure implying an original intent to persist this state), and `Workspace` has no dependency on `Vault` despite navigation obviously referring to vault content (page ids, folder ids) by reference.

This ADR settles two questions: should `Workspace` be merged into `Vault` (since navigation state "belongs to" the vault conceptually), and should the dead `workspace.json` persistence be implemented or removed.

## Decision

`Workspace` remains a fully separate subsystem, parallel to (not layered under or merged with) the Vault stack, holding only transient UI navigation state, entirely in memory, not persisted across restarts. `workspace.json` remains unimplemented for now — it is not deleted as dead code outright, but it is explicitly not built out speculatively either; if/when session-restore-on-reopen becomes an actual product requirement, that's a deliberate, scoped addition (a `WorkspaceSnapshot` serializer reading/writing through `VaultFileSystem`, per the target architecture's extension-points list), not something to half-build now.

## Alternatives Considered

- **Merge `Workspace` into `Vault` as another projection.** Rejected: `Vault` represents persistent product data (what exists), while `Workspace` represents ephemeral session state (what the user is currently looking at). Conflating them would mean every `Vault` rebuild/reconciliation (e.g., an external sync event) has to reason about UI navigation state, which is a layering violation in the other direction — UI concerns leaking into the domain model.
- **Implement `workspace.json` persistence now, since the file already exists on disk.** Rejected: the review specifically flagged half-built, unused infrastructure as a recurring pattern (the `References` component, the `Controls` history buttons, `workspace.json` itself) — building out persistence for a feature with no confirmed product requirement would repeat that pattern rather than fix it. The disk file's continued existence is a decision to make deliberately later, not passively now.
- **Delete `workspace.json` creation entirely as confirmed-dead code.** Considered, and reasonable, but deferred to a product decision rather than bundled into this architectural ADR — whether session-restore-on-reopen is wanted is not an architecture question.

## Consequences

- Navigation state genuinely resets on every app restart until/unless persistence is deliberately built — this is today's actual behavior, so this ADR changes nothing observable, it only makes the "why" explicit and prevents `workspace.json` from quietly becoming a second, unofficial persistence path if someone starts writing to it without a full design pass.
- `Workspace`'s zero-dependency status (ARCHITECTURE_RULES.md rule 7 — dependencies point downward, and `Workspace` depends on nothing) is preserved exactly.

## Why This Approach Is Preferred

It keeps a subsystem the review found to be correctly scoped from being disturbed by either direction of over-correction — neither absorbed into a layer it doesn't belong in, nor expanded to justify a stray file that was never wired up in the first place.
