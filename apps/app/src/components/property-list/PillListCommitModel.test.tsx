// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
 * Tags and Aliases are the same pill-list interaction: Enter commits an item, Space does not (it is
 * ordinary text), an empty Enter adds nothing, and a duplicate is not added twice.
 */
const EDITORS = [
  {
    label: 'Tags',
    typed: 'design',
    render: (onCommit: (value: string[]) => void, value: string[] = []) =>
      render(<TagPropertyValue name="Tags" value={value} editable onCommit={onCommit} />),
    committed: ['design'],
  },
  {
    label: 'Aliases',
    typed: 'design',
    render: (onCommit: (value: string[]) => void, value: string[] = []) =>
      render(<MultiSelectPropertyValue name="Aliases" value={value} editable onCommit={onCommit} />),
    committed: ['design'],
  },
] as const;

describe.each(EDITORS)('$label editor: the shared commit model', (editor) => {
  const input = () => screen.getByRole('textbox', { name: editor.label }) as HTMLInputElement;
  const type = (text: string) => {
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: text } });
  };

  it('Space does not commit', () => {
    const onCommit = vi.fn();
    editor.render(onCommit);

    type(editor.typed);
    fireEvent.keyDown(input(), { key: ' ' });

    expect(onCommit).not.toHaveBeenCalled();
    expect(input().value).toBe(editor.typed);
  });

  it('Enter commits', () => {
    const onCommit = vi.fn();
    editor.render(onCommit);

    type(editor.typed);
    fireEvent.keyDown(input(), { key: 'Enter' });

    expect(onCommit).toHaveBeenCalledWith(editor.committed);
    expect(input().value).toBe('');
  });

  it('Enter on an empty input adds nothing', () => {
    const onCommit = vi.fn();
    editor.render(onCommit);

    fireEvent.keyDown(input(), { key: 'Enter' });

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('a duplicate is not added twice', () => {
    const onCommit = vi.fn();
    editor.render(onCommit, ['design']);

    type('design');
    fireEvent.keyDown(input(), { key: 'Enter' });

    expect(onCommit).not.toHaveBeenCalled();
  });
});
