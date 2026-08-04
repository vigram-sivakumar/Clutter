import type { TaskOccurrence as Task } from '@core/vault/models/occurrences';

/**
 * Every completed task, regardless of when it was completed, sorted
 * newest-completed-first (Completed collection view — Phase 2E). Consumes
 * the existing `completedAt` metadata only; a completed task with no
 * `completedAt` (e.g. hand-edited markdown that checked the box without
 * the metadata) sorts last rather than being dropped.
 */
export function getCompletedTasks(tasks: readonly Task[]): readonly Task[] {
  return tasks
    .filter((task) => task.completed)
    .slice()
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
}
