import { useState } from 'react';
import { AppIcon } from '@shared/icon';
import { Input } from '@components/input/Input';
import { Button } from '@components/button/Button';
import { useOverlay } from '@components/overlay/hooks/useOverlay';
import { TaskDatePicker } from '@features/tasks/sidebar/TaskDatePicker';
import { formatTaskDueDate } from '@features/tasks/helpers/formatTaskDueDate';

import './NewTaskContent.css';

export interface NewTaskContentProps {
  /** 'create' (default) is the New Task flow; 'edit' is the task row's Edit menu action — same modal, different header/CTA text and pre-filled draft values. */
  mode?: 'create' | 'edit';
  /** Seeds the title field's local draft state on mount — only read once, like React's own `defaultValue` convention, since this component always unmounts/remounts fresh per open (see the doc comment below). */
  initialTitle?: string;
  /** Seeds the due-date field's local draft state on mount — see initialTitle's own doc comment. */
  initialDueDate?: string;
  onClose(): void;
  /**
   * Create: creates the task in its target Daily Note and resolves once
   * durable (see TasksShortcutsProps.onCreateTask's own doc comment).
   * Edit: updates the existing task's title/due date in place and
   * resolves once durable (see Sidebar.Tasks.tsx's onSaveTask). Either
   * way, a plain callback prop — never a TaskOperations/PageOperations
   * import here (UI/Features must not import a concrete application-layer
   * class directly, ARCHITECTURE_RULES rule 6).
   */
  onSubmit(title: string, dueDate: string | undefined): Promise<void>;
}

/**
 * The New Task / Edit Task modal's content, rendered inside the shared
 * `Dialog` primitive by `TasksShortcuts` (create) or `EditTaskDialog`
 * (edit) — the same component either way, per product direction not to
 * build a second edit UI. Owns the title/due-date draft state and the
 * submit button's own request lifecycle (in-flight/error) entirely
 * locally, seeded once from `initialTitle`/`initialDueDate` — this
 * component always unmounts when its own Dialog closes (Overlay returns
 * null while !open), so a fresh mount with fresh initial values is
 * exactly what the next open (whether a brand new Create or a different
 * task's Edit) already produces on its own; nothing needs to be reset or
 * lifted to either caller.
 */
export function NewTaskContent({
  mode = 'create',
  initialTitle = '',
  initialDueDate,
  onClose,
  onSubmit,
}: NewTaskContentProps) {
  const [title, setTitle] = useState(initialTitle);
  const [dueDate, setDueDate] = useState<string | undefined>(initialDueDate);
  const datePicker = useOverlay<HTMLButtonElement>();

  // Disables the submit button while a request is in flight (prevents a
  // double submit) and surfaces a failure inline — same minimal, scoped
  // error treatment ImagePicker.Link.tsx/.css already use (no shared
  // error/danger token exists yet in the design system; this mirrors that
  // file's own deliberate, local color rather than inventing one).
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const trimmedTitle = title.trim();
  const isEdit = mode === 'edit';

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
        submitError instanceof Error
          ? submitError.message
          : `Failed to ${isEdit ? 'save' : 'create'} task.`
      );
    }
  };

  return (
    <div className="new-task">
      <div className="new-task__header">
        <span className="new-task__title">{isEdit ? 'Edit Task' : 'New task'}</span>
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
          {isEdit ? 'Save' : 'Create'}
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
