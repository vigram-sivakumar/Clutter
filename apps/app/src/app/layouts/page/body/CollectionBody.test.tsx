// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CollectionBody, sortCollectionEntries } from './CollectionBody';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';

afterEach(() => {
  cleanup();
});

function noteEntry(overrides: Partial<CollectionEntryModel> = {}): CollectionEntryModel {
  return {
    id: 'note-1',
    type: 'note',
    title: 'My note',
    icon: 'note',
    emoji: null,
    selected: false,
    onClick: vi.fn(),
    ...overrides,
  };
}

function folderEntry(overrides: Partial<CollectionEntryModel> = {}): CollectionEntryModel {
  return {
    id: 'folder-1',
    type: 'folder',
    title: 'My Folder',
    icon: 'folder',
    emoji: null,
    selected: false,
    onClick: vi.fn(),
    ...overrides,
  };
}

describe('CollectionBody — List mode (viewMode="list")', () => {
  it('renders a folder as FolderCard and a note as NoteList, both inside a NoteListGrid', () => {
    const { container, getByText } = render(
      <CollectionBody folders={[folderEntry()]} notes={[noteEntry()]} viewMode="list" />
    );

    expect(container.querySelector('.note-list-grid')).toBeInTheDocument();
    expect(getByText('My Folder').closest('.folder-card')).toBeInTheDocument();
    expect(getByText('My note').closest('.note-list')).toBeInTheDocument();
  });

  it('renders a note title verbatim — no Markdown resolution (NoteList has no such slot)', () => {
    const { getByText } = render(
      <CollectionBody notes={[noteEntry({ title: '**Ship** [[Project Alpha]]' })]} viewMode="list" />
    );

    expect(getByText('**Ship** [[Project Alpha]]')).toBeInTheDocument();
  });

  it('clicking a note row fires its onClick', () => {
    const onClick = vi.fn();
    const { getByText } = render(
      <CollectionBody notes={[noteEntry({ onClick })]} viewMode="list" />
    );

    fireEvent.click(getByText('My note').closest('.note-list')!);

    expect(onClick).toHaveBeenCalled();
  });

  it('clicking a folder card fires its onClick', () => {
    const onClick = vi.fn();
    const { getByText } = render(
      <CollectionBody folders={[folderEntry({ onClick })]} viewMode="list" />
    );

    fireEvent.click(getByText('My Folder').closest('.folder-card')!);

    expect(onClick).toHaveBeenCalled();
  });

  it('shows subfolder/note counts on the folder card', () => {
    const { getByText } = render(
      <CollectionBody
        folders={[folderEntry({ subfolderCount: 2, noteCount: 5 })]}
        viewMode="list"
      />
    );

    expect(getByText('2 Subfolders')).toBeInTheDocument();
    expect(getByText('5 Notes')).toBeInTheDocument();
  });

  it('renders an empty collection with no rows and no crash', () => {
    const { container } = render(<CollectionBody folders={[]} notes={[]} viewMode="list" />);

    expect(container.querySelectorAll('.note-list')).toHaveLength(0);
    expect(container.querySelectorAll('.folder-card')).toHaveLength(0);
  });
});

describe('CollectionBody — Table mode (the default)', () => {
  it('defaults to Table when viewMode is omitted', () => {
    const { container } = render(<CollectionBody notes={[noteEntry()]} />);

    expect(container.querySelector('.note-table')).toBeInTheDocument();
    expect(container.querySelector('.note-list-grid')).not.toBeInTheDocument();
  });

  it('renders notes as NoteTableRow rows inside a NoteTable, folders still as FolderCard', () => {
    const { container, getByText } = render(
      <CollectionBody folders={[folderEntry()]} notes={[noteEntry()]} viewMode="table" />
    );

    expect(container.querySelector('.note-table')).toBeInTheDocument();
    expect(getByText('My note').closest('.note-table-row')).toBeInTheDocument();
    // Folders don't switch with viewMode — no folder-specific table row
    // component exists, and FolderCard's row shape doesn't fit NoteTable's
    // grid-column header, so folders stay on FolderGrid/FolderCard.
    expect(getByText('My Folder').closest('.folder-card')).toBeInTheDocument();
    expect(container.querySelector('.folder-grid')).toBeInTheDocument();
  });

  it('clicking a table row fires its onClick', () => {
    const onClick = vi.fn();
    const { getByText } = render(
      <CollectionBody notes={[noteEntry({ onClick })]} viewMode="table" />
    );

    fireEvent.click(getByText('My note').closest('.note-table-row')!);

    expect(onClick).toHaveBeenCalled();
  });

  it('shows created/updated when present on the entry', () => {
    const { getByText } = render(
      <CollectionBody
        notes={[noteEntry({ created: 'Today', updated: 'Yesterday' })]}
        viewMode="table"
      />
    );

    expect(getByText('Today')).toBeInTheDocument();
    expect(getByText('Yesterday')).toBeInTheDocument();
  });
});

describe('CollectionBody — Properties visibility', () => {
  it('defaults to showing description ("No description..." fallback) and created/updated', () => {
    const { getByText } = render(
      <CollectionBody
        notes={[noteEntry({ created: 'Today', updated: 'Yesterday' })]}
        viewMode="table"
      />
    );

    expect(getByText('No description...')).toBeInTheDocument();
    expect(getByText('Today')).toBeInTheDocument();
    expect(getByText('Yesterday')).toBeInTheDocument();
  });

  it('hides description entirely (not just blanked) when unchecked', () => {
    const { queryByText } = render(
      <CollectionBody
        notes={[noteEntry()]}
        viewMode="table"
        properties={{ description: false, lastOpened: true, created: true, updated: true }}
      />
    );

    expect(queryByText('No description...')).not.toBeInTheDocument();
  });

  it('shows a real description when present and checked', () => {
    const { getByText, queryByText } = render(
      <CollectionBody
        notes={[noteEntry({ description: 'A real description' })]}
        viewMode="table"
      />
    );

    expect(getByText('A real description')).toBeInTheDocument();
    expect(queryByText('No description...')).not.toBeInTheDocument();
  });

  it('hides created/updated when unchecked, in both List and Table mode', () => {
    const entry = noteEntry({ created: 'Today', updated: 'Yesterday' });
    const hidden = { description: true, lastOpened: true, created: false, updated: false };

    const table = render(<CollectionBody notes={[entry]} viewMode="table" properties={hidden} />);
    expect(table.queryByText('Today')).not.toBeInTheDocument();
    expect(table.queryByText('Yesterday')).not.toBeInTheDocument();
    table.unmount();

    const list = render(<CollectionBody notes={[entry]} viewMode="list" properties={hidden} />);
    expect(list.queryByText('Today')).not.toBeInTheDocument();
    expect(list.queryByText('Yesterday')).not.toBeInTheDocument();
  });

  it('never affects folder rows — FolderCard has no description/created/updated fields', () => {
    const { getByText } = render(
      <CollectionBody
        folders={[folderEntry({ subfolderCount: 1, noteCount: 2 })]}
        viewMode="table"
        properties={{ description: false, lastOpened: false, created: false, updated: false }}
      />
    );

    expect(getByText('My Folder')).toBeInTheDocument();
    expect(getByText('1 Subfolders')).toBeInTheDocument();
    expect(getByText('2 Notes')).toBeInTheDocument();
  });

  it('Table mode: an unchecked column removes its header cell entirely, not just its row values', () => {
    const { queryByText } = render(
      <CollectionBody
        notes={[noteEntry({ created: 'Today', updated: 'Yesterday' })]}
        viewMode="table"
        properties={{ description: true, lastOpened: true, created: false, updated: true }}
      />
    );

    expect(queryByText('Date created')).not.toBeInTheDocument();
    expect(queryByText('Last opened')).toBeInTheDocument();
    expect(queryByText('Date updated')).toBeInTheDocument();
  });

  it('Table mode: the header and each row share the same narrowed grid-template-columns when columns are hidden', () => {
    const { container } = render(
      <CollectionBody
        notes={[noteEntry({ created: 'Today', updated: 'Yesterday' })]}
        viewMode="table"
        properties={{ description: true, lastOpened: false, created: false, updated: true }}
      />
    );

    const header = container.querySelector('.note-table__header') as HTMLElement;
    const row = container.querySelector('.note-table-row') as HTMLElement;

    // Name + only the one visible optional column (Updated) — Last
    // opened/Created contribute no track at all, so the remaining
    // columns reflow rather than leaving reserved empty space.
    expect(header.style.gridTemplateColumns).toBe('minmax(400px, 1fr) 140px');
    expect(row.style.gridTemplateColumns).toBe(header.style.gridTemplateColumns);
  });

  it('Table mode: all columns hidden leaves only the Name column, on both header and row', () => {
    const { container } = render(
      <CollectionBody
        notes={[noteEntry()]}
        viewMode="table"
        properties={{ description: false, lastOpened: false, created: false, updated: false }}
      />
    );

    const header = container.querySelector('.note-table__header') as HTMLElement;
    const row = container.querySelector('.note-table-row') as HTMLElement;

    expect(header.style.gridTemplateColumns).toBe('minmax(400px, 1fr)');
    expect(row.style.gridTemplateColumns).toBe('minmax(400px, 1fr)');
    expect(header.querySelectorAll('.note-table__header-cell')).toHaveLength(1);
  });
});

describe('sortCollectionEntries', () => {
  const charlie = noteEntry({ id: 'c', title: 'Charlie', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z' });
  const alpha = noteEntry({ id: 'a', title: 'Alpha', createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
  const bravo = noteEntry({ id: 'b', title: 'Bravo', createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' });

  it('sorts by name, down = A→Z', () => {
    const sorted = sortCollectionEntries([charlie, alpha, bravo], { key: 'name', direction: 'down' });
    expect(sorted.map((e) => e.title)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('sorts by name, up = Z→A', () => {
    const sorted = sortCollectionEntries([charlie, alpha, bravo], { key: 'name', direction: 'up' });
    expect(sorted.map((e) => e.title)).toEqual(['Charlie', 'Bravo', 'Alpha']);
  });

  it('sorts by created, down = newest first', () => {
    const sorted = sortCollectionEntries([charlie, alpha, bravo], { key: 'created', direction: 'down' });
    expect(sorted.map((e) => e.title)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('sorts by created, up = oldest first', () => {
    const sorted = sortCollectionEntries([charlie, alpha, bravo], { key: 'created', direction: 'up' });
    expect(sorted.map((e) => e.title)).toEqual(['Charlie', 'Bravo', 'Alpha']);
  });

  it('sorts by updated, down = newest first', () => {
    const sorted = sortCollectionEntries([charlie, alpha, bravo], { key: 'updated', direction: 'down' });
    expect(sorted.map((e) => e.title)).toEqual(['Charlie', 'Bravo', 'Alpha']);
  });

  it('an entry missing the sorted date field always sorts last, regardless of direction', () => {
    const noDate = noteEntry({ id: 'n', title: 'NoDate' });
    const down = sortCollectionEntries([noDate, alpha], { key: 'created', direction: 'down' });
    const up = sortCollectionEntries([noDate, alpha], { key: 'created', direction: 'up' });
    expect(down[down.length - 1]!.title).toBe('NoDate');
    expect(up[up.length - 1]!.title).toBe('NoDate');
  });

  it('lastOpened has no backing field, so sorting by it is a stable no-op', () => {
    const input = [charlie, alpha, bravo];
    const sorted = sortCollectionEntries(input, { key: 'lastOpened', direction: 'down' });
    expect(sorted.map((e) => e.title)).toEqual(input.map((e) => e.title));
  });

  it('never mutates the input array', () => {
    const input = [charlie, alpha, bravo];
    const snapshot = [...input];
    sortCollectionEntries(input, { key: 'name', direction: 'down' });
    expect(input).toEqual(snapshot);
  });

  it('CollectionBody renders notes in the requested sort order', () => {
    const { container } = render(
      <CollectionBody
        notes={[charlie, alpha, bravo]}
        viewMode="table"
        sort={{ key: 'name', direction: 'down' }}
      />
    );

    const titles = [...container.querySelectorAll('.note-table-row__entry .collection-entry__title')].map(
      (el) => el.textContent
    );
    expect(titles).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });
});
