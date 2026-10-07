import type { TaskOccurrence } from '@core/vault/models/occurrences';

import { classifyDueDate } from './taskDueDate';
import { getCompletedTasks } from './getCompletedTasks';

/** The task views of the Task Collection — the same ids as the `tasks-*` FilteredView kinds. */
export type TaskViewKind =
  | 'tasks-all'
  | 'tasks-today'
  | 'tasks-overdue'
  | 'tasks-upcoming'
  | 'tasks-unscheduled'
  | 'tasks-completed';

/**
 * The slice of the shared Tasks-view display preference that decides MEMBERSHIP (the other half,
 * Auto-sort completed, is ordering and belongs to the collection).
 */
export interface TaskViewMembershipConfig {
  readonly showCompleted: boolean;
}

/**
 * THE single semantic authority for which tasks belong to each task view. View identity decides
 * the dataset; the shared collection configuration (layout, properties, sort) decides how that
 * dataset is drawn. Nothing else — no render branch, helper or component — filters tasks per view.
 *
 * Membership (due dates are interpreted only by `classifyDueDate`):
 *  - All Tasks    — every task.
 *  - Today        — explicit valid due date is today.
 *  - Overdue      — explicit valid due date before today.
 *  - Upcoming     — explicit valid due date after today (never unscheduled tasks).
 *  - Unscheduled  — no valid explicit due date.
 *  - Done         — completed tasks only.
 *
 * Completed tasks — ONE rule: the shared "Show completed" setting applies to the views that can
 * hold tasks in both states (All Tasks, Today, Upcoming): off hides their completed tasks. The
 * other three are decided by definition and ignore the setting:
 *  - Done is completed-only (its whole point);
 *  - Unscheduled holds active tasks only — a completed task never appears there;
 *  - Overdue holds active tasks only — a completed task is not "still overdue" (the rule the
 *    sidebar's Overdue section has always applied).
 * A completed task that was due before today is therefore in no dated view; it lives in All Tasks
 * and Done.
 *
 * Ordering: membership only, except Done — see `taskViewHasFixedOrder`.
 */
export function tasksForView(
  view: TaskViewKind,
  tasks: readonly TaskOccurrence[],
  { showCompleted }: TaskViewMembershipConfig
): readonly TaskOccurrence[] {
  const visible = (task: TaskOccurrence) => showCompleted || !task.completed;

  switch (view) {
    case 'tasks-all':
      return tasks.filter(visible);
    case 'tasks-today':
      return tasks.filter((task) => visible(task) && classifyDueDate(task.dueDate) === 'today');
    case 'tasks-overdue':
      return tasks.filter((task) => !task.completed && classifyDueDate(task.dueDate) === 'past');
    case 'tasks-upcoming':
      return tasks.filter((task) => visible(task) && classifyDueDate(task.dueDate) === 'future');
    case 'tasks-unscheduled':
      return tasks.filter((task) => !task.completed && classifyDueDate(task.dueDate) === 'unscheduled');
    case 'tasks-completed':
      // Newest completed first — this view's own semantic order (see taskViewHasFixedOrder).
      return getCompletedTasks(tasks);
  }
}

/**
 * Whether a view has a deliberate, semantic order of its own that the shared Sort by does not
 * change. Only Done: it lists completed tasks newest-completed-first (`getCompletedTasks`). The
 * sort setting is shared by every task view and a user's explicit choice has no "reset", so letting
 * it reorder Done would permanently lose the canonical order; Done's order is therefore a view-level
 * rule that takes precedence over the collection sort (and over Auto-sort completed, which is moot
 * for a completed-only list). Every other view is ordered by the collection's sort.
 */
export function taskViewHasFixedOrder(view: TaskViewKind): boolean {
  return view === 'tasks-completed';
}
