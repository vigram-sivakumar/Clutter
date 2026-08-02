// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NewFolderRow } from './NewFolderRow';

afterEach(() => {
  cleanup();
});

function getEditable(): HTMLElement {
  return screen.getByRole('textbox');
}

function typeText(element: HTMLElement, text: string) {
  element.textContent = text;
  fireEvent.input(element);
}

describe('NewFolderRow', () => {
  it('is focused as soon as it renders', () => {
    render(<NewFolderRow level={0} onCommit={vi.fn()} onCancel={vi.fn()} />);

    expect(document.activeElement).toBe(getEditable());
  });

  it('calls onCommit with the trimmed name on Enter, and does not call onCancel', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    render(<NewFolderRow level={0} onCommit={onCommit} onCancel={onCancel} />);

    const editable = getEditable();
    editable.focus();
    typeText(editable, '  Projects  ');
    fireEvent.keyDown(editable, { key: 'Enter' });

    expect(onCommit).toHaveBeenCalledWith('Projects');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel on Escape, without ever calling onCommit', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    render(<NewFolderRow level={0} onCommit={onCommit} onCancel={onCancel} />);

    const editable = getEditable();
    editable.focus();
    typeText(editable, 'Projects');
    fireEvent.keyDown(editable, { key: 'Escape' });

    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel on blur with an empty name, without calling onCommit', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    render(<NewFolderRow level={0} onCommit={onCommit} onCancel={onCancel} />);

    const editable = getEditable();
    editable.focus();
    fireEvent.blur(editable);

    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel, not onCommit, when the committed name is whitespace-only', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    render(<NewFolderRow level={0} onCommit={onCommit} onCancel={onCancel} />);

    const editable = getEditable();
    editable.focus();
    typeText(editable, '   ');
    fireEvent.blur(editable);

    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
