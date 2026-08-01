# ADR-008: Two-Phase Composition Root Construction (`bootstrap` / `attachVault`)

**Status:** Accepted

## Context

`Application.open()` in the pre-migration codebase needed to ensure today's daily note exists on disk *before* the initial vault scan runs (so the scan picks it up), but creating a page conceptually requires the machinery `ResourceCreation` provides — which itself was designed assuming a `Vault` to add the new page to. The pre-migration fix was to construct a second, bootstrap-only `ResourceCreation` instance without a `Vault`, use it once, then construct a full one after the scan completes. The same shape recurred, less deliberately, for `FrontmatterParser`, `FrontmatterSerializer`, and `PageRebuilder` — each independently instantiated more than once because different steps of `open()` needed one before the "real" set of shared instances existed.

This is a genuine ordering constraint, not a design mistake to eliminate — something has to create the daily note before the scan, and that something needs page-creation logic. The question is whether to keep solving it with ad hoc duplicate construction, or to name it as a deliberate two-phase sequence.

## Decision

`Application`'s startup becomes two explicit static/instance methods: `bootstrap(rootPath)`, which constructs Platform, Vault Ingest, and a minimal Persistence Gate sufficient to create the daily note via the *same* `create` operation kind every other creation uses (closing the ADR-001 bypass at its origin, not just at the runtime call sites) — then runs the scan and build; and `attachVault(vault)`, which constructs every subsystem that needs a real `Vault` (the full Gate, `PageOperations`, `FolderOperations`, `NavigationRouter`, Sync). Shared, stateless collaborators (`FrontmatterParser`, `FrontmatterSerializer`, `PageRebuilder`) are constructed once, during whichever phase first needs them, and passed into both phases' consumers rather than re-instantiated per consumer.

## Alternatives Considered

- **Eliminate the bootstrap step — always create the daily note after the vault exists.** Rejected: this would either leave the vault's first scan without today's note (so the user briefly sees a stale or absent daily note) or require a rebuild/patch of the vault immediately after scan to insert it, which is more moving parts than the current ordering constraint, not fewer. The bootstrap step reflects a genuine product requirement (today's note should exist by the time the app opens), not an accidental complexity.
- **Keep the ad hoc duplicate construction as-is, since it already works.** Rejected: "already works" was true right up until deletion was added following the same unnamed pattern (see ADR-001's context) — an unnamed, undocumented duplication is exactly the kind of thing that gets copied forward into the next feature that hits the same ordering problem, each time as a fresh ad hoc decision instead of a recognized, reviewed pattern.
- **Pass a lazily-resolved `Vault` promise/proxy into a single-phase construction, so only one `ResourceCreation`/`PageOperations` set ever exists, resolving once the scan completes.** Considered as more elegant in principle, but rejected as needlessly clever for what it solves: it would require every method on the affected classes to await vault-readiness internally, spreading the two-phase concern across many files instead of containing it in the one file (`Application.ts`) whose whole job is exactly this kind of sequencing.

## Consequences

- The Composition Root gains a small amount of explicit structure (two named phases instead of one `open()` method) in exchange for eliminating four instances of undocumented duplicate construction.
- A test asserting "every subsystem is constructed exactly once across `bootstrap()` + `attachVault()`" becomes possible and is required (per the Testing Rules in the compliance checklist) — this wasn't previously testable as a single assertion because the duplication was distributed and implicit.
- Any future genuinely new pre-vault-existence requirement (not just daily-note creation) has an obvious place to go: `bootstrap()`, using the same minimal Gate — rather than inventing a fifth ad hoc duplicate construction.

## Why This Approach Is Preferred

It takes an ordering constraint that already existed and was already being solved — just invisibly and with growing duplication — and gives it one name, one place, and one test, without adding new machinery beyond splitting one method into two.
