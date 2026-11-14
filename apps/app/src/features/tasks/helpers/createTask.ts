import type { Vault } from '@core/vault/models';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { TaskOperations } from '@core/application/task/TaskOperations';
import { splitDueDate } from '@core/vault/ingest/extractors/TaskExtractor';
import { DailyNotePath } from '@core/vault/ingest/DailyNotePath';
import { taskInboxPath } from '@core/vault/initialize/ReservedResources';
import { toDate } from '@shared/helpers/time/helpers/toDate';
import { isValidCalendarDate } from '@shared/helpers/time/helpers/isValidCalendarDate';
import {
  readDefaultTaskLocation,
  type DefaultTaskLocation,
} from '@shared/helpers/defaultTaskLocationPreference';

/** One global creation workflow; the caller may override the preference for Inbox's contextual New action. */
export async function createTask(
  {
    vault,
    pageOperations,
    taskOperations,
  }: {
    readonly vault: Vault;
    readonly pageOperations: PageOperations;
    readonly taskOperations: TaskOperations;
  },
  title: string,
  dueDate: string | undefined,
  location: DefaultTaskLocation = readDefaultTaskLocation()
): Promise<void> {
  const calendarDate = splitDueDate(dueDate).dueDate;
  const date =
    location === 'due-date' && calendarDate && isValidCalendarDate(calendarDate)
      ? toDate(calendarDate)
      : new Date();
  const path =
    location === 'inbox'
      ? taskInboxPath(vault.root)
      : DailyNotePath.absoluteFrom(vault.root, date);
  const pageId = await pageOperations.ensureAtPath(path, {
    type: location === 'inbox' ? 'note' : 'daily-note',
  });
  await taskOperations.create(pageId, title, dueDate);
  await pageOperations.requestSave(pageId);
}
