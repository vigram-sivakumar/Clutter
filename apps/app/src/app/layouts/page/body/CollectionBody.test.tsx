// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CollectionBody,
  DEFAULT_COLLECTION_PROPERTY_VISIBILITY,
  sortCollectionEntries,
} from './CollectionBody';
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
  it('renders a folder as a generic card and a note as a generic list row, inside the generic list', () => {
    const { container, getByText } = render(
      <CollectionBody folders={[folderEntry()]} notes={[noteEntry()]} viewMode="list" />
    );

    expect(container.querySelector('.collection-list')).toBeInTheDocument();
    expect(getByText('My Folder').closest('.collection-card')).toBeInTheDocument();
    expect(getByText('My note').closest('.collection-row')).toBeInTheDocument();
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

    fireEvent.click(getByText('My note').closest('.collection-row')!);

    expect(onClick).toHaveBeenCalled();
  });

  it('clicking a folder card fires its onClick', () => {
    const onClick = vi.fn();
    const { getByText } = render(
      <CollectionBody folders={[folderEntry({ onClick })]} viewMode="list" />
    );

    fireEvent.click(getByText('My Folder').closest('.collection-card')!);

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

    expect(container.querySelectorAll('.collection-row')).toHaveLength(0);
    expect(container.querySelectorAll('.collection-card')).toHaveLength(0);
  });
});

describe('CollectionBody — Table mode (the default)', () => {
  it('defaults to Table when viewMode is omitted', () => {
    const { container } = render(<CollectionBody notes={[noteEntry()]} />);

    expect(container.querySelector('.collection-table')).toBeInTheDocument();
    expect(container.querySelector('.collection-list')).not.toBeInTheDocument();
  });

  it('renders notes as rows of the generic table, folders still as cards', () => {
    const { container, getByText } = render(
      <CollectionBody folders={[folderEntry()]} notes={[noteEntry()]} viewMode="table" />
    );

    expect(container.querySelector('.collection-table')).toBeInTheDocument();
    expect(getByText('My note').closest('.collection-table-row')).toBeInTheDocument();
    // Folders don't switch with viewMode — they have no table columns'
    // worth of data, so they stay as cards in their grid.
    expect(getByText('My Folder').closest('.collection-card')).toBeInTheDocument();
    expect(container.querySelector('.collection-grid')).toBeInTheDocument();
  });

  it('draws every note\'s name and dates with the generic header and date cells', () => {
    const { container } = render(
      <CollectionBody notes={[noteEntry({ created: 'Today', updated: 'Yesterday' })]} viewMode="table" />
    );

    const row = container.querySelector('.collection-table-row')!;
    expect(row.querySelector('.collection-table-cell--header.collection-table-cell--header')).not.toBeNull();
    expect(row.querySelectorAll('.collection-table-cell--text')).toHaveLength(2);
    expect(row.querySelector('.collection-table-row__created')).toHaveTextContent('Today');
    expect(row.querySelector('.collection-table-row__updated')).toHaveTextContent('Yesterday');
  });

  it('ends the table with a "New Note" row that fires onCreateNote — even with no notes', () => {
    const onCreateNote = vi.fn();
    const { container, getByText } = render(
      <CollectionBody notes={[]} viewMode="table" onCreateNote={onCreateNote} />
    );

    const row = getByText('New Note').closest('.collection-table-row--new-item')!;
    expect(container.querySelector('.collection-table__body')!.lastElementChild).toBe(row);

    fireEvent.click(row);
    expect(onCreateNote).toHaveBeenCalledTimes(1);
  });

  it('clicking a table row fires its onClick', () => {
    const onClick = vi.fn();
    const { getByText } = render(
      <CollectionBody notes={[noteEntry({ onClick })]} viewMode="table" />
    );

    fireEvent.click(getByText('My note').closest('.collection-table-row')!);

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

describe('CollectionBody — Card mode (viewMode="card")', () => {
  it('renders notes as generic cards inside the generic grid, folders still as cards', () => {
    const { container, getByText } = render(
      <CollectionBody folders={[folderEntry()]} notes={[noteEntry()]} viewMode="card" />
    );

    expect(container.querySelector('.collection-grid')).toBeInTheDocument();
    expect(container.querySelector('.collection-list')).not.toBeInTheDocument();
    expect(container.querySelector('.collection-table')).not.toBeInTheDocument();
    expect(getByText('My note').closest('.collection-card')).toBeInTheDocument();
    expect(getByText('My Folder').closest('.collection-card')).toBeInTheDocument();
  });

  it('clicking a card fires that note\'s own onClick', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { getByText } = render(
      <CollectionBody
        notes={[
          noteEntry({ id: 'a', title: 'First', onClick: first }),
          noteEntry({ id: 'b', title: 'Second', onClick: second }),
        ]}
        viewMode="card"
      />
    );

    fireEvent.click(getByText('Second').closest('.collection-card')!);

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('shows only the edited date in the card header, gated by the Last edited property', () => {
    const entry = noteEntry({ created: 'Today', updated: '12 Aug 2026' });
    const { getByText, queryByText, rerender } = render(
      <CollectionBody notes={[entry]} viewMode="card" />
    );
    expect(getByText('Edited 12 Aug 2026')).toBeInTheDocument();
    expect(queryByText(/Today|Created/)).not.toBeInTheDocument();

    rerender(
      <CollectionBody
        notes={[entry]}
        viewMode="card"
        properties={{ ...DEFAULT_COLLECTION_PROPERTY_VISIBILITY, updated: false }}
      />
    );
    expect(queryByText(/Edited/)).not.toBeInTheDocument();
  });

  it('shows the description above the edited date, gated by the Description property', () => {
    const entry = noteEntry({ description: 'About this note', updated: '12 Aug 2026' });
    const { container, getByText, queryByText, rerender } = render(
      <CollectionBody notes={[entry]} viewMode="card" />
    );
    const lines = () =>
      [...container.querySelectorAll('.collection-card .card-title-section__description, .collection-card .card-title-section__metadata-item')].map((l) => l.textContent);
    expect(lines()).toEqual(['About this note', 'Edited 12 Aug 2026']);

    rerender(<CollectionBody notes={[noteEntry({ updated: '12 Aug 2026' })]} viewMode="card" />);
    expect(lines()).toEqual(['Edited 12 Aug 2026']);

    rerender(
      <CollectionBody
        notes={[entry]}
        viewMode="card"
        properties={{ ...DEFAULT_COLLECTION_PROPERTY_VISIBILITY, description: false }}
      />
    );
    expect(queryByText('About this note')).not.toBeInTheDocument();
    expect(getByText('Edited 12 Aug 2026')).toBeInTheDocument();
  });

  describe('Cover and content', () => {
    const entry = () =>
      noteEntry({ markdown: '# Heading\n\nbody', cover: 'Assets/hero.png', coverPositionAbove: 30 });
    const resolvers = { resolveCoverImage: (c: string) => `app://vault/${c}` };
    const renderCard = (properties = DEFAULT_COLLECTION_PROPERTY_VISIBILITY) =>
      render(
        <CollectionBody notes={[entry()]} viewMode="card" properties={properties} previewResolvers={resolvers} />
      ).container;

    it('a card always shows the cover and the content, together on one page canvas', () => {
      const container = renderCard();

      expect(container.querySelector('.note-page-canvas__page .note-page-canvas__cover')).toBeInTheDocument();
      expect(container.querySelector('.note-page-canvas h1')?.textContent).toBe('Heading');
    });

    it('ignores the Cover image / Content preview properties (no longer offered for cards), even from a saved view config', () => {
      const container = renderCard({ ...DEFAULT_COLLECTION_PROPERTY_VISIBILITY, cover: false, preview: false });

      expect(container.querySelector('.note-page-canvas__cover')).toBeInTheDocument();
      expect(container.querySelector('.note-page-canvas h1')?.textContent).toBe('Heading');
    });

    it('only the trailing empty card has no canvas; a note card always has one', () => {
      const container = render(
        <CollectionBody notes={[entry()]} viewMode="card" onCreateNote={() => {}} previewResolvers={resolvers} />
      ).container;

      const cards = [...container.querySelectorAll('.collection-card')];
      expect(cards).toHaveLength(2);
      expect(cards[0]).not.toHaveClass('collection-card--empty');
      expect(cards[0]!.querySelector('.note-page-canvas')).toBeInTheDocument();
      expect(cards[1]).toHaveClass('collection-card--empty');
      expect(cards[1]!.querySelector('.note-page-canvas')).toBeNull();
    });

    it('does not affect List or Table', () => {
      for (const viewMode of ['list', 'table'] as const) {
        const { getByText } = render(
          <CollectionBody
            notes={[entry()]}
            viewMode={viewMode}
            properties={{ ...DEFAULT_COLLECTION_PROPERTY_VISIBILITY, cover: false, preview: false }}
          />
        );
        expect(getByText('My note')).toBeInTheDocument();
        cleanup();
      }
    });
  });

  it('passes the entry markdown to the preview (live EffectivePage.markdown), not the title', () => {
    const { container } = render(
      <CollectionBody
        notes={[noteEntry({ markdown: '# Live heading\n\nbody text' })]}
        viewMode="card"
      />
    );

    expect(container.querySelector('.note-page-canvas h1')?.textContent).toBe('Live heading');
  });

  it('appends a New Note card only once there is a note, and it fires onCreateNote', () => {
    const onCreateNote = vi.fn();
    const empty = render(<CollectionBody notes={[]} viewMode="card" onCreateNote={onCreateNote} />);
    expect(empty.queryByLabelText('New Note')).not.toBeInTheDocument();
    cleanup();

    const { getByLabelText } = render(
      <CollectionBody notes={[noteEntry()]} viewMode="card" onCreateNote={onCreateNote} />
    );
    const newCard = getByLabelText('New Note');
    expect(newCard).toBeInTheDocument();
    expect(newCard).toHaveClass('collection-card--empty');
    // Same shell and shape as every other card, but empty: just a centred "+" — no header, no canvas.
    expect(newCard.querySelector('.collection-card__header')).not.toBeInTheDocument();
    expect(newCard.querySelector('.note-page-canvas')).not.toBeInTheDocument();
    expect(newCard.querySelector('.app-icon svg')).toBeInTheDocument();

    fireEvent.click(newCard);
    expect(onCreateNote).toHaveBeenCalledTimes(1);
  });

  it('List and Table modes never render a card or a preview', () => {
    for (const viewMode of ['list', 'table'] as const) {
      const { container } = render(
        <CollectionBody notes={[noteEntry({ markdown: '# x' })]} viewMode={viewMode} />
      );
      expect(container.querySelector('.collection-card')).not.toBeInTheDocument();
      expect(container.querySelector('.note-page-canvas')).not.toBeInTheDocument();
      cleanup();
    }
  });
});

describe('CollectionBody — Properties visibility', () => {
  it('defaults to showing description ("No description" fallback) and created/updated', () => {
    const { getByText } = render(
      <CollectionBody
        notes={[noteEntry({ created: 'Today', updated: 'Yesterday' })]}
        viewMode="table"
      />
    );

    expect(getByText('No description')).toBeInTheDocument();
    expect(getByText('Today')).toBeInTheDocument();
    expect(getByText('Yesterday')).toBeInTheDocument();
  });

  it('hides description entirely (not just blanked) when unchecked', () => {
    const { queryByText } = render(
      <CollectionBody
        notes={[noteEntry()]}
        viewMode="table"
        properties={{ description: false, created: true, updated: true, archived: true, cover: true, preview: true, title: true, size: true }}
      />
    );

    expect(queryByText('No description')).not.toBeInTheDocument();
  });

  it('shows a real description when present and checked', () => {
    const { getByText, queryByText } = render(
      <CollectionBody
        notes={[noteEntry({ description: 'A real description' })]}
        viewMode="table"
      />
    );

    expect(getByText('A real description')).toBeInTheDocument();
    expect(queryByText('No description')).not.toBeInTheDocument();
  });

  it('hides created/updated when unchecked, in both List and Table mode', () => {
    const entry = noteEntry({ created: 'Today', updated: 'Yesterday' });
    const hidden = { description: true, created: false, updated: false, archived: true, cover: true, preview: true, title: true, size: true };

    const table = render(<CollectionBody notes={[entry]} viewMode="table" properties={hidden} />);
    expect(table.queryByText('Today')).not.toBeInTheDocument();
    expect(table.queryByText('Yesterday')).not.toBeInTheDocument();
    table.unmount();

    const list = render(<CollectionBody notes={[entry]} viewMode="list" properties={hidden} />);
    expect(list.queryByText('Today')).not.toBeInTheDocument();
    expect(list.queryByText('Yesterday')).not.toBeInTheDocument();
  });

  it('never affects folder cards — they have no description/created/updated fields', () => {
    const { getByText } = render(
      <CollectionBody
        folders={[folderEntry({ subfolderCount: 1, noteCount: 2 })]}
        viewMode="table"
        properties={{ description: false, created: false, updated: false, archived: true, cover: true, preview: true, title: true, size: true }}
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
        properties={{ description: true, created: false, updated: true, archived: true, cover: true, preview: true, title: true, size: true }}
      />
    );

    expect(queryByText('Created')).not.toBeInTheDocument();
    expect(queryByText('Last edited')).toBeInTheDocument();
  });

  it('Table mode: the header and each row share the same narrowed grid-template-columns when columns are hidden', () => {
    const { container } = render(
      <CollectionBody
        notes={[noteEntry({ created: 'Today', updated: 'Yesterday' })]}
        viewMode="table"
        properties={{ description: true, created: false, updated: true, archived: true, cover: true, preview: true, title: true, size: true }}
      />
    );

    const header = container.querySelector('.collection-table__header') as HTMLElement;
    const row = container.querySelector('.collection-table-row') as HTMLElement;

    // Name + only the one visible optional column (Last edited) — Last
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
        properties={{ description: false, created: false, updated: false, archived: true, cover: true, preview: true, title: true, size: true }}
      />
    );

    const header = container.querySelector('.collection-table__header') as HTMLElement;
    const row = container.querySelector('.collection-table-row') as HTMLElement;

    expect(header.style.gridTemplateColumns).toBe('minmax(400px, 1fr)');
    expect(row.style.gridTemplateColumns).toBe('minmax(400px, 1fr)');
    expect(header.querySelectorAll('.collection-table__header-cell')).toHaveLength(1);
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

  describe('the other Properties — Sort by is the Properties list', () => {
    const described = (title: string, description?: string, cover?: string, coverHidden?: boolean) =>
      noteEntry({ id: title, title, description, cover, coverHidden });
    const [x, y, z] = [described('X', 'banana'), described('Y', 'apple'), described('Z')];

    it('Description: down = A→Z, up = Z→A; a note without one always sorts last', () => {
      expect(sortCollectionEntries([x, z, y], { key: 'description', direction: 'down' }).map((e) => e.title)).toEqual(['Y', 'X', 'Z']);
      expect(sortCollectionEntries([x, z, y], { key: 'description', direction: 'up' }).map((e) => e.title)).toEqual(['X', 'Y', 'Z']);
    });

    it('Cover image: down puts the notes that show a cover first (a hidden cover does not count); ties keep name order', () => {
      const withCover = described('B', undefined, 'Assets/b.png');
      const hidden = described('C', undefined, 'Assets/c.png', true);
      const none = described('A');
      const another = described('D', undefined, 'Assets/d.png');

      expect(sortCollectionEntries([none, hidden, another, withCover], { key: 'cover', direction: 'down' }).map((e) => e.title)).toEqual([
        'B',
        'D',
        'A',
        'C',
      ]);
      expect(sortCollectionEntries([none, hidden, another, withCover], { key: 'cover', direction: 'up' }).map((e) => e.title)).toEqual([
        'A',
        'C',
        'B',
        'D',
      ]);
    });

    it('File size is no property of a note, so it leaves the order as given', () => {
      expect(sortCollectionEntries([x, z, y], { key: 'size', direction: 'down' }).map((e) => e.title)).toEqual(['X', 'Z', 'Y']);
    });
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

    const titles = [...container.querySelectorAll('.collection-table-cell--header .collection-row__title')].map(
      (el) => el.textContent
    );
    expect(titles).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });
});

describe('CollectionBody: Archived column is Archive-only', () => {
  it('table mode never renders an Archived column in an ordinary collection', () => {
    const { container } = render(
      <CollectionBody
        notes={[noteEntry({ archived: 'Today' })]}
        viewMode="table"
        properties={DEFAULT_COLLECTION_PROPERTY_VISIBILITY}
      />
    );

    expect(container.querySelector('.collection-table__header-cell--archived')).not.toBeInTheDocument();
  });
});

describe('CollectionBody — showNotes', () => {
  it('shows the notes section by default, in every view mode', () => {
    for (const viewMode of ['list', 'table', 'card'] as const) {
      const { getByText, unmount } = render(
        <CollectionBody folders={[folderEntry()]} notes={[noteEntry()]} viewMode={viewMode} />
      );
      expect(getByText('My note')).toBeInTheDocument();
      unmount();
    }
  });

  it('leaves the notes section out entirely when showNotes is false — folders only', () => {
    for (const viewMode of ['list', 'table', 'card'] as const) {
      const { getByText, queryByText, container, unmount } = render(
        <CollectionBody folders={[folderEntry()]} notes={[noteEntry()]} viewMode={viewMode} showNotes={false} />
      );
      expect(getByText('My Folder')).toBeInTheDocument();
      expect(queryByText('My note')).not.toBeInTheDocument();
      expect(queryByText('New Note')).not.toBeInTheDocument();
      expect(container.querySelector('.collection-table')).not.toBeInTheDocument();
      unmount();
    }
  });
});

describe('CollectionBody — foldersInGivenOrder', () => {
  const folders = [
    folderEntry({ id: 'a', title: '2024' }),
    folderEntry({ id: 'b', title: '2026' }),
    folderEntry({ id: 'c', title: '2025' }),
  ];
  const titles = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('.collection-card .card-title-section__title')).map((title) => title.textContent);

  it('sorts folders by the Configure menu\'s sort by default (name, ascending here)', () => {
    const { container } = render(
      <CollectionBody folders={folders} viewMode="list" sort={{ key: 'name', direction: 'down' }} />
    );
    expect(titles(container)).toEqual(['2024', '2025', '2026']);
  });

  it('draws them exactly in the order given when foldersInGivenOrder is set, whatever the sort says', () => {
    const given = [folders[1]!, folders[2]!, folders[0]!];
    for (const direction of ['down', 'up'] as const) {
      const { container, unmount } = render(
        <CollectionBody folders={given} viewMode="list" sort={{ key: 'name', direction }} foldersInGivenOrder />
      );
      expect(titles(container)).toEqual(['2026', '2025', '2024']);
      unmount();
    }
  });
});

describe('CollectionBody — no create actions when none are given', () => {
  it('shows neither the create-folder card nor a New Note row without onCreateFolder / onCreateNote', () => {
    const { container, queryByText } = render(
      <CollectionBody folders={[folderEntry()]} notes={[noteEntry()]} viewMode="list" />
    );
    expect(container.querySelector('.collection-card--empty')).not.toBeInTheDocument();
    expect(queryByText('New Note')).not.toBeInTheDocument();
  });
});

