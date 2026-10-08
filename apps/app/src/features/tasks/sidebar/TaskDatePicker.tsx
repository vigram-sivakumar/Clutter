import { useState } from 'react';
import type { MutableRefObject, RefObject } from 'react';

import { Button } from '@components/button/Button';
import { Overlay } from '@components/overlay/Overlay';
import { AppIcon } from '@shared/icon';
import { Calendar } from '@features/daily-notes/calendar/components/calendar/Calendar';
import type { CalendarMode } from '@features/daily-notes/calendar/models/CalendarMode';
import './TaskDatePicker.css';

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
 * A task row's date picker: the same Calendar grid Daily Notes' own nav
 * control uses (Calendar.tsx), anchored/positioned/dismissed via the same
 * Overlay + useOverlay convention — not a second date-picker implementation
 * — plus a "Clear date" action Daily Notes has no use for (a Daily Note's
 * date is never optional) but a task's is, since Calendar itself has no
 * clear affordance.
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
  const [mode, setMode] = useState<CalendarMode>('month');

  return (
    <Overlay
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      suppressReturnFocusRef={suppressReturnFocusRef}
      side="bottom"
      alignment="start"
    >
      <div className="task-date-picker">
        <Calendar
          mode={mode}
          selectedDate={date}
          onModeChange={setMode}
          onSelectedDateChange={onSelect}
        />
        <Button
          className="task-date-picker__clear"
          variant="ghost"
          interaction="subtle"
          size="small"
          leading={<AppIcon icon="trash" />}
          disabled={date === undefined}
          onClick={onClear}
        >
          Clear date
        </Button>
      </div>
    </Overlay>
  );
}
