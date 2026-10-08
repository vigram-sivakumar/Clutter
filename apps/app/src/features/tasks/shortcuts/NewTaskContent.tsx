import { useState } from 'react';
import { AppIcon } from '@shared/icon';
import { Input } from '@components/input/Input';
import { Button } from '@components/button/Button';
import { useOverlay } from '@components/overlay/hooks/useOverlay';
import { TaskDatePicker } from '@features/tasks/sidebar/TaskDatePicker';
import type { ISODate } from '@shared/helpers/time/types';
import { formatTaskDueDate } from '@features/tasks/helpers/formatTaskDueDate';

import './NewTaskContent.css';

/** The task being edited — its title text (as the row shows it) and explicit due date. Present means Edit mode. */
export interface EditingTask {
  readonly title: string;
  readonly dueDate: string | undefined;
}

export interface NewTaskContentProps {
  onClose(): void;
  /**
   * Edit mode: the modal opens prepopulated with this task, reads "Edit task" / "Save changes", and
   * `onSubmit` saves the change to the EXISTING task (the host decides how — it never creates one).
   * Absent: the New Task modal, unchanged.
   */
  editing?: EditingTask;
  /**
   * Creates the task in its target Daily Note and resolves once durable
   * (see TasksShortcutsProps.onCreateTask's own doc comment) — a plain
   * callback prop, never a TaskOperations/PageOperations import here
   * (UI/Features must not import a concrete application-layer class
   * directly, ARCHITECTURE_RULES rule 6).
   */
  onSubmit(title: string, dueDate: string | undefined): Promise<void>;
}

/**
 * The New Task modal's content, rendered inside the shared `Dialog`
 * primitive by `TasksShortcuts`. Owns the title/due-date draft state and
 * the submit button's own request lifecycle (in-flight/error) entirely
 * locally — this component always unmounts when its own Dialog closes
 * (Overlay returns null while !open), so a fresh mount is exactly what
 * the next open already produces on its own; nothing needs to be reset or
 * lifted to the caller.
 */
export function NewTaskContent({ onClose, onSubmit, editing }: NewTaskContentProps) {
  const isEditing = editing !== undefined;
  const [title, setTitle] = useState(editing?.title ?? '');
  const [dueDate, setDueDate] = useState<ISODate | undefined>(editing?.dueDate as ISODate | undefined);
  const datePicker = useOverlay<HTMLButtonElement>();

  // Disables the submit button while a request is in flight (prevents a
  // double submit) and surfaces a failure inline — same minimal, scoped
  // error treatment ImagePicker.Link.tsx/.css already use (no shared
  // error/danger token exists yet in the design system; this mirrors that
  // file's own deliberate, local color rather than inventing one).
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const trimmedTitle = title.trim();

  const handleSubmit = async () => {
    if (trimmedTitle === '' || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(undefined);

    try {
      await onSubmit(trimmedTitle, dueDate);
      onClose();
    } catch (submitError) {
      setIsSubmitting(false);
      setError(
        submitError instanceof Error ? submitError.message : isEditing ? 'Failed to save task.' : 'Failed to create task.'
      );
    }
  };

  return (
    <div className="new-task">
      <div className="new-task__header">
        <span className="new-task__title">{isEditing ? 'Edit task' : 'New task'}</span>
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
        multiline
        rows={1}
        hasBackground={false}
        hasBorder={false}
        onChange={(event) => setTitle(event.target.value)}
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
          disabled={trimmedTitle === '' || isSubmitting}
          onClick={handleSubmit}
        >
          {isEditing ? 'Save changes' : 'Create'}
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
