// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PropertyList } from './PropertyList';
import { TextPropertyValue } from './TextPropertyValue';

afterEach(() => {
  cleanup();
});

function getField(): HTMLTextAreaElement {
  return screen.getByRole('textbox', { name: 'Description' }) as HTMLTextAreaElement;
}

describe('TextPropertyValue', () => {
  it('renders the existing value in a multiline textarea', () => {
    render(
      <TextPropertyValue name="Description" value={'line one\nline two'} onCommit={() => {}} />
    );

    const field = getField();
    expect(field.tagName).toBe('TEXTAREA');
    expect(field.value).toBe('line one\nline two');
  });

  it('commits a changed multi-line value on blur', () => {
    const onCommit = vi.fn();
    render(<TextPropertyValue name="Description" value="before" onCommit={onCommit} />);

    const field = getField();
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: 'first paragraph\n\nsecond paragraph' } });
    fireEvent.blur(field);

    expect(onCommit).toHaveBeenCalledExactlyOnceWith('first paragraph\n\nsecond paragraph');
  });

  it('does not commit or blur on Enter — Enter is a newline, not submit', () => {
    const onCommit = vi.fn();
    render(<TextPropertyValue name="Description" value="before" onCommit={onCommit} />);

    const field = getField();
    field.focus();
    fireEvent.change(field, { target: { value: 'after' } });
    const notCancelled = fireEvent.keyDown(field, { key: 'Enter' });

    expect(notCancelled).toBe(true);
    expect(document.activeElement).toBe(field);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('does not commit an unchanged value on blur', () => {
    const onCommit = vi.fn();
    render(<TextPropertyValue name="Description" value="same" onCommit={onCommit} />);

    const field = getField();
    fireEvent.focus(field);
    fireEvent.blur(field);

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('reverts on Escape without committing', () => {
    const onCommit = vi.fn();
    render(<TextPropertyValue name="Description" value="original" onCommit={onCommit} />);

    const field = getField();
    field.focus();
    fireEvent.change(field, { target: { value: 'discarded' } });
    fireEvent.keyDown(field, { key: 'Escape' });

    expect(onCommit).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(field);
    expect(field.value).toBe('original');
  });

  it('follows a new committed value while not editing', () => {
    const { rerender } = render(
      <TextPropertyValue name="Description" value="v1" onCommit={() => {}} />
    );

    rerender(<TextPropertyValue name="Description" value="v2" onCommit={() => {}} />);

    expect(getField().value).toBe('v2');
  });
});

describe('PropertyList text value', () => {
  it('renders an editable text Property through TextPropertyValue', () => {
    render(
      <PropertyList
        items={[{ name: 'Description', type: 'text', value: 'hello', onCommit: () => {} }]}
      />
    );

    expect(getField().tagName).toBe('TEXTAREA');
    expect(screen.getByText('Description')).toBeTruthy();
  });

  it('renders a text Property without onCommit as read-only text', () => {
    render(<PropertyList items={[{ name: 'Created', type: 'text', value: 'Oct 1, 2026' }]} />);

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Oct 1, 2026')).toBeTruthy();
  });
});
