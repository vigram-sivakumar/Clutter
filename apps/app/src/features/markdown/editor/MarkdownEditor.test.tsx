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

describe('MarkdownEditor existing behavior, unchanged', () => {
  it('syncs the DOM to the markdown prop', () => {
    const { container } = render(<MarkdownEditor markdown="Hello" />);
    const editor = container.querySelector('[contenteditable]') as HTMLElement;

    expect(editor.textContent).toBe('Hello');
  });

  it('commits on blur when the content changed', () => {
    const onCommit = vi.fn();
    const { container } = render(
      <MarkdownEditor markdown="Hello" onCommit={onCommit} />
    );
    const editor = container.querySelector('[contenteditable]') as HTMLElement;

    editor.textContent = 'Edited';
    fireEvent.blur(editor);

    expect(onCommit).toHaveBeenCalledWith('Edited');
  });

  it('does not commit on blur when the content is unchanged', () => {
    const onCommit = vi.fn();
    const { container } = render(
      <MarkdownEditor markdown="Hello" onCommit={onCommit} />
    );
    const editor = container.querySelector('[contenteditable]') as HTMLElement;

    fireEvent.blur(editor);

    expect(onCommit).not.toHaveBeenCalled();
  });
});
