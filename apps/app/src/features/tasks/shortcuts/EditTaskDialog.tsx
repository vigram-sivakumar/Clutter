import { Dialog } from '@components/dialog/Dialog';
import type { TaskOccurrence } from '@core/vault/models/occurrences';
import type { TaskOperations } from '@core/application/task/TaskOperations';
import { formatTaskTitle } from '@features/tasks/helpers/formatTaskTitle';
import { NewTaskContent } from './NewTaskContent';

export interface EditTaskDialogProps {
  /** Owned by the caller (Sidebar.Tasks.tsx / PageHost.tsx) — undefined closes the dialog, same convention as TasksShortcuts' own isNewTaskOpen. */
  task: TaskOccurrence | undefined;
  onClose(): void;
  /**
   * Received directly as a prop, not imported — the same pattern every
   * existing sidebar-row caller already uses (Sidebar.Tasks.tsx's own
   * onToggleComplete/onDateChange close over `taskOperations` the exact
   * same way); this is the one small piece (Dialog + NewTaskContent
   * wiring) both Sidebar.Tasks.tsx and PageHost.tsx's task-collection view
   * would otherwise duplicate.
   */
  taskOperations: TaskOperations;
}

/**
 * The Edit Task flow: the exact same Dialog + NewTaskContent the New Task
 * flow uses (TasksShortcuts.tsx), in `mode="edit"`, pre-filled from `task`.
 * Saving calls TaskOperations.update() — title and due date only, never a
 * move between notes or Daily Notes (see that method's own doc comment).
 * Shared between the Tasks sidebar and the Today/Overdue/Upcoming/
 * Completed/All/Unscheduled collection pages (PageHost.tsx), which render
 * the same task rows and must offer the same Edit action identically.
 */
export function EditTaskDialog({ task, onClose, taskOperations }: EditTaskDialogProps) {
  return (
    <Dialog
      open={task !== undefined}
      onClose={onClose}
      size="large"
      top={240}
      scrim="strong"
      dismissible={false}
    >
      {task && (
        <NewTaskContent
          mode="edit"
          initialTitle={formatTaskTitle(task.text, task.dueDate)}
          initialDueDate={task.dueDate}
          onClose={onClose}
          onSubmit={(title, dueDate) => taskOperations.update(task, { title, dueDate })}
        />
      )}
    </Dialog>
  );
}
