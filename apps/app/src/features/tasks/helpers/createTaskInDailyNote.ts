import type { Vault } from '@core/vault/models';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { TaskOperations } from '@core/application/task/TaskOperations';
import { DailyNotePath } from '@core/vault/ingest/DailyNotePath';

/**
 * New Task's one creation path, shared by the Tasks sidebar and the All
 * Tasks page. The task is always stored in *today's* Daily Note, whatever
 * its due date: the note it lives in is context, not a due date, and a due
 * date never opens, creates or moves to another day's note (ADR-044). An
 * explicit `dueDate` is written onto the task line; without one the task
 * has no due date. Non-activating (ensureAtPath) so the user stays where
 * they are. Awaited so NewTaskContent knows whether creation succeeded
 * before closing; requestSave() forces the new line to the Durable stage
 * immediately instead of waiting on autosave.
 */
export async function createTaskInDailyNote(
  { vault, pageOperations, taskOperations }: {
    readonly vault: Vault;
    readonly pageOperations: PageOperations;
    readonly taskOperations: TaskOperations;
  },
  title: string,
  dueDate: string | undefined
): Promise<void> {
  const path = DailyNotePath.absoluteFrom(vault.root, new Date());
  const pageId = await pageOperations.ensureAtPath(path, { type: 'daily-note' });

  await taskOperations.create(pageId, title, dueDate);
  await pageOperations.requestSave(pageId);
}
