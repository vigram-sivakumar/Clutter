import { useRef, useState } from 'react';
import { Pill } from '@components/property-list/Pill';
import { TaskDatePicker } from '../sidebar/TaskDatePicker';
import { formatTaskDueDate } from '../helpers/formatTaskDueDate';

interface TaskDuePillProps {
  /** The task's raw ISO `YYYY-MM-DD` due date. */
  readonly date: string;
  /** A date string sets it, null clears it — never moves the task (same contract as the row menu's Change due date). */
  readonly onChange: (date: string | null) => void;
}

/** A task's due date as a Pill; clicking it opens the same calendar (TaskDatePicker) the task row menu uses. */
export function TaskDuePill({ date, onChange }: TaskDuePillProps) {
  const [open, setOpen] = useState(false);
  // Pill has no ref of its own; the wrapper is the picker's anchor.
  const anchorRef = useRef<HTMLSpanElement>(null);

  return (
    <>
      <span ref={anchorRef} className="task-row-title__pill">
        <Pill size="small" label="Change due date" onEdit={() => setOpen(true)}>
          {formatTaskDueDate(date)}
        </Pill>
      </span>
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
