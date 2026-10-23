// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog';
import { SHORTCUT_GROUPS } from './shortcuts';

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeEach(() => void vi.stubGlobal('ResizeObserver', ResizeObserverMock));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('KeyboardShortcutsDialog', () => {
  it('lists every group and row of the shortcut list, in order — the list is the source, so the dialog cannot drift', async () => {
    render(<KeyboardShortcutsDialog open onClose={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Keyboard shortcuts' });
    const titles = [...document.querySelectorAll('.settings-group__title')].map((el) => el.textContent);
    expect(titles).toEqual(SHORTCUT_GROUPS.map((group) => group.title));
    const rows = [...document.querySelectorAll('.settings-entry__title')].map((el) => el.textContent);
    expect(rows).toEqual(SHORTCUT_GROUPS.flatMap((group) => group.shortcuts.map((s) => s.label)));
  });

  it('shows each row’s keys beside it: the modifier icons, then the key', async () => {
    render(<KeyboardShortcutsDialog open onClose={vi.fn()} />);
    const row = (await screen.findByText('Move to trash')).closest('.settings-entry') as HTMLElement;
    const keys = row.querySelectorAll('.shortcut-key');
    expect(keys).toHaveLength(3);
    expect(row.querySelector('[data-icon="shift"]')).not.toBeNull();
    expect(row.querySelector('[data-icon="command"]')).not.toBeNull();
    expect(within(row).getByText('Delete')).toBeInTheDocument();
  });

  it('has no Markdown editing shortcuts', async () => {
    render(<KeyboardShortcutsDialog open onClose={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Keyboard shortcuts' });
    for (const text of ['Bold', 'Italic', 'Heading', 'Bullet list', 'Indent']) expect(screen.queryByText(text)).toBeNull();
  });
});

describe('KeyboardShortcutsDialog is a separate dialog from the Markdown guide one', () => {
  it('keeps its own single-page layout: titled groups, no category sidebar', async () => {
    render(<KeyboardShortcutsDialog open onClose={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Keyboard shortcuts' });
    expect(document.querySelector('.settings-sidebar')).toBeNull();
    expect(document.querySelector('.shortcuts-dialog__page')).not.toBeNull();
    expect(screen.queryByText('Markdown guide')).toBeNull();
  });
});
