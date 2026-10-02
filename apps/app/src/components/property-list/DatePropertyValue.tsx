import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { Button } from '@components/button/Button';
import { Input } from '@components/input/Input';
import { Overlay } from '@components/overlay/Overlay';
import { AppIcon } from '@shared/icon';
import { parseDateInput } from '@shared/helpers/time/parseDateInput';
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
} & PropertyEditability<string | null>;

/**
 * The `date` Property's value. `editable` (supplied by the adapter, never
 * inferred here) picks the state: read-only renders the formatted value as
 * plain text; editable renders a single-line Input that accepts a typed
 * date and opens the shared Calendar as an anchored overlay.
 */
export function DatePropertyValue(props: DatePropertyValueProps) {
  if (!props.editable) {
    return <PropertyValueCell>{props.value ? props.format(props.value) : ''}</PropertyValueCell>;
  }

  return (
    <DatePropertyEditor
      name={props.name}
      value={props.value}
      display={props.value ? props.format(props.value) : ''}
      onCommit={props.onCommit}
    />
  );
}

interface DatePropertyEditorProps {
  name: string;
  value: string | null;
  display: string;
  /** Fired with a local `YYYY-MM-DD` — from a typed valid date or a Calendar pick — or null when cleared. */
  onCommit(value: string | null): void;
}


/**
 * Editable state. Two entry paths, one canonical value (`value`, owned by
 * the caller):
 * - typing: the text stays exactly as typed while focused (`draft`); each
 *   time it parses to a real date (parseDateInput) that date commits
 *   immediately, so the Calendar — which only ever reads `value` — moves
 *   to it. Incomplete/invalid text commits nothing and resets nothing.
 * - the Calendar (same Calendar + Overlay pairing TaskDatePicker uses):
 *   a pick commits and drops the draft, so the input shows the formatted
 *   value; its "Clear" action commits null, emptying the value while the
 *   Calendar stays open.
 * On blur the draft is dropped and the input shows the formatted
 * canonical value again — so any typed form is normalized, and a
 * still-invalid draft simply reverts.
 */
function DatePropertyEditor({ name, value, display, onCommit }: DatePropertyEditorProps) {
  const anchorRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<CalendarMode>('month');
  const [draft, setDraft] = useState<string | null>(null);
  // Overlay hands focus back to the Input when it closes; without this,
  // that returning focus would immediately reopen the calendar. Consumed
  // by the next focus, and cleared on blur for a close where the Input
  // already had focus (no focus event follows).
  const ignoreNextFocusRef = useRef(false);
  // Set when the calendar closes because focus left the input, so Overlay
  // doesn't pull focus back from wherever the user moved it.
  const suppressReturnFocusRef = useRef(false);

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

  function handleChange(text: string) {
    setDraft(text);

    const isoDate = parseDateInput(text);

    if (isoDate !== null && isoDate !== selectedDate) {
      onCommit(isoDate);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      setDraft(null);
      setOpen(false);
    }
  }

  function handleSelect(isoDate: string) {
    setDraft(null);
    onCommit(isoDate);
    close();
  }

  // Stays open: the user can pick another date right away, or dismiss the
  // calendar themselves.
  function handleClear() {
    setDraft(null);
    onCommit(null);
  }

  return (
    <>
      <Input
        ref={anchorRef}
        className="property-list__value property-list__input property-list__date-input"
        hasBackground={open}
        hasBorder={open}
        aria-label={name}
        aria-haspopup="dialog"
        aria-expanded={open}
        placeholder="Empty"
        value={draft ?? display}
        onChange={(event) => handleChange(event.target.value)}
        onFocus={handleFocus}
        onBlur={() => {
          ignoreNextFocusRef.current = false;
          setDraft(null);

          if (open) {
            suppressReturnFocusRef.current = true;
            setOpen(false);
          }
        }}
        onClick={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {/*
        No backdrop: a backdrop would cover the input and swallow a click
        meant to place the caret (same reason as TableHandleMenu). The
        input's blur closes the calendar instead, and mouse-down inside the
        calendar is kept from taking focus, so the input stays focused (and
        typeable) while the user browses months or picks a day.
      */}
      <Overlay
        open={open}
        onClose={close}
        anchorRef={anchorRef}
        side="bottom"
        alignment="start"
        backdrop={false}
        suppressReturnFocusRef={suppressReturnFocusRef}
      >
        <div className="property-date-picker" onMouseDown={(event) => event.preventDefault()}>
          <Calendar
            mode={mode}
            selectedDate={selectedDate}
            onModeChange={setMode}
            onSelectedDateChange={handleSelect}
          />
          {/* Same footer action as TaskDatePicker's, labelled "Clear" with a dismiss icon — it empties the value, nothing is deleted. */}
          <Button
            className="property-date-picker__clear"
            variant="ghost"
            interaction="subtle"
            size="small"
            leading={<AppIcon icon="dismiss" />}
            disabled={value === null}
            onClick={handleClear}
          >
            Clear
          </Button>
        </div>
      </Overlay>
    </>
  );
}
