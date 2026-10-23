// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tauri = false;
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => tauri }));

import { ShortcutsProvider, isEditableTarget, useShortcutHandlers } from './ShortcutsProvider';
import type { ShortcutId } from './shortcuts';

function Handlers({ handlers }: { handlers: Partial<Record<ShortcutId, () => void>> }) {
  useShortcutHandlers(handlers);
  return <input aria-label="field" />;
}

const press = (init: KeyboardEventInit & { code: string }, target: Element | Window = window) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeEach(() => {
  tauri = false;
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  // The dispatcher reads the platform: ⌘ here.
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ShortcutsProvider', () => {
  it('runs the handler registered for a shortcut and stops the browser’s own handling of it', () => {
    const goBack = vi.fn();
    render(
      <ShortcutsProvider>
        <Handlers handlers={{ 'go-back': goBack }} />
      </ShortcutsProvider>
    );
    const event = press({ code: 'BracketLeft', metaKey: true });
    expect(goBack).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves a shortcut nobody handles alone, so the browser still gets it', () => {
    render(
      <ShortcutsProvider>
        <Handlers handlers={{}} />
      </ShortcutsProvider>
    );
    expect(press({ code: 'KeyK', metaKey: true }).defaultPrevented).toBe(false);
  });

  it('stops running a handler once its owner unmounts', () => {
    const search = vi.fn();
    const { rerender } = render(
      <ShortcutsProvider>
        <Handlers handlers={{ 'open-search': search }} />
      </ShortcutsProvider>
    );
    rerender(<ShortcutsProvider>{null}</ShortcutsProvider>);
    press({ code: 'KeyK', metaKey: true });
    expect(search).not.toHaveBeenCalled();
  });

  it('uses the newest function without registering again', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <ShortcutsProvider>
        <Handlers handlers={{ 'open-search': first }} />
      </ShortcutsProvider>
    );
    rerender(
      <ShortcutsProvider>
        <Handlers handlers={{ 'open-search': second }} />
      </ShortcutsProvider>
    );
    press({ code: 'KeyK', metaKey: true });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it('does not take Escape, which each open overlay dismisses itself', () => {
    const everything = Object.fromEntries(
      (['go-back', 'go-forward', 'open-search', 'toggle-sidebar', 'show-shortcuts'] as ShortcutId[]).map((id) => [id, vi.fn()])
    );
    render(
      <ShortcutsProvider>
        <Handlers handlers={everything} />
      </ShortcutsProvider>
    );
    const event = press({ code: 'Escape', key: 'Escape' });
    expect(event.defaultPrevented).toBe(false);
    for (const fn of Object.values(everything)) expect(fn).not.toHaveBeenCalled();
  });

  it('ignores a press something already handled (the editor’s own keymap, a text field)', () => {
    const goBack = vi.fn();
    render(
      <ShortcutsProvider>
        <Handlers handlers={{ 'go-back': goBack }} />
      </ShortcutsProvider>
    );
    const field = screen.getByLabelText('field');
    field.addEventListener('keydown', (event) => event.preventDefault());
    press({ code: 'BracketLeft', metaKey: true }, field);
    expect(goBack).not.toHaveBeenCalled();
  });

  it('ignores key repeat and IME composition', () => {
    const toggle = vi.fn();
    render(
      <ShortcutsProvider>
        <Handlers handlers={{ 'toggle-sidebar': toggle }} />
      </ShortcutsProvider>
    );
    press({ code: 'Backslash', metaKey: true, repeat: true });
    press({ code: 'Backslash', metaKey: true, isComposing: true });
    expect(toggle).not.toHaveBeenCalled();
  });

  it('still runs a ⌘ shortcut while a text field is focused (it is a chord, not typing)', () => {
    const search = vi.fn();
    render(
      <ShortcutsProvider>
        <Handlers handlers={{ 'open-search': search }} />
      </ShortcutsProvider>
    );
    press({ code: 'KeyK', metaKey: true }, screen.getByLabelText('field'));
    expect(search).toHaveBeenCalledOnce();
  });

  it('typing [ ] { } is not Go back or Go forward — only the ⌘ chord is', () => {
    const goBack = vi.fn();
    const goForward = vi.fn();
    render(
      <ShortcutsProvider>
        <Handlers handlers={{ 'go-back': goBack, 'go-forward': goForward }} />
      </ShortcutsProvider>
    );
    const field = screen.getByLabelText('field');
    press({ code: 'BracketLeft', key: '[' }, field);
    press({ code: 'BracketRight', key: ']' }, field);
    press({ code: 'BracketLeft', key: '{', shiftKey: true }, field);
    press({ code: 'BracketRight', key: '}', shiftKey: true }, field);
    // ⌃[ is not ⌘[ on a Mac, and ⌘⇧[ / ⌘⌥[ are other shortcuts (the editor's fold keys), not Go back.
    press({ code: 'BracketLeft', key: '[', ctrlKey: true }, field);
    press({ code: 'BracketLeft', key: '[', metaKey: true, shiftKey: true }, field);
    press({ code: 'BracketLeft', key: '[', metaKey: true, altKey: true }, field);
    expect(goBack).not.toHaveBeenCalled();
    expect(goForward).not.toHaveBeenCalled();
  });

  it('does not type-trigger: a bare K in a text field is not a shortcut', () => {
    const search = vi.fn();
    render(
      <ShortcutsProvider>
        <Handlers handlers={{ 'open-search': search }} />
      </ShortcutsProvider>
    );
    press({ code: 'KeyK', key: 'k' }, screen.getByLabelText('field'));
    expect(search).not.toHaveBeenCalled();
  });

  describe('against the desktop app’s native menu bar', () => {
    it('leaves the shortcuts the menu owns to it (never handled twice) and handles the rest', () => {
      tauri = true;
      const newNote = vi.fn();
      const newTask = vi.fn();
      render(
        <ShortcutsProvider>
          <Handlers handlers={{ 'new-note': newNote, 'new-task': newTask }} />
        </ShortcutsProvider>
      );
      press({ code: 'KeyN', metaKey: true });
      press({ code: 'KeyT', metaKey: true, shiftKey: true });
      expect(newNote).not.toHaveBeenCalled();
      expect(newTask).toHaveBeenCalledOnce();
    });

    it('handles the same native-owned shortcut in the browser build, which has no menu bar', () => {
      const newNote = vi.fn();
      render(
        <ShortcutsProvider>
          <Handlers handlers={{ 'new-note': newNote }} />
        </ShortcutsProvider>
      );
      press({ code: 'KeyN', metaKey: true });
      expect(newNote).toHaveBeenCalledOnce();
    });
  });

  it('opens the Keyboard shortcuts dialog it hosts on ⌘/ — once, however many times it is pressed while open', async () => {
    render(
      <ShortcutsProvider>
        <Handlers handlers={{}} />
      </ShortcutsProvider>
    );
    expect(screen.queryByRole('heading', { name: 'Keyboard shortcuts' })).toBeNull();
    press({ code: 'Slash', metaKey: true, altKey: true });
    expect(await screen.findByRole('heading', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    press({ code: 'Slash', metaKey: true, altKey: true });
    expect(screen.getAllByRole('heading', { name: 'Keyboard shortcuts' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Keyboard shortcuts' })).toBeNull());
  });
});

describe('isEditableTarget', () => {
  it('is true for text fields and editable content, false for anything else', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true);
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true);
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    expect(isEditableTarget(editable)).toBe(true);
    expect(isEditableTarget(document.createElement('button'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
