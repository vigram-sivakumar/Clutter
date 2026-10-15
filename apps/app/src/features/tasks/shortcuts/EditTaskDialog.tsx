import type { TaskOperations } from '@core/application/task/TaskOperations';
import type { TaskOccurrence } from '@core/vault/models/occurrences';
import { formatTaskTitle } from '../helpers/formatTaskTitle';
import { NewTaskDialog } from './NewTaskDialog';

/**
 * The Edit task modal for one task — the one existing edit path, opened from a task's Edit button in the Task
 * Collection and from Edit in a task's menu (sidebar and collection alike). It edits the task's own line in
 * place (ADR-044 — a due date never moves it).
 */
export function EditTaskDialog({
  task,
  taskOperations,
  onClose,
}: {
  readonly task: TaskOccurrence;
  readonly taskOperations: Pick<TaskOperations, 'update'>;
  readonly onClose: () => void;
}) {
  return (
    <NewTaskDialog
      open
      onClose={onClose}
      editing={{ title: formatTaskTitle(task.text, task.dueDate), dueDate: task.dueDate }}
      onSaveTask={(title, dueDate) => taskOperations.update(task, { title, dueDate })}
    />
  );
}
