import type { Task } from '@core/vault/models/Task';
import type { ScannedPage } from './VaultScanResult';

export class TaskBuilder {
  build(pages: readonly ScannedPage[]): readonly Task[] {
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
