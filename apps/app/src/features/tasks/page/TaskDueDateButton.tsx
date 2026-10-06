import { useRef, useState } from 'react';
import { AppIcon } from '@shared/icon';
import { Button } from '@components/button/Button';
import { TaskDatePicker } from '../sidebar/TaskDatePicker';
import { formatTaskDueDateWithYear } from '../helpers/formatTaskDueDate';

interface TaskDueDateButtonProps {
  /** The task's raw ISO `YYYY-MM-DD` due date; absent, the button is the icon-only "add a due date" control. */
  readonly date?: string;
  /** A date string sets it, null clears it — never moves the task (same contract as the row menu's Change due date). */
  readonly onChange: (date: string | null) => void;
}

/**
 * A task's due date control, always a `Button` that opens the same calendar (TaskDatePicker) the task
 * row menu used:
 * - no due date: icon-only outline-fill calendar button, shown on row hover (in the trailing slot) to add one;
 * - a due date: the default-variant button reads the full date ("9 Oct 2026"), always visible (in the trailing slot); the calendar
 *   opens with that date selected and can change or clear it.
 * Clicking never opens the row's note.
 */
export function TaskDueDateButton({ date, onChange }: TaskDueDateButtonProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const hasDate = date !== undefined;

  return (
    <>
      <Button
        ref={anchorRef}
        className={['task-row__due-button', !hasDate && 'task-row__due-button--empty', open && 'is-open']
          .filter(Boolean)
          .join(' ')}
        isIconOnly={!hasDate}
        // The add-due-date icon button is outline-fill; a set date uses the Button's default variant.
        variant={hasDate ? undefined : 'outline-fill'}
        size="small"
        aria-label={hasDate ? undefined : 'Add due date'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(event) => {
          // The row opens its note on click; this button only opens the calendar.
          event.stopPropagation();
          setOpen(true);
        }}
      >
        {hasDate ? formatTaskDueDateWithYear(date) : <AppIcon icon="calendarDots" />}
      </Button>
      <TaskDatePicker
        anchorRef={anchorRef}
        open={open}
        onClose={() => setOpen(false)}
        date={date}
        onSelect={(selected) => {
          setOpen(false);
          onChange(selected);
        }}
        onClear={() => {
          setOpen(false);
          onChange(null);
        }}
      />
    </>
  );
}
