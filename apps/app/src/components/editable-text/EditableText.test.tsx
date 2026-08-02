// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EditableText } from './EditableText';

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

describe('EditableText commit/cancel lifecycle', () => {
  it('commits on blur when the text changed', () => {
    const onCommit = vi.fn();
    render(<EditableText value="" onCommit={onCommit} />);

    const editable = getEditable();
    typeText(editable, 'Projects');
    fireEvent.blur(editable);

    expect(onCommit).toHaveBeenCalledWith('Projects');
  });

  it('commits on Enter', () => {
    const onCommit = vi.fn();
    render(<EditableText value="" onCommit={onCommit} />);

    const editable = getEditable();
    editable.focus();
    typeText(editable, 'Projects');
    fireEvent.keyDown(editable, { key: 'Enter' });

    expect(onCommit).toHaveBeenCalledWith('Projects');
  });

  it('does not commit on blur when the text is unchanged', () => {
    const onCommit = vi.fn();
    render(<EditableText value="" onCommit={onCommit} />);

    fireEvent.blur(getEditable());

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('never commits on Escape, even with valid changed text', () => {
    const onCommit = vi.fn();
    render(<EditableText value="" onCommit={onCommit} />);

    const editable = getEditable();
    editable.focus();
    typeText(editable, 'Projects');
    fireEvent.keyDown(editable, { key: 'Escape' });

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('reverts the visible text to value on Escape', () => {
    const onCommit = vi.fn();
    render(<EditableText value="Original" onCommit={onCommit} />);

    const editable = getEditable();
    editable.focus();
    typeText(editable, 'Something else');
    fireEvent.keyDown(editable, { key: 'Escape' });

    expect(editable.textContent).toBe('Original');
  });

  it('calls onEditingEnd on every session end, committed or not', () => {
    const onCommit = vi.fn();
    const onEditingEnd = vi.fn();
    render(
      <EditableText value="" onCommit={onCommit} onEditingEnd={onEditingEnd} />
    );

    const editable = getEditable();
    editable.focus();
    fireEvent.blur(editable);
    expect(onEditingEnd).toHaveBeenCalledTimes(1);

    editable.focus();
    typeText(editable, 'Projects');
    fireEvent.keyDown(editable, { key: 'Escape' });
    expect(onEditingEnd).toHaveBeenCalledTimes(2);
  });

  it('lets a consumer distinguish a committed session from a cancelled one via onEditingEnd', () => {
    let committed = false;
    const onCommit = vi.fn(() => {
      committed = true;
    });
    const onEditingEnd = vi.fn(() => {
      expect(committed).toBe(true);
    });
    render(
      <EditableText value="" onCommit={onCommit} onEditingEnd={onEditingEnd} />
    );

    const editable = getEditable();
    editable.focus();
    typeText(editable, 'Projects');
    fireEvent.keyDown(editable, { key: 'Enter' });

    expect(onEditingEnd).toHaveBeenCalledTimes(1);
  });

  it('focuses on mount when autoFocus is set', () => {
    render(<EditableText value="" onCommit={vi.fn()} autoFocus />);

    expect(document.activeElement).toBe(getEditable());
  });

  it('does not focus on mount when autoFocus is not set', () => {
    render(<EditableText value="" onCommit={vi.fn()} />);

    expect(document.activeElement).not.toBe(getEditable());
  });
});
