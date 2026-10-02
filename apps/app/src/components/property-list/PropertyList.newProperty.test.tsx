// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PropertyList } from './PropertyList';
import type { PropertyListItem } from './PropertyList.types';

afterEach(() => cleanup());

const nameField = () => document.querySelector('.property-list__name .editable-text') as HTMLDivElement;

function type(text: string) {
  const field = nameField();
  field.textContent = text;
  fireEvent.input(field);
  return field;
}

/** A not-yet-named custom property row, as the adapter builds it. */
function renderNew({
  onRename = vi.fn(() => true),
  onAbandon = vi.fn(),
}: { onRename?: (name: string) => boolean; onAbandon?: () => void } = {}) {
  const items: PropertyListItem[] = [
    { name: 'Tags', type: 'tag', value: [], editable: false },
    { name: '', type: 'date', value: null, editable: false, onRename, onAbandon },
  ];
  render(<PropertyList items={items} />);
  return { onRename, onAbandon };
}

describe('PropertyList — a not-yet-named property row', () => {
  it('focuses its name field as soon as it appears, so the name can be typed without a click', () => {
    renderNew();

    expect(document.activeElement).toBe(nameField());
    expect(nameField().getAttribute('data-placeholder')).toBe('Property name');
    expect(nameField().textContent).toBe('');
  });

  it('a system name beside it stays plain text', () => {
    renderNew();
    expect(document.querySelectorAll('.property-list__name .editable-text')).toHaveLength(1);
  });

  it('Enter with a valid name commits it once and does not abandon the row', () => {
    const { onRename, onAbandon } = renderNew();

    fireEvent.keyDown(type('Due date'), { key: 'Enter' });

    expect(onRename).toHaveBeenCalledExactlyOnceWith('Due date');
    expect(onAbandon).not.toHaveBeenCalled();
  });

  it('blur with a valid name commits it and does not abandon the row', () => {
    const { onRename, onAbandon } = renderNew();

    const field = type('Due date');
    act(() => field.blur());

    expect(onRename).toHaveBeenCalledExactlyOnceWith('Due date');
    expect(onAbandon).not.toHaveBeenCalled();
  });

  it('leaving the name empty and moving focus away abandons the row', () => {
    const { onRename, onAbandon } = renderNew();

    act(() => nameField().blur());

    expect(onRename).not.toHaveBeenCalled();
    expect(onAbandon).toHaveBeenCalledOnce();
  });

  it('whitespace-only text is rejected by the host and the row is abandoned when focus leaves', () => {
    const onRename = vi.fn((name: string) => name.trim() !== '');
    const onAbandon = vi.fn();
    renderNew({ onRename, onAbandon });

    act(() => type('   ').blur());

    expect(onRename).toHaveBeenCalledWith('   ');
    expect(onAbandon).toHaveBeenCalledOnce();
  });

  it('Escape abandons the row without committing anything, even after typing', () => {
    const { onRename, onAbandon } = renderNew();

    fireEvent.keyDown(type('half typed'), { key: 'Escape' });

    expect(onRename).not.toHaveBeenCalled();
    expect(onAbandon).toHaveBeenCalledOnce();
  });

  it('a rejected name on Enter keeps the field open (no abandon), and abandons when focus then leaves', () => {
    const onRename = vi.fn(() => false);
    const onAbandon = vi.fn();
    renderNew({ onRename, onAbandon });

    const field = type('priority');
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(onRename).toHaveBeenCalledWith('priority');
    expect(onAbandon).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(field);
    expect(field.textContent).toBe('priority');

    act(() => field.blur());
    expect(onAbandon).toHaveBeenCalledOnce();
  });

  it('an existing renamable row never abandons: it has no onAbandon', () => {
    const onRename = vi.fn(() => true);
    render(
      <PropertyList items={[{ name: 'priority', type: 'text', value: 'high', editable: false, onRename }]} />
    );

    expect(document.activeElement).not.toBe(nameField());
    act(() => nameField().blur());
    expect(onRename).not.toHaveBeenCalled();
  });
});
