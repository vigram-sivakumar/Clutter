// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { MultiSelectPropertyValue } from './MultiSelectPropertyValue';
import { TagPropertyValue } from './TagPropertyValue';

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
beforeAll(() => vi.stubGlobal('ResizeObserver', ResizeObserverMock));
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);

/**
 * Clicking an existing Tag or Alias while the field is being edited edits that item in place (no
 * navigation); otherwise a tag opens its collection. Tags and Aliases share one pill-list editor and
 * one in-place pill editor, so every case below runs against both. (An alias has nowhere to navigate,
 * so it edits on any click.)
 */
const onOpenTag = vi.fn();

function Tags({ initial }: { initial: string[] }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <TagPropertyValue name="Tags" value={value} editable onCommit={setValue} onOpenTag={onOpenTag} />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

function Aliases({ initial }: { initial: string[] }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <MultiSelectPropertyValue name="Aliases" value={value} editable onCommit={setValue} />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

const stored = () => JSON.parse(screen.getByTestId('value').textContent!) as string[];

const EDITORS = [
  { label: 'Tags', Component: Tags, initial: ['design', 'research'], first: 'design', edited: 'ux', editedValue: ['ux', 'research'] },
  { label: 'Aliases', Component: Aliases, initial: ['Design', 'Research'], first: 'Design', edited: 'UX', editedValue: ['UX', 'Research'] },
] as const;

describe.each(EDITORS)('$label: clicking an existing item', (editor) => {
  const pill = (name: string) => screen.getAllByRole('button', { name: new RegExp(`(Edit|Open)( tag)? ${name}$`) })[0]!;
  const field = () => screen.getByRole('textbox', { name: editor.label }) as HTMLInputElement;
  const editorOf = (name: string) => screen.getByRole('textbox', { name: `Edit ${name}` }) as HTMLInputElement;

  /** A real click: the press first (which is when the field's editing state is read), then the click. */
  const click = (element: HTMLElement) => {
    fireEvent.mouseDown(element);
    fireEvent.click(element);
  };

  /** Puts the field into editing: its input has focus. */
  const startEditingField = () => act(() => field().focus());

  it('while the field is being edited, edits that item in place, focused, and does not navigate', () => {
    onOpenTag.mockClear();
    render(<editor.Component initial={[...editor.initial]} />);
    startEditingField();

    click(pill(editor.first));

    expect(editorOf(editor.first)).toBeInTheDocument();
    expect(document.activeElement).toBe(editorOf(editor.first));
    expect(editorOf(editor.first).value).toBe(editor.first);
    expect(onOpenTag).not.toHaveBeenCalled();
  });

  it('Enter commits the edit', () => {
    render(<editor.Component initial={[...editor.initial]} />);
    startEditingField();
    click(pill(editor.first));

    fireEvent.change(editorOf(editor.first), { target: { value: editor.edited } });
    fireEvent.keyDown(editorOf(editor.first), { key: 'Enter' });

    expect(stored()).toEqual(editor.editedValue);
    expect(screen.queryByRole('textbox', { name: `Edit ${editor.first}` })).toBeNull();
  });

  it('Escape cancels the edit and restores the original', () => {
    render(<editor.Component initial={[...editor.initial]} />);
    startEditingField();
    click(pill(editor.first));

    fireEvent.change(editorOf(editor.first), { target: { value: editor.edited } });
    fireEvent.keyDown(editorOf(editor.first), { key: 'Escape' });

    expect(stored()).toEqual(editor.initial);
    expect(screen.queryByRole('textbox', { name: `Edit ${editor.first}` })).toBeNull();
  });

  it('an edit that repeats another item is rejected, keeping the edit open', () => {
    render(<editor.Component initial={[...editor.initial]} />);
    startEditingField();
    click(pill(editor.first));

    fireEvent.change(editorOf(editor.first), { target: { value: editor.initial[1] } });
    fireEvent.keyDown(editorOf(editor.first), { key: 'Enter' });

    expect(stored()).toEqual(editor.initial);
    expect(editorOf(editor.first)).toBeInTheDocument();
  });

  it('with the keyboard: Enter on a focused item edits it', () => {
    render(<editor.Component initial={[...editor.initial]} />);
    const target = pill(editor.first);
    act(() => target.focus());

    fireEvent.keyDown(target, { key: 'Enter' });

    expect(editorOf(editor.first)).toBeInTheDocument();
  });
});

describe('Tags: clicking a tag when the field is not being edited', () => {
  it('opens its collection and does not start editing', () => {
    onOpenTag.mockClear();
    render(<Tags initial={['design', 'research']} />);

    const pill = screen.getByRole('button', { name: 'Open tag design' });
    fireEvent.mouseDown(pill);
    fireEvent.click(pill);

    expect(onOpenTag).toHaveBeenCalledWith('design');
    expect(screen.queryByRole('textbox', { name: 'Edit design' })).toBeNull();
  });

  it('an invalid tag typed into the in-place editor is rejected (the tag grammar)', () => {
    render(<Tags initial={['design']} />);
    act(() => (screen.getByRole('textbox', { name: 'Tags' }) as HTMLInputElement).focus());
    const pill = screen.getByRole('button', { name: 'Edit tag design' });
    fireEvent.mouseDown(pill);
    fireEvent.click(pill);

    const editor = screen.getByRole('textbox', { name: 'Edit design' });
    fireEvent.change(editor, { target: { value: 'a.b' } });
    fireEvent.keyDown(editor, { key: 'Enter' });

    expect(JSON.parse(screen.getByTestId('value').textContent!)).toEqual(['design']);
    expect(screen.getByRole('textbox', { name: 'Edit design' })).toBeInTheDocument();
  });
});

describe('Aliases: clicking an alias when the field is not being edited', () => {
  it('keeps its existing behavior: it edits (an alias has nowhere to navigate)', () => {
    render(<Aliases initial={['Design']} />);

    const pill = screen.getByRole('button', { name: 'Edit Design' });
    fireEvent.mouseDown(pill);
    fireEvent.click(pill);

    expect(screen.getByRole('textbox', { name: 'Edit Design' })).toBeInTheDocument();
  });
});
