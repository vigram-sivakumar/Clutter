import type { Page, TaskOccurrence } from '@core/vault/models';

/**
 * Flattens every page's tasks into the Vault's live task projection. A
 * task's `dueDate` is exactly what TaskExtractor found in its own line
 * (an explicit `@YYYY-MM-DD` mention or legacy `@due:`) — never derived
 * from where the task lives. A task inside a Daily Note belongs to that
 * day as *context*; that is not a due date, so an undated task there stays
 * undated (ADR-044).
 */
export class TaskBuilder {
  build(pages: readonly Page[]): readonly TaskOccurrence[] {
    return pages.flatMap((page) => page.analysis.tasks);
  }
}
