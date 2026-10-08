// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { TaskTitleActions } from './TaskTitleActions';

// Overlay's anchored positioning observes elements via ResizeObserver, which jsdom lacks.
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

afterEach(cleanup);

const renderActions = (onChangeDueDate = vi.fn()) => {
  render(<TaskTitleActions dueDate="2026-08-20" onEdit={vi.fn()} onChangeDueDate={onChangeDueDate} />);

  return { onChangeDueDate, button: screen.getByRole('button', { name: 'Change due date' }) };
};

/** A pointer click carries `detail >= 1`; a keyboard activation (Enter/Space) dispatches a click with `detail` 0. */
const pointerOpen = (button: HTMLElement) => fireEvent.click(button, { detail: 1 });
const keyboardOpen = (button: HTMLElement) => fireEvent.click(button, { detail: 0 });

describe('TaskTitleActions — what closing the due-date picker leaves behind', () => {
  it('open with the pointer → Escape: the picker closes and focus is NOT left on the button (so nothing pins the actions revealed)', () => {
    const { button } = renderActions();

    pointerOpen(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).not.toHaveFocus();
  });

  it('open with the pointer → outside click: the picker closes and focus is NOT left on the button', () => {
    const { button } = renderActions();

    pointerOpen(button);
    fireEvent.click(document.querySelector('.overlay__backdrop')!);

    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).not.toHaveFocus();
  });

  it('open with the pointer → choose a date: it is saved, the picker closes, and focus is NOT left on the button', () => {
    const { button, onChangeDueDate } = renderActions();

    pointerOpen(button);
    fireEvent.click(screen.getByText('15'));

    expect(onChangeDueDate).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-15$/));
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).not.toHaveFocus();
  });

  it('open with the pointer → Clear date: it is cleared, the picker closes, and focus is NOT left on the button', () => {
    const { button, onChangeDueDate } = renderActions();

    pointerOpen(button);
    fireEvent.click(screen.getByText('Clear date'));

    expect(onChangeDueDate).toHaveBeenCalledWith(null);
    expect(button).not.toHaveFocus();
  });

  it('keyboard focus stays accessible: opened with the keyboard → Escape returns focus to the button', () => {
    const { button } = renderActions();

    keyboardOpen(button);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
  });

  it('a later keyboard open after a pointer open still restores focus (the pointer suppression is per-open)', () => {
    const { button } = renderActions();

    pointerOpen(button);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(button).not.toHaveFocus();

    keyboardOpen(button);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(button).toHaveFocus();
  });
});

describe('keyboard use with the actions `display: none` unless revealed', () => {
  const wrapper = () => document.querySelector('.collection-entry__actions')!;

  it('a keyboard open keeps the actions displayed (data-keyboard-active) so closing can return focus to the button', () => {
    const { button } = renderActions();

    keyboardOpen(button);
    expect(wrapper()).toHaveAttribute('data-keyboard-active');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(button).toHaveFocus();
    expect(wrapper()).toHaveAttribute('data-keyboard-active');
  });

  it('leaving the actions with the keyboard ends it, so they hide again', () => {
    const { button } = renderActions();

    keyboardOpen(button);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.blur(button, { relatedTarget: document.body });

    expect(wrapper()).not.toHaveAttribute('data-keyboard-active');
  });

  it('a pointer open never sets it — the actions follow hover alone', () => {
    const { button } = renderActions();

    pointerOpen(button);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(wrapper()).not.toHaveAttribute('data-keyboard-active');
  });
});

describe('the actions\' reveal rules (CollectionEntry.css — reusable by any collection view)', () => {
  const read = (...segments: string[]) => readFileSync(join(__dirname, ...segments), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const css = read('..', '..', 'collection', 'components', 'entry', 'CollectionEntry.css');
  const rules = css.split('}').filter((rule) => rule.includes('collection-entry__actions'));
  const joined = rules.join('}');

  it('hidden with display: none; revealed with display: flex by hover, focus in or on the entry, an open picker, and a keyboard open', () => {
    expect(css).toMatch(/\.collection-entry__actions\s*\{[^}]*display:\s*none;/);
    expect(joined).toMatch(/display:\s*flex;/);
    for (const selector of [
      '.collection-entry:hover .collection-entry__actions',
      '.collection-entry:focus-within .collection-entry__actions',
      ".collection-entry__actions:has([aria-expanded='true'])",
      '.collection-entry__actions[data-keyboard-active]',
    ]) {
      expect(joined, selector).toContain(selector);
    }
  });

  it('a table name cell is revealed by its parent row being hovered or focused — without naming any table class', () => {
    expect(joined).toContain(':hover > .collection-entry--layout-cell .collection-entry__actions');
    expect(joined).toContain(':focus-within > .collection-entry--layout-cell .collection-entry__actions');
    expect(joined).not.toContain('collection-table');
  });

  it('does not use opacity for the reveal, nor :focus-visible (a display: none button must stay rendered while Tab moves focus onto it)', () => {
    expect(joined).not.toMatch(/opacity/);
    expect(joined).not.toContain('focus-visible');
  });

  it('Task.css no longer carries any of it — the Tasks view only uses the class', () => {
    expect(read('..', '..', 'tasks', 'sidebar', 'Task.css')).not.toContain('collection-entry__actions');
  });
});
