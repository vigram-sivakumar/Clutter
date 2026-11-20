# ADR-051: The Tasks page tabs select the dataset (Today / Upcoming return as tab datasets, not views)

**Status:** Accepted (product decision, Vigram, 2026-10-09). Follows [ADR-050](./050-remove-unreachable-task-views.md), which anticipated this. Amended by [ADR-077](./077-completed-tasks-have-a-dedicated-view.md) for the current tab order and completed-task membership.

## Context

ADR-050 removed the unreachable Today / Overdue / Upcoming / Completed task *views* (navigation identities nobody could open) and noted that wiring the Tasks page's tab strip to Today / Upcoming would bring those membership rules back through a new ADR. The strip (All Tasks / Completed / Today / Overdue / Upcoming / Unplanned) now lives in `PageTitleSection`'s `tabs` slot and should filter the list below it.

## Decision

- The selected tab is page-local UI state owned by `AppLayout` (not a `FilteredView`, not in `Workspace` or history) and passed to `PageHost`. `TasksTabs` is controlled; `TASKS_TAB_VIEW` maps each tab to the dataset it shows.
- **Persisted across restarts**, as a display preference of the Tasks view: `TasksViewConfigStore` gains an optional `selectedTab` string in its existing `tasksViewConfig` entry of `.clutter/workspace.json` (per vault, never Gate-backed, merged field-by-field so it and the display preferences never overwrite each other). The store holds it as a plain string, like `hiddenGroups`; `resolveTasksTab` validates it and an unrecognised value opens All Tasks. `Workspace` and `WorkspaceSessionStore` are untouched (ADR-035's enumerated session state is unchanged).
- `tasksForView` supplies the datasets the strip needs: `tasks-all` (incomplete tasks only), `tasks-completed` (all completed tasks, independent of due date and source), `tasks-today` (incomplete tasks due today), `tasks-overdue` (incomplete tasks due before today), `tasks-upcoming` (incomplete tasks due after today), and `tasks-unscheduled` (incomplete tasks without a valid due date). They are datasets of the one Task Collection: the same `view:tasks` configuration, the same renderer, the same sort. Completed-task visibility is no longer controlled by the Show completed / Auto-sort completed toggles in the collection Configure menu.
- `FilteredView`, `NavigationRouter`, the collection-key and session-restore code stay as ADR-050 left them: only `tasks-all` and `tasks-unscheduled` are navigable. All six datasets are reachable only as tabs; they are not separate navigable `FilteredView` identities.

## Alternatives Considered

- **Restore the four navigation views.** Rejected: nothing in the product opens them; the tabs only need datasets.
- **Tabs as a `FilteredView` each.** Rejected: it would add history entries and persisted-session kinds for what is a within-page filter.

## Consequences

- Every tab's membership is defined in one place (`tasksForView`). Completed tasks are separated from the active task datasets; the sidebar's existing completion preferences remain independent for now.
- The page reopens on the tab it was left on, including after an app restart. Navigating away and back keeps the selection (it is app state, not component state).
