import { useState } from 'react';
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
  const isEditing = props.editing !== undefined;
  // Edit mode: once something is typed or picked, Escape and a click outside no longer close the modal. New task
  // always dismisses on Escape (and outside click) — Enter creates from NewTaskContent.
  const [isDirty, setIsDirty] = useState(false);

  return (
    <Dialog open={open} onClose={onClose} dismissible={isEditing ? !isDirty : true} size="large" top={240} scrim="strong">
      <NewTaskContent
        onClose={onClose}
        onDirtyChange={setIsDirty}
        onSubmit={props.editing ? props.onSaveTask : props.onCreateTask}
        editing={props.editing}
      />
    </Dialog>
  );
}
