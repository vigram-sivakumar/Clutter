# ADR-011: Phase 1 Rescoped to Build Create/Delete Fresh, Not Migrate Them

**Status:** Accepted

## Context

`docs/architecture-target.md`'s migration plan describes Phase 1 as: "Extend the Persistence Gate (`PagePersistenceCoordinator`) with `create` and `delete` operation types... Migrate `ResourceCreation.createNote` and `ResourceDeletionService.delete` to enqueue through it instead of writing directly. `PagePathResolver` and the existing tests for both services carry over unchanged — only the write call site moves."

When Phase 1 implementation began on `architecture-migration`, none of `ResourceCreation`, `ResourceDeletionService`, or `PagePathResolver` existed anywhere in the branch. Grep and git archaeology confirmed why: these files exist only on an unmerged sibling branch (`creation-flow`, tip commit `bcbacd7`), which diverged from the same ancestor commit as `architecture-migration` (`7afe318`) but was never merged into it. `architecture-migration` instead merged `main`'s UI work and a separate "Add architecture governance documentation" commit that copied the architecture text without the source code it described. `docs/architecture-assessment.md` and `docs/architecture-target.md` were, it turns out, authored against `creation-flow`'s state, not what is actually checked out here.

Concretely, on this branch before Phase 1: `PagePersistenceCoordinator.enqueue` required the target page to already exist in the Vault, so it was structurally incapable of creating a page; there was no delete branch at all; `NavigationService.createNote()` was a stub that threw `Not implemented`; and no facade, service, or UI entry point could delete a page.

## Decision

Build `create` and `delete` fresh against current code rather than porting or merging `creation-flow`. This is the more conservative interpretation available: rather than assume a target state (a single-owning `PageOperations`/`FolderOperations` facade, per Phase 2) that isn't true yet, Phase 1 was re-scoped to exactly what `implementation-rules.md` §5 requires when "the migration phase this work depends on is unfinished" — extend the Persistence Gate's contract and internal dispatch to safely support `create`/`delete`, with **no new facade file and no UI wiring**, since the correct home for a UI-reachable capability (`PageOperations`) doesn't exist until Phase 2.

Three specific shape decisions, each closing a real gap rather than working around it:

1. **The Gate's `enqueue` signature moved from a callback (`operate: (current: Page) => PagePersistenceOperation`) to the frozen spec's literal discriminated union (`operation: PersistenceOperation`).** The callback shape couldn't represent "create a page that doesn't exist yet" or "delete a page" at all — both require the Gate to reason about kinds, not just diff an existing Page against a proposed one.
2. **`archive`/`restore` destination computation moved from `PageMutationService`'s private methods into `MoveService`.** Adopting the spec's zero-payload `{kind:'archive'}`/`{kind:'restore'}` shape means the facade can no longer inject a pre-computed destination via closure — the Gate must compute it itself, against the Vault's latest committed page, at dequeue time. This closes a latent race: two concurrent archive calls on the same page could otherwise both read "not yet archived" before either queued operation ran.
3. **`move`/`rename` kinds were not added**, despite being part of the spec's full seven-member union. Neither has a current caller or a business-rule owner (`PageOperations.move()`/`.rename()` don't exist until Phase 2) — adding them now would be untested, placeholder machinery with nothing to exercise it, which the task's own constraints and Coding Rule 4 both forbid. They are added one at a time, each backed by a real caller, when Phase 2 introduces the facade methods that need them.

## Alternatives Considered

- **Merge or cherry-pick `creation-flow` (`bcbacd7`) first, then execute Phase 1 exactly as originally written.** This was offered to the person directing the implementation and explicitly declined in favor of building fresh — the unmerged branch's design predates the frozen specification's kind-based `PersistenceOperation` contract and would have needed rewriting to match it anyway, so porting it first would not have saved the rework this ADR's Decision performs.
- **Add `move`/`rename` as inert union members now, alongside `create`/`delete`, since the spec lists all seven kinds together.** Rejected: with zero callers and zero business-rule owner, they would be dead code with no test able to exercise real behavior — exactly the "placeholder abstraction" the task's engineering constraints and `ARCHITECTURE_RULES.md` rule 6 (no new abstraction without a citable specification gap it closes *now*, not eventually) forbid.
- **Build a new standalone `PageCreationService`/`PageDeletionService` now, so `create`/`delete` have a UI-reachable home immediately.** Rejected: this is precisely the fragmentation pattern (rule 1, "every capability has exactly one owning facade") the whole migration exists to remove, and any such file would be dead weight the moment Phase 2 consolidates into `PageOperations`.

## Consequences

- `create`'s payload (`{ kind: 'create'; path: string; parentId: string | null; content: string }`) diverges from the spec's literal text (`{ kind: 'create'; path: string; content: string }`) by adding `parentId`. `PageBuilder.build` requires an explicit `parentId`, and no `vault/path/` helper exists yet (that's Phase 5) to derive folder membership from a bare path — inlining that derivation here would be new path-string logic outside the one place `ARCHITECTURE_RULES.md` rule 10 confines it to. Closed when Phase 5 lands a `VaultPath` helper a caller can use to resolve `parentId` from `path` uniformly.
- `move`/`rename` kinds remain absent from `PersistenceOperation` until Phase 2 adds `PageOperations.move()`/`.rename()`. A reader of `docs/architecture-specification.md` §5 comparing it line-for-line against the shipped union will see five members, not seven, until then.
- `PageMutationService`'s constructor dropped its `Vault` dependency (now fully unused after destination resolution moved to `MoveService`), which required updating its one Composition Root call site in `Application.ts` — a one-line, mechanical consequence of removing a dead parameter, not a wiring-order or business-logic change.
- No UI-reachable capability exists yet for create or delete after this phase. `NavigationService.createNote()` remains a stub. This is intentional: the Gate is now safe and ready for Phase 2's `PageOperations` to call into, but Phase 2 is the phase that gives it a caller.

## Why This Approach Is Preferred

The alternative — assuming `creation-flow`'s code and proceeding as if it had been merged — would have meant planning against files that don't exist and tests that were never written against this branch's actual `PagePersistenceCoordinator` shape (a callback, not a kind union). Building fresh, and re-scoping Phase 1 down to exactly what's achievable without assuming Phase 2's not-yet-built facade, keeps every commit in this phase honest about what it changes: the Gate becomes capable of creating and deleting pages safely, for the first time, with nothing yet calling it — which is a stricter, not looser, version of "close the safety gap" than the original plan described.
