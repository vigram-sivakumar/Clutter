// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Settings } from '../Settings';
import {
  DefaultNoteLocationSetting,
  type NoteLocationOption,
  type NoteLocationSource,
} from './DefaultNoteLocationSetting';

const folder = (id: string, title: string, parentPath = '', emoji: string | null = null): NoteLocationOption => ({
  id,
  title,
  parentPath,
  emoji,
});

/** A source over a mutable state, like the real one: choosing notifies, and the folders can change under it. */
function makeSource(initialFolders: NoteLocationOption[], initialSelected?: string) {
  let folders = initialFolders;
  let selected = initialSelected;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const source: NoteLocationSource = {
    getFolders: () => folders,
    getSelectedId: () => selected,
    select: vi.fn((id: string | undefined) => {
      selected = id;
      notify();
    }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    source,
    setFolders: (next: NoteLocationOption[]) => {
      folders = next;
      notify();
    },
    setSelected: (id: string | undefined) => {
      selected = id;
      notify();
    },
  };
}

const trigger = () => screen.getByRole('button', { name: /^Default note location:/ });
const open = () => fireEvent.click(trigger());
const rows = () => screen.queryAllByRole('menuitem');
const rowLabels = () => rows().map((row) => row.textContent);
const ticked = () => rows().filter((row) => row.querySelector('[data-icon="tick"]'));

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DefaultNoteLocationSetting', () => {
  it('shows the entry copy and an outline button on Inbox, the default', () => {
    render(<DefaultNoteLocationSetting source={makeSource([folder('a', 'Alpha')]).source} />);
    expect(screen.getByText('Default note location', { selector: '.settings-entry__title' })).toBeInTheDocument();
    expect(screen.getByText('Choose where new notes are created by default')).toBeInTheDocument();
    expect(trigger()).toHaveClass('button--outline');
    expect(trigger()).toHaveTextContent('Inbox');
  });

  it('lists Inbox first, then every folder, ticking only the selected one', () => {
    render(<DefaultNoteLocationSetting source={makeSource([folder('a', 'Alpha'), folder('b', 'Beta')]).source} />);
    open();
    expect(rowLabels()).toEqual(['Inbox', 'Alpha', 'Beta']);
    expect(ticked().map((row) => row.textContent)).toEqual(['Inbox']);
  });

  it('labels the button with, and ticks, the chosen folder', () => {
    render(<DefaultNoteLocationSetting source={makeSource([folder('a', 'Alpha'), folder('b', 'Beta')], 'b').source} />);
    expect(trigger()).toHaveTextContent('Beta');
    open();
    expect(ticked().map((row) => row.textContent)).toEqual(['Beta']);
    expect(screen.getByRole('menuitem', { name: 'Beta' })).toHaveAttribute('aria-current', 'true');
  });

  it('selects a folder at once: updates the label, closes the menu and reports the id', () => {
    const { source } = makeSource([folder('a', 'Alpha'), folder('b', 'Beta')]);
    render(<DefaultNoteLocationSetting source={source} />);
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Beta' }));

    expect(source.select).toHaveBeenCalledWith('b');
    expect(trigger()).toHaveTextContent('Beta');
    expect(rows()).toHaveLength(0);
  });

  it('choosing Inbox again reports undefined', () => {
    const { source } = makeSource([folder('a', 'Alpha')], 'a');
    render(<DefaultNoteLocationSetting source={source} />);
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Inbox' }));

    expect(source.select).toHaveBeenCalledWith(undefined);
    expect(trigger()).toHaveTextContent('Inbox');
  });

  it('leads each row with the folder name, so a long path never hides it, and says where same-named folders are', () => {
    render(
      <DefaultNoteLocationSetting
        source={makeSource([
          folder('w', 'Work'),
          folder('wn', 'Notes', 'Work'),
          folder('h', 'Home'),
          folder('hn', 'Notes', 'Home'),
          folder('g', 'Garlicy', 'A very long parent folder name that would be cut off'),
        ]).source}
      />
    );
    open();
    expect(rowLabels()).toEqual([
      'Inbox',
      'Work',
      'Notes · Work',
      'Home',
      'Notes · Home',
      'Garlicy',
    ]);
    expect(screen.getByText('Garlicy')).toHaveAttribute(
      'title',
      'A very long parent folder name that would be cut off / Garlicy'
    );
  });

  it('draws a folder\'s own emoji, and the folder icon otherwise', () => {
    render(<DefaultNoteLocationSetting source={makeSource([folder('a', 'Alpha', '', '🍎'), folder('b', 'Beta')]).source} />);
    open();
    expect(screen.getByRole('menuitem', { name: /Alpha/ }).textContent).toContain('🍎');
    expect(screen.getByRole('menuitem', { name: 'Beta' }).querySelector('.entry__leading svg')).not.toBeNull();
  });

  it('follows folders being created, renamed, moved and deleted while it is open', () => {
    const { source, setFolders } = makeSource([folder('a', 'Alpha')]);
    render(<DefaultNoteLocationSetting source={source} />);
    open();
    expect(rowLabels()).toEqual(['Inbox', 'Alpha']);

    act(() => setFolders([folder('a', 'Alpha'), folder('n', 'New')]));
    expect(rowLabels()).toEqual(['Inbox', 'Alpha', 'New']);

    act(() => setFolders([folder('a', 'Renamed'), folder('n', 'New', 'Renamed')]));
    expect(rowLabels()).toEqual(['Inbox', 'Renamed', 'New']);

    act(() => setFolders([]));
    expect(rowLabels()).toEqual(['Inbox']);
  });

  it('reads the chosen folder\'s new name on the button after a rename', () => {
    const { source, setFolders } = makeSource([folder('a', 'Alpha')], 'a');
    render(<DefaultNoteLocationSetting source={source} />);
    expect(trigger()).toHaveTextContent('Alpha');

    act(() => setFolders([folder('a', 'Renamed')]));
    expect(trigger()).toHaveTextContent('Renamed');
  });

  it('shows Inbox when the chosen folder is no longer offered', () => {
    const { source, setFolders } = makeSource([folder('a', 'Alpha')], 'a');
    render(<DefaultNoteLocationSetting source={source} />);

    act(() => setFolders([]));

    expect(trigger()).toHaveTextContent('Inbox');
    open();
    expect(ticked().map((row) => row.textContent)).toEqual(['Inbox']);
  });

  it('follows the choice being made elsewhere, e.g. another Space\'s profile loading', () => {
    const { source, setSelected } = makeSource([folder('a', 'Alpha')]);
    render(<DefaultNoteLocationSetting source={source} />);
    act(() => setSelected('a'));
    expect(trigger()).toHaveTextContent('Alpha');
  });

  it('works with no source, and with no folders, offering only Inbox', () => {
    const { rerender } = render(<DefaultNoteLocationSetting />);
    expect(trigger()).toHaveTextContent('Inbox');
    open();
    expect(rowLabels()).toEqual(['Inbox']);

    rerender(<DefaultNoteLocationSetting source={makeSource([]).source} />);
    expect(trigger()).toHaveTextContent('Inbox');
  });
});

describe('Settings — Notes page', () => {
  it('shows Default note location in the Sidebar group, above Show, with Show in the same group, above Template', () => {
    render(<Settings noteLocation={makeSource([folder('a', 'Alpha')]).source} />);
    fireEvent.click(screen.getByText('Notes'));

    const groups = Array.from(document.querySelectorAll('.settings-group')).map((group) => ({
      title: group.querySelector('.settings-group__title')?.textContent,
      entries: Array.from(group.querySelectorAll('.settings-entry__title')).map((el) => el.textContent),
    }));
    expect(groups[0]).toEqual({ title: 'Sidebar appearance', entries: ['Default note location', 'Show'] });
    expect(groups[1]?.title).toBe('Template');
  });

  it('is not on the Daily notes page', () => {
    render(<Settings noteLocation={makeSource([]).source} />);
    fireEvent.click(screen.getByText('Daily notes'));
    expect(screen.queryByRole('button', { name: /^Default note location:/ })).toBeNull();
  });
});
