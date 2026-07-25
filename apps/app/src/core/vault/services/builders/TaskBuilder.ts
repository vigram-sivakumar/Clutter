import type { Page } from '@core/vault/models';
import type { Task } from '@core/vault/models/Task';

export class TaskBuilder {
  build(pages: readonly Page[]): readonly Task[] {
    const tasks: Task[] = [];

    for (const page of pages) {
      for (const task of page.analysis.tasks) {
        tasks.push({
          text: task.text,
          completed: task.completed,
        });
      }
    }

    return tasks;
  }
}
