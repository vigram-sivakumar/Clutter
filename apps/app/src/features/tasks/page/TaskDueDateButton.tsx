import { useRef, useState } from 'react';
import { AppIcon } from '@shared/icon';
import { Button } from '@components/button/Button';
import { TaskDatePicker } from '../sidebar/TaskDatePicker';

interface TaskDueDateButtonProps {
  /** Sets the task's due date — never moves the task (same contract as the row menu's Change due date). */
  readonly onSelect: (date: string) => void;
}

/**
 * The "add a due date" control of a task that has none: an icon-only calendar Button (outline-fill) that opens the
 * same calendar (TaskDatePicker) the task row menu uses. A task that already has a due date shows its date instead.
 */
export function TaskDueDateButton({ onSelect }: TaskDueDateButtonProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <Button
        ref={anchorRef}
        isIconOnly
        variant="outline-fill"
        size="small"
        aria-label="Add due date"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(event) => {
          // The row opens its note on click; this button only opens the calendar.
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <AppIcon icon="calendarDots" />
      </Button>
      <TaskDatePicker
        anchorRef={anchorRef}
        open={open}
        onClose={() => setOpen(false)}
        date={undefined}
        onSelect={(selected) => {
          setOpen(false);
          onSelect(selected);
        }}
        onClear={() => setOpen(false)}
      />
    </>
  );
}
