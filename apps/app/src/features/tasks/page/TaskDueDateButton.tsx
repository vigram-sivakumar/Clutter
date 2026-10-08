import { useRef, useState } from 'react';
import { CollectionEntryProperties } from '@features/collection/components/entry/CollectionEntryProperties';
import { TaskDatePicker } from '../sidebar/TaskDatePicker';
import { formatTaskDueDateWithYear } from '../helpers/formatTaskDueDate';

interface TaskDueDateButtonProps {
  /** The task's raw ISO `YYYY-MM-DD` due date. A task with no due date has no control at all (it gets one in the Edit task modal). */
  readonly date: string;
  /** A date string sets it, null clears it — never moves the task (same contract as the row menu's Change due date). */
  readonly onChange: (date: string | null) => void;
}

/**
 * A dated task's due date control: a clickable `CollectionEntryProperties` value that reads the full date
 * ("9 Oct 2026") and opens the same calendar (TaskDatePicker) the task row menu used, with that date
 * selected, to change or clear it. Its hover pill is a `::before` that extends past the text, so the text
 * lines up with the column title. Clicking never opens the row's note.
 */
export function TaskDueDateButton({ date, onChange }: TaskDueDateButtonProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <CollectionEntryProperties
        ref={anchorRef}
        className="collection-entry-properties--action task-row__due"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(event) => {
          // The row opens its note on click; this control only opens the calendar.
          event.stopPropagation();
          setOpen(true);
        }}
      >
        {formatTaskDueDateWithYear(date)}
      </CollectionEntryProperties>
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
