import type { Vault } from '@core/vault/models';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { TaskOperations } from '@core/application/task/TaskOperations';
import { DailyNotePath } from '@core/vault/ingest/DailyNotePath';
import { toDate } from '@shared/helpers/time/helpers/toDate';
import { toISODate } from '@shared/helpers/time/helpers/toISODate';

/**
 * New Task's one creation path, shared by the Tasks sidebar and the All
 * Tasks page: the task goes into the selected due date's Daily Note, or
 * today's when none was picked — its canonical location, per TaskBuilder's
 * existing implicit-due-date fallback, which is also why no inline @date
 * is ever written by TaskOperations.create(). Same
 * PageOperations.openAtPath(DailyNotePath.absoluteFrom(...)) resolve-or-draft
 * call the Daily Notes sidebar already uses. Awaited so NewTaskContent knows
 * whether creation succeeded before closing; requestSave() forces the new
 * line to the Durable stage immediately instead of waiting on autosave.
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
  const targetDate = dueDate ?? toISODate(new Date());
  const path = DailyNotePath.absoluteFrom(vault.root, toDate(targetDate));
  const pageId = await pageOperations.openAtPath(path, { type: 'daily-note' });

  await taskOperations.create(pageId, title);
  await pageOperations.requestSave(pageId);
}
