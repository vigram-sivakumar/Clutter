// @vitest-environment jsdom

import { act, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { DatePropertyValue } from './DatePropertyValue';
import { PropertyList } from './PropertyList';
import { formatDatePropertyEditValue, formatDatePropertyValue } from './formatDatePropertyValue';

// Overlay positions itself with a ResizeObserver, which jsdom lacks —
// same local stub as Overlay.test.tsx.
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
});

function getField(): HTMLInputElement {
  return screen.getByRole('textbox', { name: 'Due' }) as HTMLInputElement;
}

function getDay(day: number): HTMLElement {
  // In-month cells only — the month grid also shows neighboring months' days.
  const cells = [...document.querySelectorAll<HTMLElement>('.calendar-cell')].filter(
    (cell) =>
      !cell.classList.contains('calendar-cell--outside-month') && cell.textContent === String(day)
  );
  expect(cells).toHaveLength(1);
  return cells[0]!;
}

function calendarMonthYear(): string {
  const month = document.querySelector('.property-date-picker .calendar-month')?.textContent;
  const year = document.querySelector('.property-date-picker .calendar-year')?.textContent;
  return `${month} ${year}`;
}

function selectedDay(): string | null {
  return document.querySelector('.property-date-picker .calendar-cell--selected')?.textContent ?? null;
}

function type(text: string) {
  fireEvent.change(getField(), { target: { value: text } });
}

function isCalendarOpen(): boolean {
  return document.querySelector('.property-date-picker') !== null;
}

/** Holds the value in state the way a real adapter would, so a commit flows back into the field. */
function StatefulDate({ initial }: { initial: string | null }) {
  const [value, setValue] = useState(initial);
  return (
    <DatePropertyValue
      name="Due"
      value={value}
      format={formatDatePropertyValue}
        editFormat={formatDatePropertyEditValue}
      editable
      onCommit={setValue}
    />
  );
}

describe('DatePropertyValue — read-only', () => {
  it('renders the formatted value as plain text, with no input and no calendar', () => {
    render(
      <DatePropertyValue
        name="Due"
        value="2025-09-15"
        format={formatDatePropertyValue}
        editFormat={formatDatePropertyEditValue}
        editable={false}
      />
    );

    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByText('15 Sep 2025'));
    expect(isCalendarOpen()).toBe(false);
  });
});

describe('DatePropertyValue — editable', () => {
  it('displays the current value in a single-line input as DD.MM.YYYY via the edit format helper', () => {
    render(<StatefulDate initial="2025-09-15" />);

    const field = getField();
    expect(field.tagName).toBe('INPUT');
    expect(field.value).toBe(formatDatePropertyEditValue('2025-09-15'));
    expect(field.value).toBe('15.09.2025');
    expect(isCalendarOpen()).toBe(false);
  });

  it('opens the calendar overlay on click, initialized to the current date', () => {
    render(<StatefulDate initial="2025-09-15" />);

    fireEvent.click(getField());

    expect(isCalendarOpen()).toBe(true);
    expect(getDay(15).getAttribute('aria-selected')).toBe('true');
  });

  it('opens the calendar overlay on focus', () => {
    render(<StatefulDate initial="2025-09-15" />);

    fireEvent.focus(getField());

    expect(isCalendarOpen()).toBe(true);
  });

  it('commits the selected day as YYYY-MM-DD and closes the calendar', () => {
    const onCommit = vi.fn();
    render(
      <DatePropertyValue
        name="Due"
        value="2025-09-15"
        format={formatDatePropertyValue}
        editFormat={formatDatePropertyEditValue}
        editable
        onCommit={onCommit}
      />
    );

    fireEvent.click(getField());
    fireEvent.click(getDay(20));

    expect(onCommit).toHaveBeenCalledExactlyOnceWith('2025-09-20');
    expect(isCalendarOpen()).toBe(false);
  });

  it('reflects the selected date in the input', () => {
    render(<StatefulDate initial="2025-09-15" />);

    fireEvent.click(getField());
    fireEvent.click(getDay(20));

    expect(getField().value).toBe('20.09.2025');
  });

  it('does not reopen the calendar when focus returns to the input after selecting', () => {
    render(<StatefulDate initial="2025-09-15" />);

    fireEvent.click(getField());
    fireEvent.click(getDay(20));

    // Overlay has handed focus back to the input — that focus must not reopen it.
    expect(document.activeElement).toBe(getField());
    expect(isCalendarOpen()).toBe(false);
  });

  it('shows the "Empty" placeholder when there is no value', () => {
    render(
      <DatePropertyValue
        name="Due"
        value={null}
        format={formatDatePropertyValue}
        editFormat={formatDatePropertyEditValue}
        editable
        onCommit={() => {}}
      />
    );

    expect(getField().value).toBe('');
    expect(getField().placeholder).toBe('Empty');
  });

  it('leaves an empty date empty when opened, with the calendar on the current month', () => {
    const onCommit = vi.fn();
    render(
      <DatePropertyValue
        name="Due"
        value={null}
        format={formatDatePropertyValue}
        editFormat={formatDatePropertyEditValue}
        editable
        onCommit={onCommit}
      />
    );

    fireEvent.click(getField());

    const today = new Date();
    expect(getField().value).toBe('');
    expect(onCommit).not.toHaveBeenCalled();
    expect(isCalendarOpen()).toBe(true);
    expect(selectedDay()).toBeNull();
    expect(calendarMonthYear()).toBe(
      `${today.toLocaleString('en', { month: 'long' })} ${today.getFullYear()}`
    );
  });
});

describe('DatePropertyValue — typing', () => {
  it('keeps incomplete input exactly as typed and commits nothing', () => {
    const onCommit = vi.fn();
    render(
      <DatePropertyValue
        name="Due"
        value="2025-09-15"
        format={formatDatePropertyValue}
        editFormat={formatDatePropertyEditValue}
        editable
        onCommit={onCommit}
      />
    );

    fireEvent.click(getField());
    for (const text of ['1', '1/', '1/1', '1/1/']) {
      type(text);
      expect(getField().value).toBe(text);
    }

    expect(onCommit).not.toHaveBeenCalled();
    expect(calendarMonthYear()).toBe('September 2025');
    expect(selectedDay()).toBe('15');
  });

  it('does not reset invalid input while typing', () => {
    render(<StatefulDate initial="2025-09-15" />);

    fireEvent.click(getField());
    type('31/9/2026');

    expect(getField().value).toBe('31/9/2026');
    expect(calendarMonthYear()).toBe('September 2025');
    expect(selectedDay()).toBe('15');
  });

  it('commits a valid typed date and moves the calendar to it, without rewriting the text', () => {
    const onCommit = vi.fn();
    render(
      <DatePropertyValue
        name="Due"
        value="2025-09-15"
        format={formatDatePropertyValue}
        editFormat={formatDatePropertyEditValue}
        editable
        onCommit={onCommit}
      />
    );

    fireEvent.click(getField());
    type('1/1/2026');

    expect(onCommit).toHaveBeenLastCalledWith('2026-01-01');
    expect(getField().value).toBe('1/1/2026');
  });

  it('syncs the calendar month/year and selection to each valid typed date', () => {
    render(<StatefulDate initial="2025-09-15" />);

    fireEvent.click(getField());
    type('1/1/2026');
    expect(calendarMonthYear()).toBe('January 2026');
    expect(selectedDay()).toBe('1');

    type('15.03.2027');
    expect(calendarMonthYear()).toBe('March 2027');
    expect(selectedDay()).toBe('15');

    type('20 Sep 2026');
    expect(calendarMonthYear()).toBe('September 2026');
    expect(selectedDay()).toBe('20');
  });

  it('interprets a two-digit year with the POSIX rule', () => {
    render(<StatefulDate initial="2025-09-15" />);

    fireEvent.click(getField());
    type('1/1/29');

    expect(calendarMonthYear()).toBe('January 2029');
  });

  it('normalizes any typed form to DD.MM.YYYY once editing ends', () => {
    render(<StatefulDate initial="2025-09-15" />);

    fireEvent.click(getField());
    type('1-9-2026');
    fireEvent.blur(getField());
    expect(getField().value).toBe('01.09.2026');

    fireEvent.click(getField());
    type('15 September 2026');
    fireEvent.blur(getField());
    expect(getField().value).toBe('15.09.2026');
  });

  it('reverts a still-invalid draft to the formatted value on blur', () => {
    render(<StatefulDate initial="2025-09-15" />);

    fireEvent.click(getField());
    type('1/1/');
    fireEvent.blur(getField());

    expect(getField().value).toBe('15.09.2025');
  });

  it('keeps input and calendar in sync across typing then picking', () => {
    render(<StatefulDate initial="2025-09-15" />);

    fireEvent.click(getField());
    type('1/1/2026');
    fireEvent.click(getDay(20));

    expect(getField().value).toBe('20.01.2026');

    fireEvent.click(getField());
    expect(calendarMonthYear()).toBe('January 2026');
    expect(selectedDay()).toBe('20');
  });
});

describe('DatePropertyValue — Clear', () => {
  it('shows a "Clear" action under the calendar', () => {
    render(<StatefulDate initial="2025-09-15" />);

    fireEvent.click(getField());

    expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy();
  });

  it('clears the value: commits null and keeps the calendar open', () => {
    const onCommit = vi.fn();
    render(
      <DatePropertyValue
        name="Due"
        value="2025-09-15"
        format={formatDatePropertyValue}
        editFormat={formatDatePropertyEditValue}
        editable
        onCommit={onCommit}
      />
    );

    fireEvent.click(getField());
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onCommit).toHaveBeenCalledExactlyOnceWith(null);
    expect(isCalendarOpen()).toBe(true);
  });

  it('empties the input and the calendar selection, leaving the month in view', () => {
    render(<StatefulDate initial="2025-09-15" />);

    fireEvent.click(getField());
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(getField().value).toBe('');
    expect(getField().placeholder).toBe('Empty');
    expect(selectedDay()).toBeNull();
    expect(calendarMonthYear()).toBe('September 2025');
  });

  it('lets a new date be picked straight after clearing', () => {
    render(<StatefulDate initial="2025-09-15" />);

    fireEvent.click(getField());
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    fireEvent.click(getDay(20));

    expect(getField().value).toBe('20.09.2025');
  });

  it('shows the dismiss icon on the Clear button', () => {
    render(<StatefulDate initial="2025-09-15" />);

    fireEvent.click(getField());

    const clear = screen.getByRole('button', { name: 'Clear' });
    expect(clear.classList.contains('button--has-leading')).toBe(true);
    expect(clear.querySelector('svg')).not.toBeNull();
  });

  it('also discards a typed draft', () => {
    render(<StatefulDate initial="2025-09-15" />);

    fireEvent.click(getField());
    type('1/1/');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(getField().value).toBe('');
  });

  it('is disabled when there is no date', () => {
    render(<StatefulDate initial={null} />);

    fireEvent.click(getField());

    expect((screen.getByRole('button', { name: 'Clear' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('DatePropertyValue — calendar dismissal', () => {
  it('keeps focus in the input when pressing inside the calendar', () => {
    render(<StatefulDate initial="2025-09-15" />);

    act(() => getField().focus());
    const notCancelled = fireEvent.mouseDown(document.querySelector('.property-date-picker')!);

    expect(notCancelled).toBe(false);
    expect(isCalendarOpen()).toBe(true);
  });

  it('closes the calendar when the input loses focus, without pulling focus back', () => {
    render(
      <>
        <StatefulDate initial="2025-09-15" />
        <button type="button">elsewhere</button>
      </>
    );

    act(() => getField().focus());
    expect(isCalendarOpen()).toBe(true);

    const elsewhere = screen.getByRole('button', { name: 'elsewhere' });
    act(() => elsewhere.focus());

    expect(isCalendarOpen()).toBe(false);
    expect(document.activeElement).toBe(elsewhere);
  });
});

describe('PropertyList date Property', () => {
  it('renders a read-only date Property (like Created) as formatted text', () => {
    render(
      <PropertyList items={[{ name: 'Created', type: 'date', value: '2025-09-15', editable: false }]} />
    );

    expect(screen.getByText('15 Sep 2025')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('renders an editable date Property through the same component as an input', () => {
    render(
      <PropertyList
        items={[
          { name: 'Due', type: 'date', value: '2025-09-15', editable: true, onCommit: () => {} },
        ]}
      />
    );

    expect(getField().value).toBe('15.09.2025');
  });
});
