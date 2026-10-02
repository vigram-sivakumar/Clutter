// @vitest-environment jsdom

import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { MultiSelectPropertyValue } from './MultiSelectPropertyValue';
import { PropertyList } from './PropertyList';
import type { MultiSelectSuggestion } from './PropertyList.types';

// Overlay (the suggestion popover) positions itself with a ResizeObserver,
// which jsdom lacks — same local stub as TagPropertyValue.test.tsx.
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

afterEach(() => cleanup());

const field = () => screen.getByRole('textbox', { name: 'Aliases' }) as HTMLInputElement;

function type(text: string) {
  fireEvent.focus(field());
  fireEvent.change(field(), { target: { value: text } });
}

function Stateful({
  initial,
  getSuggestions,
}: {
  initial: string[];
  getSuggestions?(query: string): readonly MultiSelectSuggestion[];
}) {
  const [value, setValue] = useState(initial);
  return (
    <MultiSelectPropertyValue
      name="Aliases"
      value={value}
      getSuggestions={getSuggestions}
      editable
      onCommit={setValue}
    />
  );
}

const pills = () =>
  Array.from(document.querySelectorAll('.property-list__tag')).map((pill) => pill.textContent);

describe('MultiSelectPropertyValue — read-only', () => {
  it('renders each value as a pill, with no input or remove buttons', () => {
    render(<MultiSelectPropertyValue name="Aliases" value={['UX', 'User experience']} editable={false} />);

    expect(pills()).toEqual(['UX', 'User experience']);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('MultiSelectPropertyValue — read-only, dismissable', () => {
  it('with onRemoveValue, each pill has a dismiss button removing that item — and no input', () => {
    const onRemoveValue = vi.fn();
    render(
      <MultiSelectPropertyValue name="people" value={['Ana', 'Bo']} editable={false} onRemoveValue={onRemoveValue} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove Bo' }));

    expect(onRemoveValue).toHaveBeenCalledExactlyOnceWith(1, 'Bo');
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('MultiSelectPropertyValue — editable', () => {
  it('Enter adds the typed text as a pill — spaces included — and clears the input', () => {
    const onCommit = vi.fn();
    render(<MultiSelectPropertyValue name="Aliases" value={['UX']} editable onCommit={onCommit} />);

    type('  User experience  ');
    fireEvent.keyDown(field(), { key: ' ' });
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(['UX', 'User experience']);
    expect(field().value).toBe('');
  });

  it('adds several values in a row', () => {
    render(<Stateful initial={[]} />);

    type('One');
    fireEvent.keyDown(field(), { key: 'Enter' });
    type('Two');
    fireEvent.keyDown(field(), { key: 'Enter' });

    expect(pills()).toEqual(['One', 'Two']);
  });

  it('leaving the field adds the pending text', () => {
    const onCommit = vi.fn();
    render(<MultiSelectPropertyValue name="Aliases" value={[]} editable onCommit={onCommit} />);

    type('Pending');
    fireEvent.blur(field());

    expect(onCommit).toHaveBeenCalledExactlyOnceWith(['Pending']);
  });

  it('ignores whitespace-only text and a value already present (ignoring case), with no error', () => {
    const onCommit = vi.fn();
    render(<MultiSelectPropertyValue name="Aliases" value={['UX']} editable onCommit={onCommit} />);

    type('   ');
    fireEvent.keyDown(field(), { key: 'Enter' });
    type('ux');
    fireEvent.keyDown(field(), { key: 'Enter' });

    expect(onCommit).not.toHaveBeenCalled();
    expect(field().value).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it("removes a value with its pill's dismiss button, and the last one with Backspace in an empty input", () => {
    render(<Stateful initial={['One', 'Two', 'Three']} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Two' }));
    expect(pills()).toEqual(['One', 'Three']);

    fireEvent.keyDown(field(), { key: 'Backspace' });
    expect(pills()).toEqual(['One']);
  });

  describe('editing a pill in place', () => {
    const editField = (value: string) =>
      screen.getByRole('textbox', { name: `Edit ${value}` }) as HTMLInputElement;

    it('a click on a pill swaps it for an input holding its text, focused', () => {
      render(<Stateful initial={['UX', 'Design System']} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit UX' }));

      expect(editField('UX').value).toBe('UX');
      expect(document.activeElement).toBe(editField('UX'));
      expect(pills()).toEqual(['', 'Design System']);
    });

    it('Enter commits the edit in place, keeping the order', () => {
      const onCommit = vi.fn();
      render(
        <MultiSelectPropertyValue
          name="Aliases"
          value={['UX', 'Design System']}
          editable
          onCommit={onCommit}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Edit UX' }));
      fireEvent.change(editField('UX'), { target: { value: ' User Experience ' } });
      fireEvent.keyDown(editField('UX'), { key: 'Enter' });

      expect(onCommit).toHaveBeenCalledExactlyOnceWith(['User Experience', 'Design System']);
    });

    it('blur commits the edit', () => {
      render(<Stateful initial={['UX', 'Design System']} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit UX' }));
      fireEvent.change(editField('UX'), { target: { value: 'User Experience' } });
      fireEvent.blur(editField('UX'));

      expect(pills()).toEqual(['User Experience', 'Design System']);
    });

    it('Escape cancels and restores the previous value, committing nothing', () => {
      const onCommit = vi.fn();
      render(<MultiSelectPropertyValue name="Aliases" value={['UX']} editable onCommit={onCommit} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit UX' }));
      fireEvent.change(editField('UX'), { target: { value: 'Discarded' } });
      fireEvent.keyDown(editField('UX'), { key: 'Escape' });

      expect(onCommit).not.toHaveBeenCalled();
      expect(pills()).toEqual(['UX']);
      expect(screen.queryByRole('textbox', { name: 'Edit UX' })).toBeNull();
    });

    it('an unchanged or emptied edit commits nothing and restores the pill', () => {
      const onCommit = vi.fn();
      render(<MultiSelectPropertyValue name="Aliases" value={['UX']} editable onCommit={onCommit} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit UX' }));
      fireEvent.keyDown(editField('UX'), { key: 'Enter' });
      fireEvent.click(screen.getByRole('button', { name: 'Edit UX' }));
      fireEvent.change(editField('UX'), { target: { value: '   ' } });
      fireEvent.blur(editField('UX'));

      expect(onCommit).not.toHaveBeenCalled();
      expect(pills()).toEqual(['UX']);
    });

    it('an edit that would repeat another value on this note: Enter keeps editing, blur restores', () => {
      const onCommit = vi.fn();
      render(
        <MultiSelectPropertyValue
          name="Aliases"
          value={['UX', 'Design System']}
          editable
          onCommit={onCommit}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Edit UX' }));
      fireEvent.change(editField('UX'), { target: { value: 'design system' } });
      fireEvent.keyDown(editField('UX'), { key: 'Enter' });
      expect(editField('UX').value).toBe('design system');

      fireEvent.blur(editField('UX'));
      expect(onCommit).not.toHaveBeenCalled();
      expect(pills()).toEqual(['UX', 'Design System']);
    });

    it('the dismiss button still removes only that value, without starting an edit', () => {
      render(<Stateful initial={['UX', 'Design System']} />);

      fireEvent.click(screen.getByRole('button', { name: 'Remove UX' }));

      expect(pills()).toEqual(['Design System']);
      expect(screen.queryByRole('textbox', { name: /^Edit/ })).toBeNull();
    });

    it('read-only pills are not editable', () => {
      render(<MultiSelectPropertyValue name="Aliases" value={['UX']} editable={false} />);
      expect(screen.queryByRole('button', { name: 'Edit UX' })).toBeNull();
    });
  });

  describe('suggestions', () => {
    const suggestions: MultiSelectSuggestion[] = [
      { key: 'g:UX', value: 'UX', label: 'UX', detail: 'User Experience Guidelines' },
      { key: 'r:', value: 'UX Research', label: 'UX Research', detail: null },
    ];
    const getSuggestions = vi.fn((query: string) =>
      suggestions.filter((row) => row.label.toLowerCase().includes(query.toLowerCase()))
    );

    it('shows matches for the typed text, with their detail', () => {
      render(<Stateful initial={[]} getSuggestions={getSuggestions} />);

      type('ux');

      expect(getSuggestions).toHaveBeenLastCalledWith('ux');
      const rows = screen.getAllByRole('menuitem');
      expect(rows.map((row) => row.textContent)).toEqual([
        'UXUser Experience Guidelines',
        'UX Research',
      ]);
    });

    it("clicking a match adds its value — the alias text, never a link", () => {
      render(<Stateful initial={[]} getSuggestions={getSuggestions} />);

      type('ux');
      fireEvent.click(screen.getAllByRole('menuitem')[0]!);

      expect(pills()).toEqual(['UX']);
    });

    it('ArrowDown then Enter adds the highlighted match; with no highlight Enter adds the typed text', () => {
      render(<Stateful initial={[]} getSuggestions={getSuggestions} />);

      type('ux');
      fireEvent.keyDown(field(), { key: 'ArrowDown' });
      fireEvent.keyDown(field(), { key: 'ArrowDown' });
      fireEvent.keyDown(field(), { key: 'Enter' });
      expect(pills()).toEqual(['UX Research']);

      type('ux r');
      fireEvent.keyDown(field(), { key: 'Enter' });
      expect(pills()).toEqual(['UX Research', 'ux r']);
    });

    it('omits matches already present', () => {
      render(<Stateful initial={['UX']} getSuggestions={getSuggestions} />);

      type('ux');

      expect(screen.getAllByRole('menuitem').map((row) => row.textContent)).toEqual(['UX Research']);
    });
  });
});

describe('PropertyList multi-select value', () => {
  it('renders an editable multi-select Property through MultiSelectPropertyValue', () => {
    render(
      <PropertyList
        items={[{ name: 'Aliases', type: 'multi-select', value: ['UX'], editable: true, onCommit: () => {} }]}
      />
    );

    expect(field()).toBeTruthy();
    expect(pills()).toEqual(['UX']);
  });
});
