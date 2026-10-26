import { useState } from 'react';
import type { MouseEvent, MutableRefObject, ReactNode, RefObject } from 'react';

import { Entry } from '@components/entry/Entry';
import { Overlay } from '@components/overlay/Overlay';
import type { OverlayBackdrop } from '@components/overlay/Overlay.types';
import { AppIcon } from '@shared/icon';
import { Calendar } from '@features/daily-notes/calendar/components/calendar/Calendar';
import type { CalendarMode } from '@features/daily-notes/calendar/models/CalendarMode';
import './DatePicker.css';

export interface DatePickerProps {
  /** The currently selected date (ISO `YYYY-MM-DD`), or undefined when there is none. */
  selectedDate: string | undefined;
  onSelectedDateChange(date: string): void;
  /**
   * Shows the "Clear" action on the footer's left. Omit it for a value that can never be empty. It empties the
   * value — nothing is deleted.
   */
  onClear?(): void;
  /** Disables Clear — there is nothing to clear. */
  clearDisabled?: boolean;
  /** Further footer actions (for example a future time control). They sit on the footer's right, opposite Clear. */
  actions?: ReactNode;
  /**
   * Stops a press inside the picker from taking focus, so a text field outside it (the date Property's input)
   * stays focused — and typeable — while the user browses months or picks a day.
   */
  keepFocusOnPress?: boolean;
}

/**
 * The one date-picker surface: the shared Calendar over a footer with Clear on the left and any other actions on
 * the right. Every date picker in the app renders through here, so layout, month navigation, the Today shortcut and
 * the footer stay identical. Positioning and dismissal belong to the caller (see DatePickerOverlay).
 */
export function DatePicker({
  selectedDate,
  onSelectedDateChange,
  onClear,
  clearDisabled = false,
  actions,
  keepFocusOnPress = false,
}: DatePickerProps) {
  const [mode, setMode] = useState<CalendarMode>('month');
  const hasFooter = onClear !== undefined || actions !== undefined;

  return (
    <div
      className="date-picker"
      onMouseDown={
        keepFocusOnPress
          ? (event: MouseEvent) => event.preventDefault()
          : undefined
      }
    >
      <Calendar
        mode={mode}
        selectedDate={selectedDate}
        onModeChange={setMode}
        onSelectedDateChange={onSelectedDateChange}
      />
      {hasFooter && <div className="menu__divider" role="separator" />}
      {hasFooter && (
        <div className="date-picker__footer">
          {onClear && (
            <Entry
              className="date-picker__clear"
              leading={<AppIcon icon="dismiss" />}
              disabled={clearDisabled}
              onClick={onClear}
            >
              Clear
            </Entry>
          )}
          {actions && <div className="date-picker__actions">{actions}</div>}
        </div>
      )}
    </div>
  );
}

export interface DatePickerOverlayProps extends DatePickerProps {
  anchorRef: RefObject<HTMLElement>;
  open: boolean;
  onClose(): void;
  /** Where focus returns when the picker closes, when that is not the anchor itself. */
  returnFocusRef?: RefObject<HTMLElement>;
  /** Set `.current = true` right before closing to skip the one return of focus — see useOverlayFocus. */
  suppressReturnFocusRef?: MutableRefObject<boolean>;
  /** `false` when the picker must not cover the control it belongs to (the date Property's input). */
  backdrop?: OverlayBackdrop;
}

/** A DatePicker anchored below its trigger — the placement every date picker uses. */
export function DatePickerOverlay({
  anchorRef,
  open,
  onClose,
  returnFocusRef,
  suppressReturnFocusRef,
  backdrop,
  ...pickerProps
}: DatePickerOverlayProps) {
  return (
    <Overlay
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      returnFocusRef={returnFocusRef}
      suppressReturnFocusRef={suppressReturnFocusRef}
      side="bottom"
      alignment="start"
      backdrop={backdrop}
    >
      <DatePicker {...pickerProps} />
    </Overlay>
  );
}
