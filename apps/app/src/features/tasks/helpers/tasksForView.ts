import type { TaskOccurrence } from '@core/vault/models/occurrences';

import { classifyDueDate } from './taskDueDate';

/**
 * The task datasets of the Task Collection. `tasks-all` and `tasks-unscheduled` are also `FilteredView` kinds (pages the
 * sidebar opens); `tasks-today` and `tasks-upcoming` are datasets only — the Tasks page's tabs select them (ADR-051).
 */
export type TaskViewKind = 'tasks-all' | 'tasks-today' | 'tasks-upcoming' | 'tasks-unscheduled';

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
 *  - Tasks        — every task. The shared "Show completed" setting applies: off hides completed ones.
 *  - Today        — explicit valid due date is today. "Show completed" applies.
 *  - Upcoming     — explicit valid due date after today (never unscheduled tasks). "Show completed" applies.
 *  - Unscheduled  — no valid explicit due date. Active tasks only — a completed task never appears
 *    there — so it ignores "Show completed".
 *
 * Ordering is the collection's sort; this function decides membership only.
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
    case 'tasks-upcoming':
      return tasks.filter((task) => visible(task) && classifyDueDate(task.dueDate) === 'future');
    case 'tasks-unscheduled':
      return tasks.filter((task) => !task.completed && classifyDueDate(task.dueDate) === 'unscheduled');
  }
}
