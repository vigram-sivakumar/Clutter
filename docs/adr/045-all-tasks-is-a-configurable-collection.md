# ADR-045: All Tasks is a configurable collection — it plugs into the shared collection settings

**Status:** Accepted (product decision, Vigram, 2026-10-06)

## Context

Collection pages share one settings framework: a `CollectionDefinition` (which properties a collection offers, its layouts, default sort), the global property registry, `resolveCollectionView`, the persisted `CollectionViewConfigStore` entry (layout / property overrides / sort, keyed by `deriveCollectionViewKey`), the `CollectionHeaderActions` / `CollectionViewMenu` UI, and the generic `CollectionDataList` / `CollectionDataTable`. The task pages had been deliberately kept out of it (ADR-022 rejected forcing tasks through the folder/note-shaped `CollectionEntryModel`), so All Tasks had a single hard-wired list and no Configure control.

## Decision

All Tasks (`tasks-all`) becomes a first-class collection by plugging into the *existing* framework — no task-specific settings system.

1. **Definition:** `TASKS_COLLECTION` (`kind: 'tasks'`) offers `name`, `dueDate`, `source`, all on by default (so the default List row is exactly today's: title, due-date control, source link); layouts `list` (default) and `table` — no Card; Name required in both; the shared default sort (Name A→Z).
2. **Properties live in the one registry:** `dueDate` ("Due date") and `source` ("Source" — the note the task lives in). A due date is a calendar day, not an instant, so the registry gains a `day` property type — displayed with the shared `condensedFullYear` date label, ordered like a date. `created`/`updated` are not offered: a task has no creation/edit time.
3. **Persistence** is the existing store: `deriveCollectionViewKey` keys the page `view:tasks-all`. `PageHost` resolves it with the same `collectionView` state every collection uses.
4. **Rendering:** `TasksCollectionBody` maps each task to the shared `PropertyValues` (`taskPropertyValues`), orders with `sortEntries`, and draws `CollectionDataList` or `CollectionDataTable` (`buildPropertyTableColumns` / `propertyValueCells`). Incomplete tasks stay before completed ones, each group sorted by the chosen property. The List's due-date control and source link are driven by the Due date / Source properties; the Table shows them as plain values.
5. **Header:** the page uses `renderCollectionHeaderActions` (Configure + Add), Add opening the New task dialog.

Only `tasks-all` is configurable. Today / Overdue / Upcoming / Done / Unscheduled keep their current rendering (they become sections later); no date grouping is introduced here.

## Consequences

- The architecture guards that pinned "every collection offers List/Table/Card except the Archive", "defaults are Table except assets (Card)", the base required-Name rule, the list of `sortEntries` users, and the PageHost header-actions count were updated to name Tasks explicitly.
- In the Table a task's due date is not editable in place (the generic text cell has no control); the List keeps the due-date button.
- The existing sidebar Show completed / Auto-sort completed preference is unrelated and unchanged.

## Alternatives Considered

- **A task-specific settings/table system** — rejected: it duplicates the framework and would drift from it.
- **Reusing the `date` type for due dates** — rejected: an ISO instant formatter turns a calendar day into a spurious time ("Today, 05:30").
