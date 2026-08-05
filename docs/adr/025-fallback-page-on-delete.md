# ADR-025: Fallback Page — Deleting the Active Page Must Never Leave the App Without One

**Status:** Accepted

## Context

Deleting the currently-active page (e.g. the only open Daily Note draft in an empty vault) left the application with no active page or folder at all. `PageOperations.delete()` closes the session, deletes the page through the Gate, and calls `Workspace.closePage(pageId)` — which already restores a previously-open page if one exists (`openPageIds.at(-1)`), but sets `activeView` to `null` if none does. Nothing downstream of that ever ran: no code anywhere reopens a page after a delete leaves the workspace empty.

The only place in the codebase that has ever decided "what page should be showing" from nothing is `Application.open()`, called exactly once at boot. `ADR-019` §"Why This Approach Is Preferred" already named `Application.open()` as "the correct long-term owner" of this class of decision, anticipating a future choice between Open Today's Note / Restore Last Session / Open Empty Workspace, and deliberately left it unparameterized until a real second caller existed. Deleting the active page down to nothing is that second caller.

`docs/architecture-specification.md` §6's Delete sequence and §10 (`Workspace`) document `closePage(pageId)` only as "closes a page" — the next-active-page selection policy (`openPageIds.at(-1)`) and the missing "what happens when there's nothing left" step were both undocumented before this ADR.

## Decision

1. **`Application` gains a private `openFallbackPage(): Promise<void>`**, extracted verbatim from `open()`'s existing body (resolve today's Daily Note if it exists in `Vault`, otherwise open an unpersisted draft at its deterministic path via `PageOperations.openAtPath`). `open()` now calls it after starting the filesystem watcher. No behavior change for the boot path.
2. **`PageOperations`'s constructor gains one collaborator**: `openFallbackPage: () => void`, wired in `Application.attachVault()` as `() => { void this.openFallbackPage(); }` — the same constructor-injected-closure shape `FolderOperations`'s existing `prepareNavigation` hook already uses to reach `PageOperations.flushActivePage()` without an upward import. This keeps dependencies pointing downward (rule 7): `PageOperations` never imports `Application`.
3. **`PageOperations.delete()`** calls `this.openFallbackPage()` when, after `workspace.closePage(pageId)` runs, `workspace.activeView` is still `null` — i.e., there was no previously-open page to restore. `delete()` makes no decision about *what* the fallback page is; it only recognizes that one is needed.
4. **`Workspace.closePage()` is unchanged.** Restoring a previously-open page is already its job (per this ADR's Responsibilities split below) and it already does it correctly; the missing piece was entirely downstream of it.
5. **Out of scope:** `PageOperations.close()` (non-delete tab-close) has the same latent gap — closing the last open tab also leaves `activeView` null with nothing to recover it — but no reproduction or product requirement was raised for that path. Left untouched, tracked as a known related gap rather than bundled into this fix.
6. **Out of scope:** a TOCTOU race in `VaultSyncService` (its `handleChanged`/`handleCreated`/`reconcileArchiveMetadataForPage` all check `vault.getPageByPath()`/`vault.getPage()` and then `await fileSystem.readFile()`, with no lock shared between `PagePersistenceCoordinator`'s per-page queue and `VaultSyncCoordinator`'s per-key queue) was identified as the likely source of the reported `"failed to open file... No such file or directory"` console error. This is a genuine, separate concurrency gap between the Gate and Sync — not addressed here, per the explicit instruction that motivated this ADR not to patch `VaultSyncService`.

## Responsibilities (restated per the fix's own shape)

- **Deletion is lifecycle** — owned by `PageOperations.delete()`: close the session, delete through the Gate, close the workspace entry, and recognize when a fallback is needed.
- **Restoring the previous page is navigation/workspace** — owned by `Workspace.closePage()`, unchanged.
- **Fallback page selection is application policy** — owned by `Application.openFallbackPage()`, per ADR-019's own framing.
- **Creating today's Daily Note draft is Daily Note policy** — unchanged: `PageOperations.openAtPath()` → `persistDraft()` → `DailyNoteService.ensureFolderChain()`.

## Alternatives Considered

- **Give `Workspace` its own fallback-page concept.** Rejected — `Workspace` owns transient navigation UI state only (spec §10) and has no route to product policy (which page is "the" fallback) without depending upward on `PageOperations`/`DailyNoteService`, which the layering (rule 7) forbids.
- **Have `PageOperations.delete()` call `pageOperations.openAtPath(todayNotePath, ...)` directly.** Rejected — this would make page-lifecycle code own a Daily-Notes-specific decision, duplicating exactly the logic `Application.open()` already owns and the desired flow's own framing explicitly rules out ("the delete flow should not know what the fallback page is").
- **Add a `rename`-style new facade method (`PageOperations.openFallback()`).** Rejected — there is nothing page-lifecycle-specific about "what's the fallback"; it would be a facade method whose only job is forwarding to Composition Root policy, which rule 9 (no unconditional forwards) and rule 11 (no business logic in the Composition Root's *callers*) both argue against. A constructor-injected callback, matching the already-accepted `prepareNavigation` precedent, is the smaller, non-duplicative change.

## Consequences

- `docs/architecture-specification.md` §6 (Internal collaborators, Delete sequence) is amended to name the new callback and the new final step.
- `PageOperations`'s constructor signature changes (one new trailing parameter); every construction call site (`Application.attachVault()` and all test fixtures building `PageOperations` directly) is updated to pass it — a no-op `() => {}` everywhere the test doesn't care about fallback behavior, a `vi.fn()` spy where the new regression tests assert on it.
- No public API listed in spec §6's `PageOperations` code block changes — `delete()`'s signature and externally-observable contract (resolves `Promise<void>`, no existence check) are unchanged; only its post-condition (never leaves `Workspace` without an active page/folder when the vault has one available) is strengthened.
- The `VaultSyncService`/Gate TOCTOU race (Decision item 6) remains open — a candidate for a future, narrowly-scoped ADR of its own (likely: a shared lock keyed by path/id spanning both coordinators, or routing Sync's file reads through the same queue the Gate uses for that id).

## Why This Approach Is Preferred

It closes exactly the gap ADR-019 named and scoped in advance ("the future `open(strategy)` extension remains a separate, later decision" — this is that seam gaining its second caller, not a new one), reuses an already-accepted wiring pattern (`FolderOperations.prepareNavigation`) instead of inventing a new kind of collaborator, and keeps every responsibility exactly where the existing architecture already assigns it: lifecycle in `PageOperations`, navigation history in `Workspace`, product policy in the Composition Root, Daily-Note mechanics in `DailyNoteService`.
