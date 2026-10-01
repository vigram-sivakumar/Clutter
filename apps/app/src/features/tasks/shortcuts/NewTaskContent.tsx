import { useState } from 'react';
import { AppIcon } from '@shared/icon';
import { Input } from '@components/input/Input';
import { Button } from '@components/button/Button';
import { useOverlay } from '@components/overlay/hooks/useOverlay';
import { TaskDatePicker } from '@features/tasks/sidebar/TaskDatePicker';
import { formatTaskDueDate } from '@features/tasks/helpers/formatTaskDueDate';

import './NewTaskContent.css';

export interface NewTaskContentProps {
  title: string;
  onTitleChange(value: string): void;
  onClose(): void;
  /** See TasksShortcutsProps.onCreateTask's own doc comment. */
  onCreateTask(title: string, dueDate: string | undefined): Promise<void>;
}

/**
 * The New Task flow's content, rendered inside the shared `Dialog`
 * primitive by `TasksShortcuts` — owns the title/due-date draft state and
 * the Create button's own request lifecycle (in-flight/error), but not the
 * creation logic itself: onCreateTask is a plain callback prop (never a
 * TaskOperations/PageOperations import here — UI/Features must not import
 * a concrete application-layer class directly, ARCHITECTURE_RULES rule 6).
 */
export function NewTaskContent({
  title,
  onTitleChange,
  onClose,
  onCreateTask,
}: NewTaskContentProps) {
  // Local, not lifted to TasksShortcuts like title/onTitleChange — this
  // whole component unmounts when the Dialog closes (Overlay returns null
  // while !open), so there's nothing to reset explicitly, and nothing
  // outside this draft needs the value yet.
  const [dueDate, setDueDate] = useState<string | undefined>(undefined);
  const datePicker = useOverlay<HTMLButtonElement>();

  // Disables Create while a request is in flight (prevents a double
  // submit) and surfaces a failure inline — same minimal, scoped error
  // treatment ImagePicker.Link.tsx/.css already use (no shared error/
  // danger token exists yet in the design system; this mirrors that
  // file's own deliberate, local color rather than inventing one).
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const trimmedTitle = title.trim();

  const handleCreate = async () => {
    if (trimmedTitle === '' || isCreating) {
      return;
    }

    setIsCreating(true);
    setError(undefined);

    try {
      await onCreateTask(trimmedTitle, dueDate);
      onClose();
    } catch (creationError) {
      setIsCreating(false);
      setError(
        creationError instanceof Error ? creationError.message : 'Failed to create task.'
      );
    }
  };

  return (
    <div className="new-task">
      <div className="new-task__header">
        <span className="new-task__title">New task</span>
        <Button
          size="small"
          variant="ghost"
          interaction="subtle"
          isIconOnly
          aria-label="Close"
          onClick={onClose}
        >
          <AppIcon icon="dismiss" />
        </Button>
      </div>
      <Input
        className="new-task__input"
        value={title}
        placeholder="Task title"
        autoFocus
        hasBackground={false}
        hasBorder={false}
        onChange={(event) => onTitleChange(event.target.value)}
      />
      {error && (
        <span className="new-task__error" role="alert">
          {error}
        </span>
      )}
      <div className="new-task__footer">
        <Button
          className="new-task__due-date-button"
          ref={datePicker.anchorRef}
          variant="ghost"
          size="medium"
          interaction="subtle"
          leading={<AppIcon icon="calendarDots" />}
          onClick={datePicker.toggle}
        >
          {dueDate ? formatTaskDueDate(dueDate) : 'Due date'}
        </Button>
        <Button
          className="new-task__create-button"
          variant="primary"
          size="medium"
          disabled={trimmedTitle === '' || isCreating}
          onClick={handleCreate}
        >
          Create
        </Button>
      </div>
      <TaskDatePicker
        anchorRef={datePicker.anchorRef}
        open={datePicker.open}
        onClose={datePicker.hide}
        date={dueDate}
        onSelect={(selected) => {
          datePicker.hide();
          setDueDate(selected);
        }}
        onClear={() => {
          datePicker.hide();
          setDueDate(undefined);
        }}
      />
    </div>
  );
}
