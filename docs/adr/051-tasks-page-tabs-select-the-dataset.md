# ADR-051: The Tasks page tabs select the dataset (Today / Upcoming return as tab datasets, not views)

**Status:** Accepted (product decision, Vigram, 2026-10-09). Follows [ADR-050](./050-remove-unreachable-task-views.md), which anticipated this.

## Context

ADR-050 removed the unreachable Today / Overdue / Upcoming / Completed task *views* (navigation identities nobody could open) and noted that wiring the Tasks page's tab strip to Today / Upcoming would bring those membership rules back through a new ADR. The strip (All Tasks / Today / Upcoming / Unscheduled) now lives in `PageTitleSection`'s `tabs` slot and should filter the list below it.

## Decision

- The selected tab is page-local UI state held by `PageHost` (not a `FilteredView`, not persisted, not in `Workspace` or history). `TasksTabs` is controlled; `TASKS_TAB_VIEW` maps each tab to the dataset it shows.
- `tasksForView` gains the two datasets the strip needs: `tasks-today` (explicit valid due date is today) and `tasks-upcoming` (after today, never unscheduled), with the ADR-046 completed-tasks rule (Show completed applies to Tasks, Today and Upcoming; Unscheduled is active-only). They are datasets of the one Task Collection: the same `view:tasks` configuration, the same renderer, the same sort.
- `FilteredView`, `NavigationRouter`, the collection-key and session-restore code stay as ADR-050 left them: only `tasks-all` and `tasks-unscheduled` are navigable. Today and Upcoming are reachable only as tabs. Overdue and Done remain removed; the strip has no tab for them.

## Alternatives Considered

- **Restore the four navigation views.** Rejected: nothing in the product opens them; the tabs only need datasets.
- **Tabs as a `FilteredView` each.** Rejected: it would add history entries and persisted-session kinds for what is a within-page filter.

## Consequences

- Today / Upcoming membership is again defined in one place (`tasksForView`); the sidebar's `groupTasks` already shares the due-date classifier, so page and sidebar cannot disagree.
- The selected tab resets to All Tasks when the app restarts. If it should persist or reset on navigation, that is a separate decision.
