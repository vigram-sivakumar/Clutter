# ADR-059: An Empty Daily Note Draft Is Temporary — navigation history no longer keeps it alive

**Status:** Accepted (product decision, Vigram, 2026-10-21 — stated as the intended behavior in the task that implemented it)

Amends [ADR-037](./037-single-global-draft.md), which listed "history references" among the `discardAbandonedDraft` rules left deliberately unchanged.

## Context

`PageOperations.discardAbandonedDraft` closes an empty draft when the user navigates away from it. It had four guards: the draft is not the active view, it has no `SaveError`, it is not today's Daily Note (the product-level "scratchpad" exception), and — for a recordable draft (a Daily Note) — it is not referenced by the Back or Forward stack.

The history guard was added so that Back off an empty Daily Note draft did not discard it before Forward could replay it. Its side effect: opening a draft is an ordinary recorded navigation (ADR-027), so leaving it for another Daily Note — by any route, including a click on a row in the Daily notes sidebar — pushed the draft onto `backStack` and the guard then kept it alive. An empty draft the user had already left stayed in the Daily notes list.

## Decision

An empty Daily Note draft is temporary, however it was left. `discardAbandonedDraft` no longer consults navigation history; `Workspace.isReferencedInHistory` (its only reader) is removed.

Unchanged: the remaining guards (still-active, `SaveError`, today's Daily Note retention, and "has content" via `isEmptyDraft` — a draft with content is promoted through the existing save path, never discarded); the single global draft and retargeting (ADR-037); that a Daily Note draft is a *recordable* history stop (`isRecordableDraft`); plain Note drafts (never recordable, so unaffected); all write paths (a draft is never written to disk, and no `PersistenceOperation` kind changes).

A Back/Forward entry that names a discarded draft is stale. `NavigationRouter.stillExists` already treats a page id found in neither the Vault nor `getDraft` as stale and discards the entry during traversal; the draft is never reopened or recreated, and the walk continues to the next valid entry.

## Alternatives Considered

- **Make Daily Note drafts non-recordable** (never a history stop). Rejected: it changes recording for a whole page type, a broader history change than the lifecycle bug requires, and the stale-entry skip already handles the leftover entries.
- **Keep the guard and hide empty drafts from the sidebar.** Rejected: the draft and its session would still exist, and the sidebar would disagree with the draft state.

## Consequences

- Back off an empty Daily Note draft, then Forward, no longer returns to it: the draft is gone and Forward skips the stale entry. This reverses the behavior the history guard was added for, deliberately.
- Today's Daily Note is unchanged: it is still retained when empty, and the sidebar still always shows a row for today.
- Tests that asserted the history guard were rewritten to assert the new rule (`PageOperations.navigation.test.ts`, `PageOperations.reusableDrafts.test.ts`); `PageHost.dailyDraftDiscard.test.tsx` covers it through the Daily notes sidebar.
