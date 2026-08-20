// @vitest-environment jsdom

import { act, createRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EditableText } from './EditableText';
import type { EditableTextHandle } from './EditableText.types';

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

  it('autoFocus with an existing (non-empty) value places the caret at the END, not the start — every rename flow reuses this', () => {
    const value = 'Project name';
    render(<EditableText value={value} onCommit={vi.fn()} autoFocus />);

    const selection = window.getSelection();
    expect(selection?.isCollapsed).toBe(true);
    expect(selection?.anchorOffset).toBe(value.length);
    expect(selection?.focusOffset).toBe(value.length);
    expect(selection?.anchorNode?.textContent).toBe(value);
  });

  it('autoFocus with an empty value is unaffected (start and end coincide) — the new-item-naming case stays exactly as before', () => {
    render(<EditableText value="" onCommit={vi.fn()} autoFocus />);

    const selection = window.getSelection();
    expect(document.activeElement).toBe(getEditable());
    expect(selection?.anchorOffset).toBe(0);
  });
});

describe('EditableText onEdit/onFlush (continuous-commit channel)', () => {
  it('onEdit fires on every input event with the live, uncommitted text', () => {
    const onEdit = vi.fn();
    render(<EditableText value="" onCommit={vi.fn()} onEdit={onEdit} />);

    const editable = getEditable();
    typeText(editable, 'M');
    typeText(editable, 'Me');
    typeText(editable, 'Meeting');

    expect(onEdit).toHaveBeenNthCalledWith(1, 'M');
    expect(onEdit).toHaveBeenNthCalledWith(2, 'Me');
    expect(onEdit).toHaveBeenNthCalledWith(3, 'Meeting');
    expect(onEdit).toHaveBeenCalledTimes(3);
  });

  it('onFlush fires on every blur, unconditionally, even when the text is unchanged', () => {
    const onFlush = vi.fn();
    render(<EditableText value="Same" onCommit={vi.fn()} onFlush={onFlush} />);

    fireEvent.blur(getEditable());

    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it('onFlush does NOT fire on a blur that follows Escape — an escaped session must not force-persist', () => {
    const onCommit = vi.fn();
    const onFlush = vi.fn();
    render(<EditableText value="Original" onCommit={onCommit} onFlush={onFlush} />);

    const editable = getEditable();
    editable.focus();
    typeText(editable, 'Something else');
    fireEvent.keyDown(editable, { key: 'Escape' });

    expect(onCommit).not.toHaveBeenCalled();
    expect(onFlush).not.toHaveBeenCalled();
  });

  it('onCancel fires specifically on Escape, in place of onFlush', () => {
    const onFlush = vi.fn();
    const onCancel = vi.fn();
    render(<EditableText value="Original" onCommit={vi.fn()} onFlush={onFlush} onCancel={onCancel} />);

    const editable = getEditable();
    editable.focus();
    typeText(editable, 'Something else');
    fireEvent.keyDown(editable, { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onFlush).not.toHaveBeenCalled();
  });

  it('onCancel does not fire on an ordinary (non-escaped) blur', () => {
    const onCancel = vi.fn();
    render(<EditableText value="" onCommit={vi.fn()} onCancel={onCancel} />);

    const editable = getEditable();
    typeText(editable, 'Projects');
    fireEvent.blur(editable);

    expect(onCancel).not.toHaveBeenCalled();
  });

  it('onCancel does not fire on Enter', () => {
    const onCancel = vi.fn();
    render(<EditableText value="" onCommit={vi.fn()} onCancel={onCancel} />);

    const editable = getEditable();
    editable.focus();
    typeText(editable, 'Projects');
    fireEvent.keyDown(editable, { key: 'Enter' });

    expect(onCancel).not.toHaveBeenCalled();
  });

  it('a consumer using only onCommit (folder rename, draft title) is unaffected — onEdit/onFlush are additive, not a replacement', () => {
    const onCommit = vi.fn();
    render(<EditableText value="" onCommit={onCommit} />);

    const editable = getEditable();
    typeText(editable, 'Projects');
    fireEvent.blur(editable);

    expect(onCommit).toHaveBeenCalledWith('Projects');
  });
});

describe('EditableText onSubmit', () => {
  it('fires on Enter, after onCommit/onEditingEnd', () => {
    const calls: string[] = [];
    const onCommit = vi.fn(() => {
      calls.push('commit');
    });
    const onEditingEnd = vi.fn(() => calls.push('editingEnd'));
    const onSubmit = vi.fn(() => calls.push('submit'));
    render(
      <EditableText
        value=""
        onCommit={onCommit}
        onEditingEnd={onEditingEnd}
        onSubmit={onSubmit}
      />
    );

    const editable = getEditable();
    editable.focus();
    typeText(editable, 'Projects');
    fireEvent.keyDown(editable, { key: 'Enter' });

    expect(calls).toEqual(['commit', 'editingEnd', 'submit']);
  });

  it('fires on Enter even when the text is unchanged', () => {
    const onSubmit = vi.fn();
    render(<EditableText value="Same" onCommit={vi.fn()} onSubmit={onSubmit} />);

    const editable = getEditable();
    editable.focus();
    fireEvent.keyDown(editable, { key: 'Enter' });

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('never fires on Escape', () => {
    const onSubmit = vi.fn();
    render(<EditableText value="" onCommit={vi.fn()} onSubmit={onSubmit} />);

    const editable = getEditable();
    editable.focus();
    typeText(editable, 'Projects');
    fireEvent.keyDown(editable, { key: 'Escape' });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('never fires on a plain blur (no key pressed)', () => {
    const onSubmit = vi.fn();
    render(<EditableText value="" onCommit={vi.fn()} onSubmit={onSubmit} />);

    fireEvent.blur(getEditable());

    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('EditableText invalid commit (onCommit returning false)', () => {
  it('an invalid Enter submit does not commit — the field keeps the typed value, not the original', () => {
    const onCommit = vi.fn(() => false);
    render(<EditableText value="Original" onCommit={onCommit} />);

    const editable = getEditable();
    editable.focus();
    typeText(editable, 'bad value');
    fireEvent.keyDown(editable, { key: 'Enter' });

    expect(onCommit).toHaveBeenCalledWith('bad value');
    expect(editable.textContent).toBe('bad value');
  });

  it('an invalid Enter submit keeps editing active — refocuses, does not fire onEditingEnd/onFlush/onSubmit', () => {
    const onCommit = vi.fn(() => false);
    const onEditingEnd = vi.fn();
    const onFlush = vi.fn();
    const onSubmit = vi.fn();
    render(
      <EditableText
        value="Original"
        onCommit={onCommit}
        onEditingEnd={onEditingEnd}
        onFlush={onFlush}
        onSubmit={onSubmit}
      />
    );

    const editable = getEditable();
    editable.focus();
    typeText(editable, 'bad value');
    fireEvent.keyDown(editable, { key: 'Enter' });

    expect(document.activeElement).toBe(editable);
    expect(onEditingEnd).not.toHaveBeenCalled();
    expect(onFlush).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('an invalid Enter submit places the caret at the end, with no text selected', () => {
    const onCommit = vi.fn(() => false);
    render(<EditableText value="Original" onCommit={onCommit} />);

    const editable = getEditable();
    editable.focus();
    typeText(editable, 'bad value');
    fireEvent.keyDown(editable, { key: 'Enter' });

    const selection = window.getSelection();
    expect(selection?.isCollapsed).toBe(true);
    expect(selection?.anchorOffset).toBe('bad value'.length);
  });

  it('an invalid Enter submit triggers the shake state (data-shake / editable-text--shake)', () => {
    const onCommit = vi.fn(() => false);
    render(<EditableText value="Original" onCommit={onCommit} />);

    const editable = getEditable();
    editable.focus();
    typeText(editable, 'bad value');
    fireEvent.keyDown(editable, { key: 'Enter' });

    expect(editable.dataset.shake).toBe('true');
    expect(editable.className).toContain('editable-text--shake');
  });

  it('the shake clears itself after its own duration', () => {
    // @testing-library/react's own render()/fireEvent() calls set this
    // automatically; a manually-invoked act() (needed here to flush the
    // fake-timer-driven state update) doesn't otherwise pick it up in
    // this environment, producing a spurious (harmless) act() warning.
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    const onCommit = vi.fn(() => false);
    render(<EditableText value="Original" onCommit={onCommit} />);

    const editable = getEditable();
    editable.focus();
    typeText(editable, 'bad value');
    fireEvent.keyDown(editable, { key: 'Enter' });
    expect(editable.dataset.shake).toBe('true');

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(editable.dataset.shake).toBeUndefined();

    vi.useRealTimers();
  });

  it('a valid submit still commits normally once the value is fixed', () => {
    const onCommit = vi.fn((value: string) => value !== 'bad value');
    const onEditingEnd = vi.fn();
    render(<EditableText value="Original" onCommit={onCommit} onEditingEnd={onEditingEnd} />);

    const editable = getEditable();
    editable.focus();
    typeText(editable, 'bad value');
    fireEvent.keyDown(editable, { key: 'Enter' });
    expect(onEditingEnd).not.toHaveBeenCalled();

    typeText(editable, 'good value');
    fireEvent.keyDown(editable, { key: 'Enter' });

    expect(onCommit).toHaveBeenLastCalledWith('good value');
    expect(onEditingEnd).toHaveBeenCalledTimes(1);
  });

  it('an invalid value still present at blur (focus genuinely moved away) reverts to the original value and ends the session', () => {
    const onCommit = vi.fn(() => false);
    const onCancel = vi.fn();
    const onEditingEnd = vi.fn();
    const onFlush = vi.fn();
    render(
      <EditableText
        value="Original"
        onCommit={onCommit}
        onCancel={onCancel}
        onEditingEnd={onEditingEnd}
        onFlush={onFlush}
      />
    );

    const editable = getEditable();
    typeText(editable, 'bad value');
    fireEvent.blur(editable);

    expect(editable.textContent).toBe('Original');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onEditingEnd).toHaveBeenCalledTimes(1);
    expect(onFlush).not.toHaveBeenCalled();
  });

  it('Escape still reverts to the original value regardless of validity — unaffected by the invalid-commit path', () => {
    const onCommit = vi.fn(() => false);
    const onCancel = vi.fn();
    render(<EditableText value="Original" onCommit={onCommit} onCancel={onCancel} />);

    const editable = getEditable();
    editable.focus();
    typeText(editable, 'bad value');
    fireEvent.keyDown(editable, { key: 'Escape' });

    expect(editable.textContent).toBe('Original');
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('EditableText imperative focus handle', () => {
  it('lets a caller focus an already-mounted instance via ref', () => {
    const ref = createRef<EditableTextHandle>();
    render(<EditableText ref={ref} value="Hello" onCommit={vi.fn()} />);

    expect(document.activeElement).not.toBe(getEditable());

    ref.current?.focus();

    expect(document.activeElement).toBe(getEditable());
  });
});
