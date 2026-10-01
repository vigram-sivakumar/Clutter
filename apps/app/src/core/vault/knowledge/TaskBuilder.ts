import type { Page, TaskOccurrence } from '@core/vault/models';
import { VaultPath } from '@core/vault/ingest/VaultPath';

export class TaskBuilder {
  build(pages: readonly Page[]): readonly TaskOccurrence[] {
    const tasks: TaskOccurrence[] = [];

    for (const page of pages) {
      // A Daily Note's own date is every one of its tasks' implicit due
      // date — used only as a fallback for a task with no explicit inline
      // date (TaskExtractor's `@due:`/bare-date precedence already decided
      // that, upstream, per-task). `Page.type === 'daily-note'` is only
      // ever true for a path that already round-trip-validated against
      // DailyNotePath's canonical format (see isDailyNotePath), so the
      // page's filename (minus `.md`, via the one shared VaultPath helper
      // — rule 9) is always a real `YYYY-MM-DD` string, with no further
      // parsing/validation needed here. Purely derived, same as every
      // other live projection: nothing is written back to the page's
      // Markdown to produce this.
      const impliedDueDate = page.type === 'daily-note' ? VaultPath.pageName(page.path) : undefined;

      for (const task of page.analysis.tasks) {
        tasks.push(task.dueDate == null && impliedDueDate != null ? { ...task, dueDate: impliedDueDate } : task);
      }
    }

    return tasks;
  }
}
