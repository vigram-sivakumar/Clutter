# ADR-050: Remove the unreachable Today / Overdue / Upcoming / Completed task views

**Status:** Accepted (product decision, Vigram, 2026-10-09). Amends ADR-046 (point 1 and point 5) and ADR-027 (the list of `NavigationRouter` view intents).

## Context

ADR-046 kept six `FilteredView` identities (`tasks-all`, `tasks-today`, `tasks-overdue`, `tasks-upcoming`, `tasks-unscheduled`, `tasks-completed`) and the router methods that open them, while noting that "Today, Overdue and Upcoming still have no sidebar entry". They have never gained one. Today the Tasks sidebar offers only New, Tasks, Unscheduled and Options, and nothing outside `NavigationRouter` and its tests calls `openTasksToday`, `openTasksOverdue`, `openTasksUpcoming` or `openTasksCompleted`. The four views were dead code: identities, membership rules, a collection-definition mapping, presentation entries and a fixed-order rule for Done that no user could reach.

## Decision

Remove the four unreachable views. The remaining task views are `tasks-all` (labelled "Tasks") and `tasks-unscheduled`.

- `NavigationRouter` loses `openTasksToday`, `openTasksOverdue`, `openTasksUpcoming` and `openTasksCompleted`. `openAllTasks` and `openTasksUnscheduled` are unchanged.
- `FilteredView` loses the four kinds. `WorkspaceSessionStore` accepts only the remaining kinds, so a persisted `activeView` naming a removed kind fails validation and is ignored, leaving `Workspace`'s default (the same path any unknown stored value already takes).
- `tasksForView` decides membership for `tasks-all` and `tasks-unscheduled` only. `taskViewHasFixedOrder` (Done's newest-completed-first rule, ADR-046 point 5) is removed with the Done view; ordering is always the collection's sort.
- `collectionViewKey` and `collectionDefinitions` map only the two remaining kinds, still to the one `TASKS_COLLECTION` and the one `view:tasks` key. ADR-046's other points (one configuration, one membership authority, one renderer, the completed-tasks rule for Tasks and Unscheduled) are unchanged.
- The matching `SystemLocationId` entries are removed.

**Not removed:** the sidebar's Today / Overdue / Upcoming *sections* (`renderTasksByDate`) are live presentation. Their expand/collapse state is stored under the plain string section ids `tasks-today`, `tasks-overdue` and `tasks-upcoming` (`Workspace.isSectionExpanded`), which are unrelated to view kinds and keep working, including previously saved state.

## Alternatives Considered

- **Keep the identities for the unconnected tab strip.** ADR-046 suggested the "All Tasks / Today / Upcoming / Unscheduled" strip could later map onto them. Rejected for now: carrying unreachable code for a future wiring is the speculative machinery ADR-004 and `implementation-rules.md` rule 13 caution against; the membership rules are one `git revert` away and the strip can reintroduce exactly the views it needs.
- **Remove only the icon/label entries.** Rejected: leaves the unreachable navigation, membership and ordering code in place.

## Consequences

- Tests that existed only for the removed views were deleted (their membership and Done-ordering cases in `tasksForView.test.ts` and `TasksCollectionBody.test.tsx`, and the `openTasksOverdue` router test); tests that used a removed view as a sample now use `tasks-all` or `tasks-unscheduled`.
- If the tab strip is later wired to Today / Upcoming, those views (and Done's ordering rule) return through a new ADR rather than as pre-existing dead code.
- No persisted data format changes: `view:tasks` and the section-collapse ids are untouched.
