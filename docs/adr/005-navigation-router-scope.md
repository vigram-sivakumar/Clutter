# ADR-005: Navigation Router Scoped to View-Level Intent Only

**Status:** Accepted

## Context

`NavigationService` in the pre-migration codebase mixed two unrelated kinds of methods: pure forwards to a capability facade (`openNote`/`openDailyNote`, both one-line calls to `PageApplicationService.openPage`, byte-identical to each other) and genuinely view-level navigation intents that don't correspond to any single aggregate operation (`openAllTasks`, `openFavorites`, `openAllTags` — these are "filter and navigate to a view," not "do something to a specific page or folder"). The forwards added a name but no logic; more than half the view-level methods threw `Not implemented`, yet were live-wired to real keyboard shortcuts that a user could trigger and hit a runtime exception.

## Decision

Split the two kinds of methods by moving them to where they belong. Anything that was a pure forward to `PageOperations`/`FolderOperations` is deleted from the navigation surface; callers hold a reference to the facade and call it directly. What remains, renamed `NavigationRouter`, owns only genuinely compound or view-routing intents: `openArchive`, `openInbox`, `openTemplates`, `openFavorites`, `openAllNotes`, `openAllTasks`, `openSomedayTasks`, `openCompletedTasks`, `openAllTags`. Each of these is implemented for real (backed by a `VaultQuery` filter plus a `Workspace` state change) rather than left as a stub, as part of the migration plan's Phase 4 — the architectural fix is "no throwing stub wired to a live control," not any specific decision about which views ship first (that's a product call).

## Alternatives Considered

- **Keep `NavigationService` as a single facade covering both kinds of methods, and just implement the stubs.** Rejected: this fixes the "throws at runtime" problem but not the "the name promises more than half of what's here actually needs a facade" problem — pure forwards remain pure forwards, and a future contributor still has to learn that some of this class's methods are meaningful and others are decoration.
- **Delete `NavigationService`/`NavigationRouter` entirely and have the UI call `Workspace` and `VaultQuery` directly for every navigation action.** Rejected: some navigation intents genuinely combine a query and a state change in a way worth naming once rather than re-deriving at every call site (e.g., "open all tasks" needs the same filter logic wherever it's triggered from — a keyboard shortcut and a future command palette entry should share it). A thin, honest router for *these specific* cases is a legitimate facade; the mistake was including the forwarding methods alongside them, not having a router at all.
- **Fold the view-level intents into `PageOperations`/`FolderOperations`.** Rejected: these intents aren't about a specific page or folder aggregate — they're about the *view*, spanning potentially many pages. They don't fit either facade's `open/create/mutate/delete`-on-one-aggregate shape, and forcing them in would blur that shape for every other method on those facades.

## Consequences

- `NavigationRouter`'s public surface only grows when a genuinely new cross-cutting view is added, which keeps it small and auditable — Coding Rule "if a facade method's body is a single unconditional forward, delete it" (ARCHITECTURE_RULES.md rule 9) applies to this class specifically, since it's the one most likely to accumulate forwards again if not watched.
- Shipping the 8 previously-stubbed methods is now visible, tracked work (Phase 4 of the migration plan) instead of an invisible gap between what the API promises and what it does.

## Why This Approach Is Preferred

It resolves the actual defect (a facade that lied about its own completeness) without either overcorrecting into "no navigation facade at all" or undercorrecting into "same facade, now with real implementations behind the same confused scope."
