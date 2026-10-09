# ADR-046: Task views are datasets of one Task Collection

**Status:** Accepted (product decision, Vigram, 2026-10-06). Extends ADR-045. Amended by [ADR-050](./050-remove-unreachable-task-views.md): the Today, Overdue, Upcoming and Done views (point 1's identities, point 5's fixed order) were removed as unreachable; only `tasks-all` and `tasks-unscheduled` remain.

## Context

ADR-045 made All Tasks a configurable collection and left the other task pages (Today, Overdue, Upcoming, Unscheduled, Done) as bespoke renderers: each had its own filtering branch in `TasksCollectionBody`, drew the sidebar's `Task` row, and had no Layout / Properties / Sort. Task membership was decided in several places (render branches, `groupTasks`).

## Decision

**View identity determines the dataset; the collection configuration determines presentation.**

1. **Navigation is unchanged.** The six `FilteredView` identities (`tasks-all`, `tasks-today`, `tasks-overdue`, `tasks-upcoming`, `tasks-unscheduled`, `tasks-completed`), the router methods, the sidebar entries and session restoration stay as they are.
2. **One configuration.** All six resolve to `TASKS_COLLECTION` and share one persisted key, `view:tasks`: List/Table, Properties and Sort are chosen once for every task view. `CollectionViewConfigStore` reads the retired `view:tasks-all` entry as a fallback (never deleted or overwritten; the first change merges on top of it and writes `view:tasks`), so ADR-045-era choices survive.
3. **One membership authority:** `tasksForView(view, tasks, { showCompleted })` (`features/tasks/helpers/tasksForView.ts`). Due dates are interpreted only by `classifyDueDate` (`taskDueDate.ts`): no due date or a calendar-invalid one (`2026-13-45`) → `unscheduled`; otherwise `today` / `past` / `future` by LOCAL calendar day (the app's `isToday` / `isPast`). The sidebar's `groupTasks` now uses the same classifier, so page and sidebar cannot disagree.
   - Today = valid date is today · Overdue = before today · Upcoming = after today (never unscheduled tasks) · Unscheduled = no valid date · Done = completed · All = everything.
   - The note a task lives in never matters (ADR-044).
4. **Completed tasks, one rule.** *Show completed* applies to the views that can hold both states (All Tasks, Today, Upcoming). Done is completed-only and Unscheduled and Overdue are active-only by definition; they ignore it. A completed task due before today is therefore in neither Overdue nor Upcoming (it was previously, by accident, in Upcoming); it lives in All Tasks and Done.
5. **Done's order is a view-level rule.** `taskViewHasFixedOrder('tasks-completed')`: Done is newest-completed-first and the shared Sort does not reorder it (the sort setting is shared by all six views and has no "reset", so honouring it would permanently lose the canonical order). No "completed date" property was added. Every other view is ordered by the shared sort.
6. **One renderer.** `TasksCollectionBody` draws every view with the generic `CollectionDataList` / `CollectionDataTable` through the shared configuration. The legacy per-view branches, the legacy row (menu, badge) on these pages and `CollectionRowList` are removed. `renderTasksByDate` and the sidebar's helpers are untouched.

## Consequences

- Behaviour changes: Upcoming no longer includes unscheduled tasks; the order of Today / Overdue / Upcoming / Unscheduled follows the shared sort (default Name A→Z) instead of date-then-title; the pages lose the sidebar row's menu and due-date badge (the canonical collection row's due-date button replaces them).
- The Sort menu still lists sort options on Done even though they do not reorder it.
- Today, Overdue and Upcoming still have no sidebar entry; the unconnected tab strip can later map onto the existing `FilteredView` identities.

## Alternatives Considered

- **One key per view** — rejected: the six are one collection; separate keys would make "same settings everywhere" false.
- **A "Completed" date property so Done follows generic sorting** — rejected: it adds a property to preserve one ordering.
- **A single Tasks route with a selected view** — rejected for now: a routing/session rewrite the task did not need.
