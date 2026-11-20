import type { TaskOccurrence } from '@core/vault/models/occurrences';

import { classifyDueDate } from './taskDueDate';

/**
 * The task datasets of the Task Collection. `tasks-inbox`, `tasks-all` and `tasks-unscheduled` are also
 * `FilteredView` kinds (pages the sidebar opens); `tasks-today` combines overdue and due-today tasks for the
 * Tasks page tab (ADR-078).
 */
export type TaskViewKind = 'tasks-inbox' | 'tasks-all' | 'tasks-completed' | 'tasks-today' | 'tasks-overdue' | 'tasks-upcoming' | 'tasks-unscheduled';

/** The legacy Show completed preference still controls Inbox membership. */
export interface TaskViewMembershipConfig {
  readonly showCompleted: boolean;
}

/**
 * THE single semantic authority for which tasks belong to each task view. View identity decides the dataset;
 * the shared collection configuration (layout, properties, sort) decides how that dataset is drawn.
 *
 * - Inbox: tasks from the managed Inbox source, respecting Show completed.
 * - Tasks: active tasks only.
 * - Completed: every completed task, regardless of due date or source.
 * - Today: active tasks due today OR overdue (due before today).
 * - Overdue: active tasks due before today (retained as an internal compatibility dataset).
 * - Upcoming: active tasks due after today.
 * - Unplanned: active tasks without a valid explicit due date.
 *
 * Ordering is the collection's sort; this function decides membership only.
 */
export function tasksForView(
  view: TaskViewKind,
  tasks: readonly TaskOccurrence[],
  { showCompleted }: TaskViewMembershipConfig,
  inboxPageId?: string
): readonly TaskOccurrence[] {
  const visible = (task: TaskOccurrence) => showCompleted || !task.completed;

  switch (view) {
    case 'tasks-inbox':
      return tasks.filter((task) => task.sourcePageId === inboxPageId && visible(task));
    case 'tasks-all':
      return tasks.filter((task) => !task.completed);
    case 'tasks-completed':
      return tasks.filter((task) => task.completed);
    case 'tasks-today':
      return tasks.filter((task) => {
        if (task.completed) return false;
        const relation = classifyDueDate(task.dueDate);
        return relation === 'today' || relation === 'past';
      });
    case 'tasks-overdue':
      return tasks.filter((task) => !task.completed && classifyDueDate(task.dueDate) === 'past');
    case 'tasks-upcoming':
      return tasks.filter((task) => !task.completed && classifyDueDate(task.dueDate) === 'future');
    case 'tasks-unscheduled':
      return tasks.filter((task) => !task.completed && classifyDueDate(task.dueDate) === 'unscheduled');
  }
}
