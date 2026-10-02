// @vitest-environment jsdom

import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { DatePropertyValue } from './DatePropertyValue';
import { PropertyList } from './PropertyList';
import { formatDatePropertyValue } from './formatDatePropertyValue';

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

function isCalendarOpen(): boolean {
  return document.querySelector('.property-date-picker') !== null;
}

/** Holds the value in state the way a real adapter would, so a commit flows back into the field. */
function StatefulDate({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <DatePropertyValue
      name="Due"
      value={value}
      format={formatDatePropertyValue}
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
        editable={false}
      />
    );

    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByText('15 Sep 2025'));
    expect(isCalendarOpen()).toBe(false);
  });
});

describe('DatePropertyValue — editable', () => {
  it('displays the current value in a single-line input via the format helper', () => {
    render(<StatefulDate initial="2025-09-15" />);

    const field = getField();
    expect(field.tagName).toBe('INPUT');
    expect(field.value).toBe(formatDatePropertyValue('2025-09-15'));
    expect(field.value).toBe('15 Sep 2025');
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

    expect(getField().value).toBe('20 Sep 2025');
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
        editable
        onCommit={() => {}}
      />
    );

    expect(getField().value).toBe('');
    expect(getField().placeholder).toBe('Empty');
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

    expect(getField().value).toBe('15 Sep 2025');
  });
});
