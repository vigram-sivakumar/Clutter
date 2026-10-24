import type { TaskOperations } from '@core/application/task/TaskOperations';
import type { TaskOccurrence } from '@core/vault/models/occurrences';
import type { ToastApi } from '@components/toast/ToastProvider';

export interface TaskActions {
  toggleComplete(task: TaskOccurrence): void;
  /** `null` clears the date. */
  changeDueDate(task: TaskOccurrence, date: string | null): void;
  duplicate(task: TaskOccurrence): void;
  remove(task: TaskOccurrence): void;
}

/**
 * The task actions the Tasks page, the Tasks sidebar and a note's References run, each reporting a failure
 * (the task's note could not be written) instead of leaving a checkbox or date that silently did not
 * change. A success is silent: the list and the checkbox already show it.
 */
export function createTaskActions(
  taskOperations: Pick<TaskOperations, 'toggleComplete' | 'setDate' | 'clearDate' | 'duplicate' | 'delete'>,
  toast: ToastApi
): TaskActions {
  const guard = (run: () => Promise<void>, message: string): void => {
    try {
      void Promise.resolve(run()).catch((error: unknown) => toast.fail(message, error));
    } catch (error) {
      toast.fail(message, error);
    }
  };

  return {
    toggleComplete: (task) => guard(() => taskOperations.toggleComplete(task), 'Couldn’t update the task'),
    changeDueDate: (task, date) =>
      guard(
        () => (date === null ? taskOperations.clearDate(task) : taskOperations.setDate(task, date)),
        'Couldn’t change the due date'
      ),
    duplicate: (task) => guard(() => taskOperations.duplicate(task), 'Couldn’t duplicate the task'),
    remove: (task) => guard(() => taskOperations.delete(task), 'Couldn’t delete the task'),
  };
}
