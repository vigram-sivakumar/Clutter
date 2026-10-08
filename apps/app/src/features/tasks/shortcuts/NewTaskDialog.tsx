import { Dialog } from '@components/dialog/Dialog';
import { NewTaskContent, type EditingTask } from './NewTaskContent';

interface NewTaskDialogBaseProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

/** The New Task modal. */
interface NewTaskModeProps extends NewTaskDialogBaseProps {
  /** See TasksShortcutsProps.onCreateTask — resolves once the task is durable, rejects on failure. */
  readonly onCreateTask: (title: string, dueDate: string | undefined) => Promise<void>;
  readonly editing?: undefined;
  readonly onSaveTask?: undefined;
}

/** Edit mode: the same modal, prepopulated with an existing task. */
interface EditTaskModeProps extends NewTaskDialogBaseProps {
  readonly editing: EditingTask;
  /** Saves the change to the existing task — resolves once durable, rejects on failure. Never creates a task. */
  readonly onSaveTask: (title: string, dueDate: string | undefined) => Promise<void>;
  readonly onCreateTask?: undefined;
}

type NewTaskDialogProps = NewTaskModeProps | EditTaskModeProps;

/**
 * The one task modal — New task (opened from the Tasks sidebar's New task row and the All Tasks page's
 * header button) and, with `editing`, Edit task (opened from a task's Edit button in the Task Collection).
 */
export function NewTaskDialog(props: NewTaskDialogProps) {
  const { open, onClose } = props;

  return (
    <Dialog open={open} onClose={onClose} size="large" top={240} scrim="strong" dismissible={false}>
      <NewTaskContent
        onClose={onClose}
        onSubmit={props.editing ? props.onSaveTask : props.onCreateTask}
        editing={props.editing}
      />
    </Dialog>
  );
}
