import { useState } from 'react';
import { AppIcon } from '@shared/icon';
import { Input } from '@components/input/Input';
import { Button } from '@components/button/Button';
import { useOverlay } from '@components/overlay/hooks/useOverlay';
import { TaskDatePicker } from '@features/tasks/sidebar/TaskDatePicker';

import './NewTaskContent.css';

export interface NewTaskContentProps {
  title: string;
  onTitleChange(value: string): void;
  onClose(): void;
}

/**
 * The New Task flow's content, rendered inside the shared `Dialog`
 * primitive by `TasksShortcuts` — owns only the title field's local draft
 * state and UI; it never calls TaskOperations or persists anything (see
 * tasksShortcuts.config.ts's own comment on why 'create-task' has no
 * backing capability yet).
 */
export function NewTaskContent({
  title,
  onTitleChange,
  onClose,
}: NewTaskContentProps) {
  // Local, not lifted to TasksShortcuts like title/onTitleChange — this
  // whole component unmounts when the Dialog closes (Overlay returns null
  // while !open), so there's nothing to reset explicitly, and nothing
  // outside this draft needs the value yet. Still UI-only: picking a date
  // never calls TaskOperations/sets a Daily Note due date.
  const [dueDate, setDueDate] = useState<string | undefined>(undefined);
  const datePicker = useOverlay<HTMLButtonElement>();

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
      <div className="new-task__footer">
        {/* No onClick on Create yet — this is still the UI-only pass: no
            TaskOperations call, no Daily Note assignment, no persistence. */}
        <Button
          ref={datePicker.anchorRef}
          variant="ghost"
          size="medium"
          leading={<AppIcon icon="calendarDots" />}
          onClick={datePicker.toggle}
        >
          {dueDate ?? 'Due date'}
        </Button>
        <Button
          className="new-task__create-button"
          variant="primary"
          size="medium"
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
