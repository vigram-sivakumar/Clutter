import type { MutableRefObject, RefObject } from 'react';

import { DatePickerOverlay } from '@components/date-picker/DatePicker';

export interface TaskDatePickerProps {
  anchorRef: RefObject<HTMLElement>;
  open: boolean;
  onClose: () => void;
  /** The task's currently assigned date (ISO `YYYY-MM-DD`), or undefined — pre-selects the picker exactly like Daily Notes' own calendar control does for the active date. */
  date: string | undefined;
  onSelect: (date: string) => void;
  onClear: () => void;
  /**
   * Set `.current = true` right before closing to skip the one return of focus to the anchor — for a picker opened
   * with the pointer, where handing focus back would leave the trigger focused (and anything keyed to focus pinned).
   * See useOverlayFocus.
   */
  suppressReturnFocusRef?: MutableRefObject<boolean>;
}

/**
 * A task row's date picker: the shared DatePicker, anchored below its trigger. A task's date is optional, so it
 * offers Clear (a Daily Note's date is never optional, which is why Daily Notes' own calendar has none), disabled
 * while the task has no date.
 */
export function TaskDatePicker({
  anchorRef,
  open,
  onClose,
  date,
  onSelect,
  onClear,
  suppressReturnFocusRef,
}: TaskDatePickerProps) {
  return (
    <DatePickerOverlay
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      suppressReturnFocusRef={suppressReturnFocusRef}
      selectedDate={date}
      onSelectedDateChange={onSelect}
      onClear={onClear}
      clearDisabled={date === undefined}
    />
  );
}
