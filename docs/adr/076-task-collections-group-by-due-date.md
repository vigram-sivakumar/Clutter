# ADR-076: Task collections group by due date in List and Table

**Status:** Accepted (product scope approved by Vigram, 2026-11-14)

## Context

The task sidebar can group tasks by their explicit due date. Task collections already share List/Table renderers and the collection Configure menu, but cannot group their rows. Copying the sidebar renderer would duplicate task presentation and lose the collection's property and sort controls.

## Decision

- Extend the existing `CollectionViewConfig` with optional `groupBy: 'none' | 'dueDate'`. `CollectionViewConfigStore` reads and writes it through the existing `collectionViewConfig` metadata key and serialized merge writer. Missing or invalid values mean None; other saved settings survive. The preference uses the existing collection key and is shared across layouts, independently of sidebar grouping.
- `resolveCollectionView` exposes optional `groupBy` only for task definitions. Configure offers None and Due date only when that capability is exposed. Other collection menus and rendering stay unchanged.
- Configure lists Properties, Group by and Display as replacement submenus above Sort by, reusing one submenu header and back control. While grouping by Due date, that property is temporarily hidden in both layouts and unchecked/disabled in Properties. Its persisted visibility override is retained and applies again when grouping is None. The resolved view exposes optional `disabled` property ids for these temporary presentation constraints.
- Extract the sidebar's exact-date bucketing into one pure `groupByTaskDueDate` helper. It uses the existing task-date classifier, preserves input order within a date, orders dates chronologically, and puts undated or invalid-date tasks in Unplanned last. View membership and completion filtering remain in `tasksForView`; collection sorting is applied within each group.
- List uses the existing `Section` and `CollectionDataList`. Extend `CollectionDataTable` with optional groups containing an opaque heading and existing row data. The table keeps one column header and one shared subgrid; it imports no task/sidebar components. The task caller supplies the existing section Header and collapse controls. Collapse is local UI state, shared between layouts for the current task view.
- Reuse task identity, Markdown rendering, property cells and all task callbacks. Keep exactly one collection bottom spacer and the page's existing vertical scroll container. No task write path, Gate operation, Workspace navigation API or subsystem owner changes.

## Alternatives

Rendering the sidebar's task rows in the collection loses collection properties and interactions. Separate tables per date repeat column headers and can drift in column width. A second settings store or grouping implementation would duplicate existing owners.

## Consequences

Existing spaces remain ungrouped. Users can switch layouts without losing grouping. Archived, hidden or completed task membership follows existing task-view rules. Date grouping is presentation only: it never moves tasks or changes Markdown. No note migration is required. The optional generic table extension is backward compatible for all existing callers.

## Amendment: list-only task collections (2026-11-15)

Tasks and Inbox now support List only. This supersedes the task Table and submenu decisions above. The existing resolver falls back to List for saved Table preferences without rewriting stored layout or property choices. Task rendering uses the existing list component and task interactions.

`CollectionDefinition.configurableProperties?: boolean` defaults to enabled; Tasks and Inbox set it to false and the resolver exposes that capability to the shared menu. The menu hides Layout when only one layout is supported and hides Properties when that capability is false. Other collections retain their existing controls. Group by and Display are flat sections above Sort by. Due date remains hidden while grouping by date, preserving its saved visibility preference. Task section headings override the existing hover-surface token to transparent; collapse and keyboard focus remain interactive. No storage or task-operation changes are introduced.
