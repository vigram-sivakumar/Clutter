import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { Input } from '@components/input/Input';
import { Overlay } from '@components/overlay/Overlay';
import { Calendar } from '@features/daily-notes/calendar/components/calendar/Calendar';
import type { CalendarMode } from '@features/daily-notes/calendar/models/CalendarMode';

import type { PropertyEditability } from './PropertyList.types';
import { PropertyValueCell } from './PropertyValueCell';
import { parseDatePropertyValue } from './formatDatePropertyValue';

type DatePropertyValueProps = {
  /** The property's name — used only as the field's accessible label. */
  name: string;
  /** Raw stored value (a local `YYYY-MM-DD` date or an ISO timestamp), or null. */
  value: string | null;
  /** Display formatting for a raw value — supplied by the property type registry. */
  format(value: string): string;
} & PropertyEditability<string>;

/**
 * The `date` Property's value. `editable` (supplied by the adapter, never
 * inferred here) picks the state: read-only renders the formatted value as
 * plain text; editable renders it in a single-line Input that opens the
 * shared Calendar as an anchored overlay.
 */
export function DatePropertyValue(props: DatePropertyValueProps) {
  const display = props.value ? props.format(props.value) : '';

  if (!props.editable) {
    return <PropertyValueCell>{display}</PropertyValueCell>;
  }

  return (
    <DatePropertyEditor
      name={props.name}
      value={props.value}
      display={display}
      onCommit={props.onCommit}
    />
  );
}

interface DatePropertyEditorProps {
  name: string;
  value: string | null;
  display: string;
  /** Fired with the picked day as a local `YYYY-MM-DD` — the Calendar's own representation. */
  onCommit(value: string): void;
}

/**
 * Editable state. The Input is read-only text — the value is changed only
 * through the Calendar, the same Calendar + Overlay pairing TaskDatePicker
 * uses, so no second date picker or date format is introduced.
 */
function DatePropertyEditor({ name, value, display, onCommit }: DatePropertyEditorProps) {
  const anchorRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<CalendarMode>('month');
  // Overlay hands focus back to the Input when it closes; without this,
  // that returning focus would immediately reopen the calendar. Consumed
  // by the next focus, and cleared on blur for a close where the Input
  // already had focus (no focus event follows).
  const ignoreNextFocusRef = useRef(false);

  const selectedDate = value ? parseDatePropertyValue(value)?.isoDate : undefined;

  function close() {
    ignoreNextFocusRef.current = true;
    setOpen(false);
  }

  function handleFocus() {
    if (ignoreNextFocusRef.current) {
      ignoreNextFocusRef.current = false;
      return;
    }

    setOpen(true);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
    }
  }

  function handleSelect(isoDate: string) {
    onCommit(isoDate);
    close();
  }

  return (
    <>
      <Input
        ref={anchorRef}
        className="property-list__value property-list__input property-list__date-input"
        readOnly
        hasBackground={open}
        hasBorder={open}
        aria-label={name}
        aria-haspopup="dialog"
        aria-expanded={open}
        placeholder="Empty"
        value={display}
        onFocus={handleFocus}
        onBlur={() => {
          ignoreNextFocusRef.current = false;
        }}
        onClick={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      <Overlay open={open} onClose={close} anchorRef={anchorRef} side="bottom" alignment="start">
        <div className="property-date-picker">
          <Calendar
            mode={mode}
            selectedDate={selectedDate}
            onModeChange={setMode}
            onSelectedDateChange={handleSelect}
          />
        </div>
      </Overlay>
    </>
  );
}
