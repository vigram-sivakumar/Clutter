import type { Page, TaskOccurrence } from '@core/vault/models';

export class TaskBuilder {
  build(pages: readonly Page[]): readonly TaskOccurrence[] {
    const tasks: TaskOccurrence[] = [];

    for (const page of pages) {
      for (const task of page.analysis.tasks) {
        tasks.push(task);
      }
    }

    return tasks;
  }
}
