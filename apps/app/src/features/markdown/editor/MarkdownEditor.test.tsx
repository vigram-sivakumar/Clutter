// @vitest-environment jsdom

import { createRef } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MarkdownEditor, type MarkdownEditorHandle } from './MarkdownEditor';

afterEach(() => {
  cleanup();
});

describe('MarkdownEditor imperative focus handle', () => {
  it('lets a caller focus the editor via ref', () => {
    const ref = createRef<MarkdownEditorHandle>();
    const { container } = render(<MarkdownEditor ref={ref} markdown="Hello" />);
    const editor = container.querySelector('[contenteditable]') as HTMLElement;

    expect(document.activeElement).not.toBe(editor);

    ref.current?.focus();

    expect(document.activeElement).toBe(editor);
  });
});

describe('MarkdownEditor: DOM sync from the markdown prop', () => {
  it('syncs the DOM to the markdown prop on initial render', () => {
    const { container } = render(<MarkdownEditor markdown="Hello" />);
    const editor = container.querySelector('[contenteditable]') as HTMLElement;

    expect(editor.textContent).toBe('Hello');
  });

  it('syncs an external markdown prop change into the DOM while unfocused', () => {
    const { container, rerender } = render(<MarkdownEditor markdown="Hello" />);
    const editor = container.querySelector('[contenteditable]') as HTMLElement;
    expect(document.activeElement).not.toBe(editor);

    rerender(<MarkdownEditor markdown="Changed externally" />);

    expect(editor.textContent).toBe('Changed externally');
  });

  it('does NOT overwrite the DOM from a markdown prop change while the editor has focus', () => {
    const { container, rerender } = render(<MarkdownEditor markdown="Hello" />);
    const editor = container.querySelector('[contenteditable]') as HTMLElement;
    editor.focus();
    expect(document.activeElement).toBe(editor);

    // Simulate the editor's own in-progress typing that hasn't round-tripped
    // back through the markdown prop yet.
    editor.textContent = 'Hello, mid-edit';

    // A stale/round-tripped prop update arrives (e.g. this editor's own
    // earlier commit re-rendering) — must not clobber in-progress typing.
    rerender(<MarkdownEditor markdown="Hello" />);

    expect(editor.textContent).toBe('Hello, mid-edit');
  });

  it('resumes syncing from the prop once focus leaves the editor', () => {
    const { container, rerender } = render(<MarkdownEditor markdown="Hello" />);
    const editor = container.querySelector('[contenteditable]') as HTMLElement;
    editor.focus();
    editor.textContent = 'Mid-edit';
    rerender(<MarkdownEditor markdown="Hello" />);
    expect(editor.textContent).toBe('Mid-edit');

    // jsdom's fireEvent.blur only dispatches the event, it doesn't move
    // document.activeElement the way a real browser's focus change would —
    // .blur() is what actually clears activeElement here, which is the
    // condition the component's effect checks.
    editor.blur();
    rerender(<MarkdownEditor markdown="Reconciled value" />);

    expect(editor.textContent).toBe('Reconciled value');
  });
});

describe('MarkdownEditor: onEdit (per-keystroke commit)', () => {
  it('calls onEdit with the current content on every input event', () => {
    const onEdit = vi.fn();
    const { container } = render(<MarkdownEditor markdown="Hello" onEdit={onEdit} />);
    const editor = container.querySelector('[contenteditable]') as HTMLElement;

    editor.textContent = 'Hello, edited';
    fireEvent.input(editor);

    expect(onEdit).toHaveBeenCalledWith('Hello, edited');
  });

  it('calls onEdit again for a second input event, unconditionally (no local diffing)', () => {
    const onEdit = vi.fn();
    const { container } = render(<MarkdownEditor markdown="Hello" onEdit={onEdit} />);
    const editor = container.querySelector('[contenteditable]') as HTMLElement;

    editor.textContent = 'H';
    fireEvent.input(editor);
    editor.textContent = 'He';
    fireEvent.input(editor);

    expect(onEdit).toHaveBeenNthCalledWith(1, 'H');
    expect(onEdit).toHaveBeenNthCalledWith(2, 'He');
  });

  it('does not throw when onEdit is not provided', () => {
    const { container } = render(<MarkdownEditor markdown="Hello" />);
    const editor = container.querySelector('[contenteditable]') as HTMLElement;

    editor.textContent = 'Edited';
    expect(() => fireEvent.input(editor)).not.toThrow();
  });
});

describe('MarkdownEditor: onFlush (blur — a payload-free save request)', () => {
  it('calls onFlush with no arguments on blur', () => {
    const onFlush = vi.fn();
    const { container } = render(<MarkdownEditor markdown="Hello" onFlush={onFlush} />);
    const editor = container.querySelector('[contenteditable]') as HTMLElement;

    fireEvent.blur(editor);

    expect(onFlush).toHaveBeenCalledWith();
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it('does not call onEdit on blur — blur is a persistence event only, never a mutation event', () => {
    const onEdit = vi.fn();
    const onFlush = vi.fn();
    const { container } = render(
      <MarkdownEditor markdown="Hello" onEdit={onEdit} onFlush={onFlush} />
    );
    const editor = container.querySelector('[contenteditable]') as HTMLElement;

    editor.textContent = 'Edited';
    fireEvent.blur(editor);

    expect(onEdit).not.toHaveBeenCalled();
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it('does not throw when onFlush is not provided', () => {
    const { container } = render(<MarkdownEditor markdown="Hello" />);
    const editor = container.querySelector('[contenteditable]') as HTMLElement;

    expect(() => fireEvent.blur(editor)).not.toThrow();
  });
});
