# ADR-078: The Tasks page uses four action-oriented tabs

**Status:** Accepted (product decision, Vigram, 2026-11-20). Amends [ADR-051](./051-tasks-page-tabs-select-the-dataset.md), supersedes the standalone Overdue tab in [ADR-068](./068-tasks-page-gets-an-overdue-tab.md), and retains the completed-task rules in [ADR-077](./077-completed-tasks-have-a-dedicated-view.md).

## Context

The Tasks page's six tabs (All tasks, Today, Overdue, Upcoming, Unplanned and Completed) create unnecessary navigation. All tasks is a broad catch-all, while Overdue is better treated as work that already needs attention today. The four remaining tabs provide clearer action-oriented destinations without losing task visibility.

## Decision

1. **Tab order:** Today, Upcoming, Unplanned, Completed.
2. **Today:** Include all active tasks with a valid due date on or before the current local calendar day. This combines overdue and due-today tasks. Keep overdue tasks visually distinguishable using the existing overdue due-date treatment; when grouped by due date, retain the overdue group marker.
3. **Upcoming:** Include active tasks with a valid due date after today. Do not include overdue or undated tasks.
4. **Unplanned:** Include active tasks without a valid explicit due date.
5. **Completed:** Include every completed task, regardless of due date or source note.
6. **Default and legacy selection:** A first launch opens Today. Persisted values of `all` or `overdue` (and any other unrecognised value) resolve to Today. The selected tab continues to persist in `.clutter/workspace.json`.
7. **Sidebar:** Its existing Today, Overdue, Upcoming and Unplanned sections remain unchanged. This decision changes only the Tasks page tab strip and its selected datasets.
8. **References and Inbox:** The References ordering and the separate Inbox collection's legacy completion preferences remain unchanged.

## Consequences

- The Tasks page has four tabs and no separate All tasks or Overdue tab.
- No task is hidden by the consolidation: overdue tasks appear in Today, future-dated tasks in Upcoming, undated active tasks in Unplanned, and completed tasks in Completed.
- Existing internal view identifiers and navigation identities remain intact; this is a presentation and dataset-membership change, not a workspace migration.
