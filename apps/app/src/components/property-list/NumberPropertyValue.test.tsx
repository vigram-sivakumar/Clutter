// @vitest-environment jsdom

import { act, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SHAKE_DURATION_MS } from '@components/editable-text/EditableText';

import {
  NumberPropertyValue,
  formatNumberPropertyValue,
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
