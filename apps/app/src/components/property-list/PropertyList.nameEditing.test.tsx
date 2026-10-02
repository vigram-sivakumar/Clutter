// @vitest-environment jsdom

import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PropertyList } from './PropertyList';
import type { PropertyListItem } from './PropertyList.types';

afterEach(() => cleanup());


/** Types into the contentEditable name field the way EditableText reads it. */
function typeName(text: string) {
  const field = document.querySelector('.property-list__name .editable-text') as HTMLDivElement;
  act(() => field.focus());
  field.textContent = text;
  fireEvent.input(field);
  return field;
}

function Renamable({ onRename }: { onRename: (name: string) => boolean }) {
  const [name, setName] = useState('priority');
  const items: PropertyListItem[] = [
    { name: 'Tags', type: 'tag', value: ['a'], editable: false },
    {
      name,
      type: 'text',
      value: 'high',
      editable: false,
      onRename: (next) => {
        const accepted = onRename(next);
        if (accepted) setName(next);
        return accepted;
      },
    },
  ];
  return <PropertyList items={items} />;
}

describe('PropertyList — editable custom property names', () => {
  it('renders a custom name as inline-editable text and a system name as plain text', () => {
    render(<Renamable onRename={() => true} />);

    const editable = document.querySelector('.property-list__name .editable-text');
    expect(editable?.textContent).toBe('priority');
    expect(editable?.getAttribute('contenteditable')).toBe('true');
    // The system Tags name: plain text, no editor.
    expect(screen.getByText('Tags').closest('.editable-text')).toBeNull();
    expect(document.querySelectorAll('.property-list__name .editable-text')).toHaveLength(1);
  });

  it('Enter commits the new name; the value is unchanged', () => {
    const onRename = vi.fn(() => true);
    render(<Renamable onRename={onRename} />);

    const field = typeName('importance');
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(onRename).toHaveBeenCalledExactlyOnceWith('importance');
    expect(document.querySelector('.property-list__name .editable-text')?.textContent).toBe('importance');
    expect(screen.getByText('high')).toBeTruthy();
  });

  it('blur commits the rename', () => {
    const onRename = vi.fn(() => true);
    render(<Renamable onRename={onRename} />);

    const field = typeName('importance');
    act(() => field.blur());

    expect(onRename).toHaveBeenCalledExactlyOnceWith('importance');
  });

  it('Escape cancels and restores the previous name', () => {
    const onRename = vi.fn(() => true);
    render(<Renamable onRename={onRename} />);

    const field = typeName('discarded');
    fireEvent.keyDown(field, { key: 'Escape' });

    expect(onRename).not.toHaveBeenCalled();
    expect(field.textContent).toBe('priority');
  });

  it('a rejected name on Enter keeps editing with the reject shake; on blur it restores', () => {
    const onRename = vi.fn(() => false);
    render(<Renamable onRename={onRename} />);

    const field = typeName('Tags');
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(field.textContent).toBe('Tags');
    expect(field.classList.contains('editable-text--shake')).toBe(true);

    act(() => field.blur());
    expect(field.textContent).toBe('priority');
  });
});
