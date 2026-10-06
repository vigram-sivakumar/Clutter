import { Dialog } from '@components/dialog/Dialog';
import { NewTaskContent } from './NewTaskContent';

interface NewTaskDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** See TasksShortcutsProps.onCreateTask — resolves once the task is durable, rejects on failure. */
  readonly onCreateTask: (title: string, dueDate: string | undefined) => Promise<void>;
}

/** The one New Task modal — opened from the Tasks sidebar's New task row and the All Tasks page's header button. */
export function NewTaskDialog({ open, onClose, onCreateTask }: NewTaskDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} size="large" top={240} scrim="strong" dismissible={false}>
      <NewTaskContent onClose={onClose} onSubmit={onCreateTask} />
    </Dialog>
  );
}
