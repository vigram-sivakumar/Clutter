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

## Amendment: Structural vs. Policy Validation Ownership (Rule 5 Clarification)

Surfaced during the post-Phase-1 architecture audit and resolved here, as a clarification of this ADR's own Decision, rather than as a new ADR — it doesn't introduce a new architectural choice, it documents one that was already made in Commit 1 without being written down.

### The gap

Commit 1 relocated the "already archived" (`runArchive`) and "not archived" (`runRestore`) guards from `PageMutationService` (a facade file) into `PagePersistenceCoordinator`'s own dispatch methods, alongside the archive/restore destination computation this ADR's Decision already documents moving into `MoveService`. `ARCHITECTURE_RULES.md` rule 5 states business rules must live in capability facades, not the Gate, and its stated regression signature is "a validation or lifecycle rule appearing inside `PagePersistenceCoordinator`." Read literally, these two guards match that signature. This placement was not flagged as a divergence when Phase 1 shipped, and should have been.

### Why the placement is correct

These guards are not business policy — they are structural preconditions on the write itself, in the same category as `MoveService.movePage`'s "path already in use" check or `Vault.addPage`'s "duplicate id" check, both of which already live in infrastructure without controversy. The question that actually distinguishes a rule-5 violation from a correct placement is not "is this an `if` statement inside the Gate" but "does this decision depend on product policy, or only on the Vault's own current state":

- **Business policy validation** — decisions that depend on product rules, permissions, or judgment calls about what the product should allow. `shouldPromoteDraft` is the canonical example: whether a draft should promote to active doesn't depend on anything that can go stale between enqueue and dequeue, so evaluating it synchronously inside `PageOperations`, before enqueueing, is both correct and exactly where rule 5 already says it belongs.
- **Structural/concurrency validation** — decisions that depend only on the Vault's current state and exist purely to keep a queued operation from executing incorrectly against a page that changed underneath it since the call was made. These checks are only correct if evaluated inside the Gate's serialized per-page queue, at the moment the operation actually runs, because that is the only point at which "the Vault's current state" is genuinely current. If `PageOperations.archive()` instead checked `current.metadata.status` synchronously before calling `Gate.enqueue`, two concurrent `archive()` calls on the same page could both read "not yet archived" before either queued operation had run — the facade's check would already be stale by the time its own enqueued operation executes, silently defeating the guard it was meant to enforce. Evaluating it inside the Gate's dispatch is not "the Gate deciding *whether* an archive should happen" in the policy sense rule 5 forbids — it's the Gate verifying that an operation already decided-upon is still valid to execute safely against the page it's about to write, which is squarely part of *how* a write happens, the same way `MoveService`'s occupied-path check is.

### Disposition

`ARCHITECTURE_RULES.md` rule 5 is amended (see that file) to name this distinction explicitly. This is a clarification of the rule's existing intent, not a broadening of the Gate's responsibility: the Gate still owns nothing about product policy. It now explicitly, and narrowly, owns verifying that a queued operation's structural preconditions still hold at the moment it executes — a check no other component can correctly perform, since only the Gate, at dequeue time, ever observes the Vault's genuinely current state for that operation. No implementation code changes as a result of this amendment; `runArchive`/`runRestore`'s guards are unchanged.
