// @vitest-environment jsdom

import { act, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SHAKE_DURATION_MS } from '@components/editable-text/EditableText';

import {
  NumberPropertyValue,
  formatNumberPropertyValue,
  numberPropertyEditText,
  parseNumberPropertyInput,
} from './NumberPropertyValue';
import { PropertyList } from './PropertyList';
import { propertyTypeRegistry } from './propertyTypeRegistry';

afterEach(() => cleanup());

function getField(): HTMLInputElement {
  return screen.getByRole('textbox', { name: 'Count' }) as HTMLInputElement;
}

function type(text: string) {
  fireEvent.change(getField(), { target: { value: text } });
}

function isShaking(): boolean {
  return getField().parentElement!.classList.contains('editable-text--shake');
}

function Stateful({ initial }: { initial: number | null }) {
  const [value, setValue] = useState(initial);
  return <NumberPropertyValue name="Count" value={value} editable onCommit={setValue} />;
}

describe('parseNumberPropertyInput', () => {
  it.each([
    ['42', 42],
    ['-7', -7],
    ['+3', 3],
    ['0', 0],
    ['3.14', 3.14],
    ['.5', 0.5],
    ['5.', 5],
    ['1e3', 1000],
    ['-2.5E-2', -0.025],
    ['  12  ', 12],
  ])('accepts %s as %s', (text, expected) => {
    expect(parseNumberPropertyInput(text)).toBe(expected);
  });

  it.each(['', '   ', 'abc', '12abc', '1.2.3', '1,234', '0x1f', 'Infinity', 'NaN', '-', '.', 'e5', '1e', '1e999'])(
    'rejects %j',
    (text) => {
      expect(parseNumberPropertyInput(text)).toBeNull();
    }
  );
});

describe('NumberPropertyValue — read-only', () => {
  it('shows the formatted number as non-editable text', () => {
    render(<NumberPropertyValue name="Count" value={1234.5} editable={false} />);

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText(formatNumberPropertyValue(1234.5))).toBeTruthy();
  });

  it('shows nothing for an absent value', () => {
    const { container } = render(<NumberPropertyValue name="Count" value={null} editable={false} />);

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(container.textContent).toBe('');
  });
});

describe('NumberPropertyValue — editable', () => {
  it('renders the existing single-line Input, formatted at rest and raw while editing', () => {
    render(<NumberPropertyValue name="Count" value={1234.5} editable onCommit={() => {}} />);

    const field = getField();
    expect(field.tagName).toBe('INPUT');
    expect(field.inputMode).toBe('decimal');
    expect(field.parentElement!.classList.contains('input')).toBe(true);
    expect(field.value).toBe(formatNumberPropertyValue(1234.5));

    fireEvent.focus(field);
    expect(field.value).toBe('1234.5');
  });

  it('commits a valid number as a number on Enter', () => {
    const onCommit = vi.fn();
    render(<NumberPropertyValue name="Count" value={1} editable onCommit={onCommit} />);

    fireEvent.focus(getField());
    type(' 42.5 ');
    fireEvent.keyDown(getField(), { key: 'Enter' });

    expect(onCommit).toHaveBeenCalledExactlyOnceWith(42.5);
  });

  it('commits a valid number on blur', () => {
    const onCommit = vi.fn();
    render(<NumberPropertyValue name="Count" value={null} editable onCommit={onCommit} />);

    fireEvent.focus(getField());
    type('-3');
    fireEvent.blur(getField());

    expect(onCommit).toHaveBeenCalledExactlyOnceWith(-3);
  });

  it('does not commit an unchanged number', () => {
    const onCommit = vi.fn();
    render(<NumberPropertyValue name="Count" value={5} editable onCommit={onCommit} />);

    fireEvent.focus(getField());
    type('5.0');
    fireEvent.blur(getField());

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('clears the value when the text is emptied', () => {
    const onCommit = vi.fn();
    render(<NumberPropertyValue name="Count" value={5} editable onCommit={onCommit} />);

    fireEvent.focus(getField());
    type('');
    fireEvent.blur(getField());

    expect(onCommit).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('Enter on invalid input keeps the text and focus, shakes, and does not commit', () => {
    vi.useFakeTimers();
    try {
      const onCommit = vi.fn();
      render(<NumberPropertyValue name="Count" value={5} editable onCommit={onCommit} />);

      const field = getField();
      field.focus();
      fireEvent.focus(field);
      type('12abc');
      fireEvent.keyDown(field, { key: 'Enter' });

      expect(onCommit).not.toHaveBeenCalled();
      expect(field.value).toBe('12abc');
      expect(document.activeElement).toBe(field);
      expect(isShaking()).toBe(true);

      act(() => {
        vi.advanceTimersByTime(SHAKE_DURATION_MS);
      });
      expect(isShaking()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('blur with invalid input discards it and restores the last valid value', () => {
    const onCommit = vi.fn();
    render(<NumberPropertyValue name="Count" value={7} editable onCommit={onCommit} />);

    fireEvent.focus(getField());
    type('seven');
    fireEvent.blur(getField());

    expect(onCommit).not.toHaveBeenCalled();
    expect(getField().value).toBe(formatNumberPropertyValue(7));
  });

  it('keeps the committed value numeric across edits', () => {
    render(<Stateful initial={null} />);

    fireEvent.focus(getField());
    type('1e3');
    fireEvent.keyDown(getField(), { key: 'Enter' });
    fireEvent.blur(getField());

    expect(getField().value).toBe(formatNumberPropertyValue(1000));
    fireEvent.focus(getField());
    expect(getField().value).toBe('1000');
  });
});

describe('PropertyList number value', () => {
  it('uses the Hash icon for the number type', () => {
    expect(propertyTypeRegistry.number.icon).toBe('hash');
  });

  it('renders an editable number Property through NumberPropertyValue', () => {
    render(
      <PropertyList
        items={[{ name: 'Count', type: 'number', value: 3, editable: true, onCommit: () => {} }]}
      />
    );

    expect(getField().value).toBe('3');
    expect(screen.getByText('Count')).toBeTruthy();
  });

  it('renders a read-only number Property as formatted text', () => {
    render(<PropertyList items={[{ name: 'Count', type: 'number', value: 9876543, editable: false }]} />);

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText(formatNumberPropertyValue(9876543))).toBeTruthy();
  });
});

const LARGE = 7.573837658392029e23; // String(LARGE) is "7.573837658392029e+23"

describe('numberPropertyEditText', () => {
  it.each([
    [42, '42'],
    [-7, '-7'],
    [0, '0'],
    [1234567, '1234567'],
    [1234.5, '1234.5'],
    [-0.025, '-0.025'],
    [Number.MAX_SAFE_INTEGER, '9007199254740991'],
  ])('leaves an ordinary number as String does: %s', (value, expected) => {
    expect(numberPropertyEditText(value)).toBe(expected);
  });

  it.each([
    [LARGE, '757383765839202900000000'],
    [1e21, '1000000000000000000000'],
    [-1.5e22, '-15000000000000000000000'],
    [1e-7, '0.0000001'],
    [1.5e-7, '0.00000015'],
    [-2.5e-9, '-0.0000000025'],
  ])('writes the exponent of String(%s) out as plain digits', (value, expected) => {
    expect(String(value)).toContain('e');
    expect(numberPropertyEditText(value)).toBe(expected);
  });

  it.each([42, 1234.5, -0.025, Number.MAX_SAFE_INTEGER, LARGE, 1e21, 1.7976931348623157e308, -1.5e22, 1e-7, 5e-324, Math.PI * 1e30])(
    'reads back as the identical number (no extra precision loss): %s',
    (value) => {
      const text = numberPropertyEditText(value);

      expect(text).not.toMatch(/e/i);
      expect(parseNumberPropertyInput(text)).toBe(value);
    }
  );
});

describe('formatNumberPropertyValue — locale-aware display', () => {
  it('follows the locale it is given: Indian and US grouping', () => {
    expect(formatNumberPropertyValue(1234567, 'en-IN')).toBe('12,34,567');
    expect(formatNumberPropertyValue(1234567, 'en-US')).toBe('1,234,567');
    expect(formatNumberPropertyValue(1234.5, 'en-US')).toBe('1,234.5');
  });

  it('shows a large number as grouped digits, never an exponent', () => {
    expect(formatNumberPropertyValue(LARGE, 'en-IN')).toBe('7,57,38,37,65,83,92,02,90,00,00,000');
    expect(formatNumberPropertyValue(LARGE, 'en-US')).toBe('757,383,765,839,202,900,000,000');
  });

  it('defaults to the system locale', () => {
    expect(formatNumberPropertyValue(1234567)).toBe(new Intl.NumberFormat(undefined, { maximumFractionDigits: 20 }).format(1234567));
  });
});

describe('NumberPropertyValue — large numbers', () => {
  it('shows the grouped value at rest and a plain decimal, not an exponent, on focus', () => {
    render(<NumberPropertyValue name="Count" value={LARGE} editable onCommit={() => {}} />);

    expect(getField().value).toBe(formatNumberPropertyValue(LARGE));
    expect(getField().value).not.toMatch(/e/i);

    fireEvent.focus(getField());
    expect(getField().value).toBe('757383765839202900000000');
  });

  it('display and editing text are separate representations', () => {
    render(<NumberPropertyValue name="Count" value={1234567} editable onCommit={() => {}} />);

    const resting = getField().value;
    fireEvent.focus(getField());

    expect(resting).toBe(formatNumberPropertyValue(1234567));
    expect(getField().value).toBe('1234567');
  });

  it('focusing and committing without a change does not commit (or alter) the value', () => {
    const onCommit = vi.fn();
    render(<NumberPropertyValue name="Count" value={LARGE} editable onCommit={onCommit} />);

    fireEvent.focus(getField());
    fireEvent.keyDown(getField(), { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.focus(getField());
    fireEvent.blur(getField());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('re-committing the focused text yields the identical number', () => {
    const onCommit = vi.fn();
    render(<NumberPropertyValue name="Count" value={LARGE} editable onCommit={onCommit} />);

    fireEvent.focus(getField());
    // The user touches the field and types the same digits back.
    type(getField().value);
    fireEvent.keyDown(getField(), { key: 'Enter' });

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('still rejects text the parser rejects, such as the grouped display text', () => {
    const onCommit = vi.fn();
    render(<NumberPropertyValue name="Count" value={LARGE} editable onCommit={onCommit} />);

    fireEvent.focus(getField());
    type(formatNumberPropertyValue(LARGE, 'en-IN'));
    fireEvent.blur(getField());

    expect(onCommit).not.toHaveBeenCalled();
  });
});
