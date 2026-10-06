import { useState } from 'react';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';
import { NewTaskDialog } from '../shortcuts/NewTaskDialog';

interface NewTaskButtonProps {
  /** See TasksShortcutsProps.onCreateTask — resolves once the task is durable, rejects on failure. */
  readonly onCreateTask: (title: string, dueDate: string | undefined) => Promise<void>;
}

/** The collection header's primary Add button for the All Tasks page — opens the same New Task dialog the Tasks sidebar uses. */
export function NewTaskButton({ onCreateTask }: NewTaskButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button isIconOnly variant="primary" aria-label="New task" onClick={() => setOpen(true)}>
        <AppIcon icon="plus" />
      </Button>
      <NewTaskDialog open={open} onClose={() => setOpen(false)} onCreateTask={onCreateTask} />
    </>
  );
}
