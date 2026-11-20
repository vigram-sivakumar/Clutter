# ADR-068: The Tasks page gets an Overdue tab (amends ADR-051's "no tab for Overdue")

**Status:** Superseded by [ADR-078](./078-tasks-page-uses-four-action-oriented-tabs.md) (product decision, Vigram, 2026-11-20).

## Context

ADR-051 wired the Tasks page's tab strip to datasets and left Overdue and Done out: "the strip has no tab for them". The sidebar's Tasks list does show an Overdue section (Today, Overdue, Upcoming, Unplanned), so overdue tasks could be seen there but not on the page. The page and the sidebar disagreed on what the Tasks view offers.

## Decision

- The strip is All tasks / Today / Overdue / Upcoming / Unplanned: Overdue sits between Today and Upcoming, the order the sidebar uses.
- `tasksForView` gains the dataset `tasks-overdue`: an explicit valid due date before today, and not completed. This is the sidebar's own Overdue rule (`groupTasks`' `isOverdueAndIncomplete`), and both read the one due-date classifier (`classifyDueDate`), so page and sidebar cannot disagree.
- Overdue never contains a completed task, so "Show completed" does not apply to it (as for Unplanned).
- Everything else in ADR-051 stands: the tab is page-local state owned by `AppLayout`, persisted as `selectedTab` in `tasksViewConfig` (an old stored value that is not a tab still opens All tasks), the dataset shares the one `view:tasks` configuration, renderer and sort, and `FilteredView`, `NavigationRouter`, the collection-key and session-restore code are unchanged. Overdue is reachable only as a tab. Done remains removed.

## Consequences

This decision is superseded: Overdue is no longer a standalone Tasks page tab. Overdue tasks are included in Today; the dedicated sidebar Overdue section remains unchanged.

- No write path, subsystem boundary or public API changes; one dataset, one tab entry.
- A stored `selectedTab` of `overdue` was invalid before this and fell back to All tasks; it is now a valid value.
