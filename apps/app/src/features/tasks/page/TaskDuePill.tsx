import { useRef, useState } from 'react';
import { AppIcon } from '@shared/icon';
import { Pill } from '@components/property-list/Pill';
import { TaskDatePicker } from '../sidebar/TaskDatePicker';
import { formatTaskDueDate } from '../helpers/formatTaskDueDate';

interface TaskDuePillProps {
  /** The task's raw ISO `YYYY-MM-DD` due date; absent, the pill is an empty "Due date" affordance shown only while the row is hovered. */
  readonly date?: string;
  /** A date string sets it, null clears it — never moves the task (same contract as the row menu's Change due date). */
  readonly onChange: (date: string | null) => void;
}

/**
 * A task's due date as a Pill; clicking it opens the same calendar (TaskDatePicker) the task row menu uses.
 * Without a date it is a calendar icon + "Due date" pill that appears on row hover (and stays while its calendar is open).
 */
export function TaskDuePill({ date, onChange }: TaskDuePillProps) {
  const [open, setOpen] = useState(false);
  // Pill has no ref of its own; the wrapper is the picker's anchor.
  const anchorRef = useRef<HTMLSpanElement>(null);

  return (
    <>
      <span
        ref={anchorRef}
        className={[
          'task-row-title__pill',
          date === undefined && 'task-row-title__pill--empty',
          open && 'is-open',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <Pill
          label={date === undefined ? 'Set due date' : 'Change due date'}
          onEdit={() => setOpen(true)}
        >
          {date === undefined ? (
            <>
              <AppIcon icon="calendarDots" />
              <span className="task-row-title__pill-label">Due date</span>
            </>
          ) : (
            formatTaskDueDate(date)
          )}
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
