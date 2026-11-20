# ADR-077: Completed tasks are separated from active task views

**Status:** Accepted (product decision, Vigram, 2026-11-20). Amends [ADR-046](./046-task-views-are-datasets-of-one-task-collection), [ADR-051](./051-tasks-page-tabs-select-the-dataset) and [ADR-068](./068-tasks-page-gets-an-overdue-tab).

## Context

The Tasks page now has a dedicated Completed tab. Keeping completed tasks visible in active task lists and exposing Show completed / Auto-sort completed preferences creates two competing ways to find completed work. The sidebar is an action-oriented surface and should contain only tasks that still need attention.

The page References section has its own ordering rule: open dated tasks, open undated tasks, then completed tasks, with completed tasks ordered by completion date newest first. That ordering is independent of task collection and sidebar preferences.

## Decision

1. **Tab order:** All tasks, Today, Overdue, Upcoming, Unplanned, Completed. Completed is the final tab.
2. **Active task datasets:** All tasks, Today, Overdue, Upcoming and Unplanned contain incomplete tasks only. Completed contains every completed task, regardless of due date or source note.
3. **Tasks sidebar:** Today, Overdue, Upcoming and Unplanned contain incomplete tasks only. Completing a task removes it from the sidebar; it remains in its original Markdown source and is available in the Completed tab.
4. **No completion display controls:** Remove Show completed and Auto-sort completed from Tasks settings and the Tasks collection Configure menu. The sidebar does not auto-sort completed tasks because it never displays them.
5. **References are unchanged:** The References section keeps its independent task ordering, including completed tasks newest-completed-first. This is implemented by `getPageReferences` / `byTaskOrder`, not by the removed display preferences.
6. **Visible terminology:** The user-facing label is Unplanned. The internal `unscheduled` classifier, `tasks-unscheduled` view identity, persisted section key and existing saved navigation state remain unchanged; no workspace migration is needed.

## Consequences

- Completed tasks have one obvious destination in the Tasks page and do not clutter active task views or the sidebar.
- The References section continues to show completed tasks in its existing completion-date order.
- Existing `showCompleted` and `autoSortCompleted` values in `.clutter/workspace.json` are tolerated for backward compatibility. They no longer control sidebar visibility; the separate Inbox collection retains its existing persisted behaviour.
- Renaming Unscheduled to Unplanned is presentation-only and does not alter due-date classification or task metadata.
