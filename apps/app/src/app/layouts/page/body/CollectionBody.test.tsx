// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CollectionBody } from './CollectionBody';
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

describe('CollectionBody — List mode (default)', () => {
  it('renders a folder as FolderCard and a note as NoteList, both inside a NoteListGrid', () => {
    const { container, getByText } = render(
      <CollectionBody folders={[folderEntry()]} notes={[noteEntry()]} />
    );

    expect(container.querySelector('.note-list-grid')).toBeInTheDocument();
    expect(getByText('My Folder').closest('.folder-card')).toBeInTheDocument();
    expect(getByText('My note').closest('.note-list')).toBeInTheDocument();
  });

  it('renders a note title verbatim — no Markdown resolution (NoteList has no such slot)', () => {
    const { getByText } = render(
      <CollectionBody notes={[noteEntry({ title: '**Ship** [[Project Alpha]]' })]} />
    );

    expect(getByText('**Ship** [[Project Alpha]]')).toBeInTheDocument();
  });

  it('clicking a note row fires its onClick', () => {
    const onClick = vi.fn();
    const { getByText } = render(<CollectionBody notes={[noteEntry({ onClick })]} />);

    fireEvent.click(getByText('My note').closest('.note-list')!);

    expect(onClick).toHaveBeenCalled();
  });

  it('clicking a folder card fires its onClick', () => {
    const onClick = vi.fn();
    const { getByText } = render(<CollectionBody folders={[folderEntry({ onClick })]} />);

    fireEvent.click(getByText('My Folder').closest('.folder-card')!);

    expect(onClick).toHaveBeenCalled();
  });

  it('shows subfolder/note counts on the folder card', () => {
    const { getByText } = render(
      <CollectionBody folders={[folderEntry({ subfolderCount: 2, noteCount: 5 })]} />
    );

    expect(getByText('2 Subfolders')).toBeInTheDocument();
    expect(getByText('5 Notes')).toBeInTheDocument();
  });

  it('renders an empty collection with no rows and no crash', () => {
    const { container } = render(<CollectionBody folders={[]} notes={[]} />);

    expect(container.querySelectorAll('.note-list')).toHaveLength(0);
    expect(container.querySelectorAll('.folder-card')).toHaveLength(0);
  });
});

describe('CollectionBody — Table mode', () => {
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
