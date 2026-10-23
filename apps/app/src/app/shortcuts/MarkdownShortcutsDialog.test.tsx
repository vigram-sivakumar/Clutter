// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkdownShortcutsDialog } from './MarkdownShortcutsDialog';
import { MARKDOWN_SHORTCUT_GROUPS } from './markdownShortcuts';

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

const CATEGORIES = [
  'Text formatting',
  'Lists',
  'Links and suggestions',
  'Dividers',
  'Editing',
  'Selection',
];

const sidebar = () => document.querySelector('.settings-sidebar') as HTMLElement;
const navItems = () => [...sidebar().querySelectorAll('.sidebar__navigation')] as HTMLElement[];
const selectedItems = () => navItems().filter((item) => item.classList.contains('entry-selected'));
const paneTitle = () => document.querySelector('.settings-page__title')?.textContent;
const rowLabels = () => [...document.querySelectorAll('.settings-page .settings-entry__title')].map((el) => el.textContent);

describe('MarkdownShortcutsDialog layout', () => {
  it('uses Settings’ own frame: its container, sidebar and page, titled "Markdown guide"', () => {
    render(<MarkdownShortcutsDialog open onClose={vi.fn()} />);
    expect(document.querySelector('.dialog.settings-dialog .settings')).not.toBeNull();
    expect(within(sidebar()).getByText('Markdown guide')).toBeInTheDocument();
    expect(document.querySelector('.settings > .settings-page')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('lists the six categories in order', () => {
    render(<MarkdownShortcutsDialog open onClose={vi.fn()} />);
    expect(navItems().map((item) => item.textContent)).toEqual(CATEGORIES);
    expect(MARKDOWN_SHORTCUT_GROUPS.map((group) => group.title)).toEqual(CATEGORIES);
  });

  it('starts on the first category, selected, with its rows in the pane', () => {
    render(<MarkdownShortcutsDialog open onClose={vi.fn()} />);
    expect(selectedItems().map((item) => item.textContent)).toEqual(['Text formatting']);
    expect(paneTitle()).toBe('Text formatting');
    expect(rowLabels()).toEqual(MARKDOWN_SHORTCUT_GROUPS[0]!.rows.map((row) => row.label));
  });

  it('shows the selected category’s rows, keys as chips and typing triggers as monospace text', () => {
    render(<MarkdownShortcutsDialog open onClose={vi.fn()} />);
    const bold = screen.getByText('Bold').closest('.settings-entry') as HTMLElement;
    expect(bold.querySelectorAll('.shortcut-key')).toHaveLength(2);
    const highlight = screen.getByText('Highlight').closest('.settings-entry') as HTMLElement;
    expect(highlight.querySelector('.shortcuts-dialog__trigger')?.textContent).toBe('==text==');
    expect(highlight.querySelector('.shortcut-key')).toBeNull();
  });
});

describe('MarkdownShortcutsDialog navigation', () => {
  it('selecting a category updates the pane and the selected item, without closing', () => {
    const onClose = vi.fn();
    render(<MarkdownShortcutsDialog open onClose={onClose} />);
    fireEvent.click(within(sidebar()).getByText('Dividers'));
    expect(selectedItems().map((item) => item.textContent)).toEqual(['Dividers']);
    expect(paneTitle()).toBe('Dividers');
    expect(rowLabels()).toEqual(MARKDOWN_SHORTCUT_GROUPS[3]!.rows.map((row) => row.label));
    expect(screen.queryByText('Bold')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each(CATEGORIES.map((title, index) => [title, index] as const))('%s shows exactly its own rows', (title, index) => {
    render(<MarkdownShortcutsDialog open onClose={vi.fn()} />);
    fireEvent.click(within(sidebar()).getByText(title));
    expect(paneTitle()).toBe(title);
    expect(rowLabels()).toEqual(MARKDOWN_SHORTCUT_GROUPS[index]!.rows.map((row) => row.label));
  });

  it('closing and reopening returns to the first category', () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button onClick={() => setOpen(true)}>reopen</button>
          <MarkdownShortcutsDialog open={open} onClose={() => setOpen(false)} />
        </>
      );
    }
    render(<Harness />);
    fireEvent.click(within(sidebar()).getByText('Editing'));
    expect(paneTitle()).toBe('Editing');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(document.querySelector('.settings-sidebar')).toBeNull();
    fireEvent.click(screen.getByText('reopen'));
    expect(selectedItems().map((item) => item.textContent)).toEqual(['Text formatting']);
    expect(paneTitle()).toBe('Text formatting');
  });
});

describe('MarkdownShortcutsDialog dismissal', () => {
  it('Escape dismisses it', () => {
    const onClose = vi.fn();
    render(<MarkdownShortcutsDialog open onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('the close button dismisses it', () => {
    const onClose = vi.fn();
    render(<MarkdownShortcutsDialog open onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders nothing while closed', () => {
    render(<MarkdownShortcutsDialog open={false} onClose={vi.fn()} />);
    expect(document.querySelector('.settings')).toBeNull();
  });
});
