# ADR-076: Task collections group by due date in List and Table

**Status:** Accepted (product scope approved by Vigram, 2026-11-14)

## Context

The task sidebar can group tasks by their explicit due date. Task collections already share List/Table renderers and the collection Configure menu, but cannot group their rows. Copying the sidebar renderer would duplicate task presentation and lose the collection's property and sort controls.

## Decision

- Extend the existing `CollectionViewConfig` with optional `groupBy: 'none' | 'dueDate'`. `CollectionViewConfigStore` reads and writes it through the existing `collectionViewConfig` metadata key and serialized merge writer. Missing or invalid values mean None; other saved settings survive. The preference uses the existing collection key and is shared across layouts, independently of sidebar grouping.
- `resolveCollectionView` exposes optional `groupBy` only for task definitions. Configure offers None and Due date only when that capability is exposed. Other collection menus and rendering stay unchanged.
- Configure lists Properties, Group by and Display as replacement submenus above Sort by, reusing one submenu header and back control. While grouping by Due date, that property is temporarily hidden in both layouts and unchecked/disabled in Properties. Its persisted visibility override is retained and applies again when grouping is None. The resolved view exposes optional `disabled` property ids for these temporary presentation constraints.
- Extract the sidebar's exact-date bucketing into one pure `groupByTaskDueDate` helper. It uses the existing task-date classifier, preserves input order within a date, orders dates chronologically, and puts undated or invalid-date tasks in Unscheduled last. View membership and completion filtering remain in `tasksForView`; collection sorting is applied within each group.
- List uses the existing `Section` and `CollectionDataList`. Extend `CollectionDataTable` with optional groups containing an opaque heading and existing row data. The table keeps one column header and one shared subgrid; it imports no task/sidebar components. The task caller supplies the existing section Header and collapse controls. Collapse is local UI state, shared between layouts for the current task view.
- Reuse task identity, Markdown rendering, property cells and all task callbacks. Keep exactly one collection bottom spacer and the page's existing vertical scroll container. No task write path, Gate operation, Workspace navigation API or subsystem owner changes.

## Alternatives

Rendering the sidebar's task rows in the collection loses collection properties and interactions. Separate tables per date repeat column headers and can drift in column width. A second settings store or grouping implementation would duplicate existing owners.

## Consequences

Existing spaces remain ungrouped. Users can switch layouts without losing grouping. Archived, hidden or completed task membership follows existing task-view rules. Date grouping is presentation only: it never moves tasks or changes Markdown. No note migration is required. The optional generic table extension is backward compatible for all existing callers.
