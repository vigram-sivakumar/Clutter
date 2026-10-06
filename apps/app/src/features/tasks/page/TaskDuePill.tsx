import { useRef, useState } from 'react';
import { AppIcon } from '@shared/icon';
import { Pill } from '@components/property-list/Pill';
import { TaskDatePicker } from '../sidebar/TaskDatePicker';

interface TaskDuePillProps {
  /** Sets the task's due date — never moves the task (same contract as the row menu's Change due date). */
  readonly onSelect: (date: string) => void;
}

/**
 * The "Due date" affordance of a task with no due date: a calendar-icon Pill shown only on row hover (and while its calendar
 * is open); clicking it opens the same calendar (TaskDatePicker) the task row menu uses. A task that has a due date shows no pill.
 */
export function TaskDuePill({ onSelect }: TaskDuePillProps) {
  const [open, setOpen] = useState(false);
  // Pill has no ref of its own; the wrapper is the picker's anchor.
  const anchorRef = useRef<HTMLSpanElement>(null);

  return (
    <>
      <span
        ref={anchorRef}
        className={['task-row-title__pill', open && 'is-open'].filter(Boolean).join(' ')}
      >
        <Pill label="Set due date" onEdit={() => setOpen(true)}>
          <AppIcon icon="calendarDots" />
          <span className="task-row-title__pill-label">Due date</span>
        </Pill>
      </span>
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
