// @vitest-environment jsdom

import { noteVisible } from '@features/collection/testing/visibleProperties';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CollectionBody,
  NOTE_SORT_OPTIONS,
} from './CollectionBody';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';
import { folderEntry, noteEntry } from '@features/collection/testing/collectionEntry';
import { formatEntryTimestamp } from '@features/collection/properties/formatProperty';
import { sortEntries, type CollectionSort } from '@core/properties/collectionSort';

afterEach(() => {
  cleanup();
});

// An entry's dates are ISO instants (the raw property value); the text a layout shows is the formatter's.
const CREATED_AT = '2026-08-10T09:03:00.000Z';
const UPDATED_AT = '2026-08-12T14:20:00.000Z';
const CREATED_TEXT = formatEntryTimestamp(CREATED_AT)!;
const UPDATED_TEXT = formatEntryTimestamp(UPDATED_AT)!;

/** The notes collections' sorter, with the tie-breaks they have always had. */
const sortNotes = (entries: readonly CollectionEntryModel[], sort: CollectionSort) =>
  sortEntries(entries, sort, NOTE_SORT_OPTIONS);

describe('CollectionBody — List mode (viewMode="list")', () => {
  it('renders a folder as a generic card and a note as a generic list row, inside the generic list', () => {
    const { container, getByText } = render(
      <CollectionBody folders={[folderEntry()]} notes={[noteEntry()]} viewMode="list" />
    );

    expect(container.querySelector('.collection-list')).toBeInTheDocument();
    expect(getByText('My Folder').closest('.collection-card')).toBeInTheDocument();
    expect(getByText('My note').closest('.collection-entry')).toBeInTheDocument();
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

    fireEvent.click(getByText('My note').closest('.collection-entry')!);

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

    expect(container.querySelectorAll('.collection-entry')).toHaveLength(0);
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
      <CollectionBody notes={[noteEntry({ created: CREATED_AT, updated: UPDATED_AT })]} viewMode="table" />
    );

    const row = container.querySelector('.collection-table-row')!;
    expect(row.querySelector('.collection-table-cell--header.collection-table-cell--header')).not.toBeNull();
    expect(row.querySelectorAll('.collection-table-cell--text')).toHaveLength(2);
    expect(row.querySelector('.collection-table-row__created')).toHaveTextContent(CREATED_TEXT);
    expect(row.querySelector('.collection-table-row__updated')).toHaveTextContent(UPDATED_TEXT);
  });

  it('ends the table with a "Create" row that fires onCreate', () => {
    const onCreate = vi.fn();
    const { container, getByText } = render(
      <CollectionBody notes={[noteEntry()]} viewMode="table" onCreate={onCreate} />
    );

    const row = getByText('Create').closest('.collection-table-row--new-item')!;
    expect(container.querySelector('.collection-table__body')!.lastElementChild).toBe(row);

    fireEvent.click(row);
    expect(onCreate).toHaveBeenCalledTimes(1);
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
        notes={[noteEntry({ created: CREATED_AT, updated: UPDATED_AT })]}
        viewMode="table"
      />
    );

    expect(getByText(CREATED_TEXT)).toBeInTheDocument();
    expect(getByText(UPDATED_TEXT)).toBeInTheDocument();
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
    const entry = noteEntry({ created: 'Today', updated: UPDATED_AT });
    const { getByText, queryByText, rerender } = render(
      <CollectionBody notes={[entry]} viewMode="card" />
    );
    expect(getByText(`Edited ${UPDATED_TEXT}`)).toBeInTheDocument();
    expect(queryByText(CREATED_TEXT)).not.toBeInTheDocument();

    rerender(
      <CollectionBody
        notes={[entry]}
        viewMode="card"
        visible={noteVisible('updated')}
      />
    );
    expect(queryByText(/Edited/)).not.toBeInTheDocument();
  });

  it('shows the description above the edited date, gated by the Description property', () => {
    const entry = noteEntry({ description: 'About this note', updated: UPDATED_AT });
    const { container, getByText, queryByText, rerender } = render(
      <CollectionBody notes={[entry]} viewMode="card" />
    );
    const lines = () =>
      [...container.querySelectorAll('.collection-card .card-title-section__description, .collection-card .card-title-section__metadata-item')].map((l) => l.textContent);
    expect(lines()).toEqual(['About this note', `Edited ${UPDATED_TEXT}`]);

    rerender(<CollectionBody notes={[noteEntry({ updated: UPDATED_AT })]} viewMode="card" />);
    expect(lines()).toEqual([`Edited ${UPDATED_TEXT}`]);

    rerender(
      <CollectionBody
        notes={[entry]}
        viewMode="card"
        visible={noteVisible('description')}
      />
    );
    expect(queryByText('About this note')).not.toBeInTheDocument();
    expect(getByText(`Edited ${UPDATED_TEXT}`)).toBeInTheDocument();
  });

  describe('Cover and content', () => {
    const entry = () =>
      noteEntry({ markdown: '# Heading\n\nbody', cover: 'Assets/hero.png', coverPositionAbove: 30 });
    const resolvers = { resolveCoverImage: (c: string) => `app://vault/${c}` };
    const renderCard = (visible = noteVisible()) =>
      render(
        <CollectionBody notes={[entry()]} viewMode="card" visible={visible} previewResolvers={resolvers} />
      ).container;

    it('a card always shows the cover and the content, together on one page canvas', () => {
      const container = renderCard();

      expect(container.querySelector('.note-page-canvas__page .note-page-canvas__cover')).toBeInTheDocument();
      expect(container.querySelector('.note-page-canvas h1')?.textContent).toBe('Heading');
    });

    it('ignores the Cover image / Content preview properties (no longer offered for cards), even from a saved view config', () => {
      const container = renderCard(noteVisible('cover'));

      expect(container.querySelector('.note-page-canvas__cover')).toBeInTheDocument();
      expect(container.querySelector('.note-page-canvas h1')?.textContent).toBe('Heading');
    });

    it('only the trailing empty card has no canvas; a note card always has one', () => {
      const container = render(
        <CollectionBody notes={[entry()]} viewMode="card" onCreate={() => {}} previewResolvers={resolvers} />
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
            visible={noteVisible('cover')}
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

  it('appends a Create card after the notes, and it fires onCreate (an empty collection shows the empty state instead)', () => {
    const onCreate = vi.fn();
    const empty = render(<CollectionBody notes={[]} viewMode="card" onCreate={onCreate} />);
    expect(empty.queryByLabelText('Create')).not.toBeInTheDocument();
    expect(empty.getByRole('status')).toBeInTheDocument();
    cleanup();

    const { getByLabelText } = render(
      <CollectionBody notes={[noteEntry()]} viewMode="card" onCreate={onCreate} />
    );
    const newCard = getByLabelText('Create');
    expect(newCard).toBeInTheDocument();
    expect(newCard).toHaveClass('collection-card--empty');
    // Same shell and shape as every other card, but empty: just a centred "+" — no header, no canvas.
    expect(newCard.querySelector('.collection-card__header')).not.toBeInTheDocument();
    expect(newCard.querySelector('.note-page-canvas')).not.toBeInTheDocument();
    expect(newCard.querySelector('.app-icon svg')).toBeInTheDocument();

    fireEvent.click(newCard);
    expect(onCreate).toHaveBeenCalledTimes(1);
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
  it('defaults to showing created/updated, with no "No description" fallback for an empty description', () => {
    const { getByText, queryByText } = render(
      <CollectionBody
        notes={[noteEntry({ created: CREATED_AT, updated: UPDATED_AT })]}
        viewMode="table"
      />
    );

    expect(queryByText('No description')).not.toBeInTheDocument();
    expect(getByText(CREATED_TEXT)).toBeInTheDocument();
    expect(getByText(UPDATED_TEXT)).toBeInTheDocument();
  });

  it('hides description entirely (not just blanked) when unchecked', () => {
    const { queryByText } = render(
      <CollectionBody
        notes={[noteEntry()]}
        viewMode="table"
        visible={noteVisible('description')}
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
    const entry = noteEntry({ created: CREATED_AT, updated: UPDATED_AT });
    const hidden = noteVisible('created', 'updated');

    const table = render(<CollectionBody notes={[entry]} viewMode="table" visible={hidden} />);
    expect(table.queryByText(CREATED_TEXT)).not.toBeInTheDocument();
    expect(table.queryByText(UPDATED_TEXT)).not.toBeInTheDocument();
    table.unmount();

    const list = render(<CollectionBody notes={[entry]} viewMode="list" visible={hidden} />);
    expect(list.queryByText(CREATED_TEXT)).not.toBeInTheDocument();
    expect(list.queryByText(UPDATED_TEXT)).not.toBeInTheDocument();
  });

  it('never affects folder cards — they have no description/created/updated fields', () => {
    const { getByText } = render(
      <CollectionBody
        folders={[folderEntry({ subfolderCount: 1, noteCount: 2 })]}
        viewMode="table"
        visible={noteVisible('description', 'created', 'updated')}
      />
    );

    expect(getByText('My Folder')).toBeInTheDocument();
    expect(getByText('1 Subfolders')).toBeInTheDocument();
    expect(getByText('2 Notes')).toBeInTheDocument();
  });

  it('Table mode: an unchecked column removes its header cell entirely, not just its row values', () => {
    const { queryByText } = render(
      <CollectionBody
        notes={[noteEntry({ created: CREATED_AT, updated: UPDATED_AT })]}
        viewMode="table"
        visible={noteVisible('created')}
      />
    );

    expect(queryByText('Created')).not.toBeInTheDocument();
    expect(queryByText('Last edited')).toBeInTheDocument();
  });

  it('Table mode: the one table grid is narrowed when columns are hidden (the header and rows are subgrids of it)', () => {
    const { container } = render(
      <CollectionBody
        notes={[noteEntry({ created: CREATED_AT, updated: UPDATED_AT })]}
        viewMode="table"
        visible={noteVisible('created')}
      />
    );

    const table = container.querySelector('.collection-table') as HTMLElement;

    // Name + only the one visible optional column (Last edited, a date: sized by its content) — Last
    // opened/Created contribute no track at all, so the remaining
    // columns reflow rather than leaving reserved empty space.
    expect(table.style.gridTemplateColumns).toBe('minmax(400px, 1fr) max-content');
  });

  it('Table mode: all columns hidden leaves only the Name column', () => {
    const { container } = render(
      <CollectionBody
        notes={[noteEntry()]}
        viewMode="table"
        visible={noteVisible('description', 'created', 'updated')}
      />
    );

    const table = container.querySelector('.collection-table') as HTMLElement;
    const header = container.querySelector('.collection-table__header') as HTMLElement;

    expect(table.style.gridTemplateColumns).toBe('minmax(400px, 1fr)');
    expect(header.querySelectorAll('.collection-table__header-cell')).toHaveLength(1);
  });
});

describe('sorting notes (sortEntries with the notes\' tie-breaks)', () => {
  const charlie = noteEntry({ id: 'c', title: 'Charlie', created: '2026-01-01T00:00:00.000Z', updated: '2026-03-01T00:00:00.000Z' });
  const alpha = noteEntry({ id: 'a', title: 'Alpha', created: '2026-03-01T00:00:00.000Z', updated: '2026-01-01T00:00:00.000Z' });
  const bravo = noteEntry({ id: 'b', title: 'Bravo', created: '2026-02-01T00:00:00.000Z', updated: '2026-02-01T00:00:00.000Z' });

  it('sorts by name, down = A→Z', () => {
    const sorted = sortNotes([charlie, alpha, bravo], { property: 'name', direction: 'down' });
    expect(sorted.map((e) => e.values.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('sorts by name, up = Z→A', () => {
    const sorted = sortNotes([charlie, alpha, bravo], { property: 'name', direction: 'up' });
    expect(sorted.map((e) => e.values.name)).toEqual(['Charlie', 'Bravo', 'Alpha']);
  });

  it('sorts by created, down = newest first', () => {
    const sorted = sortNotes([charlie, alpha, bravo], { property: 'created', direction: 'down' });
    expect(sorted.map((e) => e.values.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('sorts by created, up = oldest first', () => {
    const sorted = sortNotes([charlie, alpha, bravo], { property: 'created', direction: 'up' });
    expect(sorted.map((e) => e.values.name)).toEqual(['Charlie', 'Bravo', 'Alpha']);
  });

  describe('the other Properties — Sort by is the Properties list', () => {
    const described = (title: string, description?: string, cover?: string, coverHidden?: boolean) =>
      noteEntry({ id: title, title, description, cover: coverHidden ? undefined : cover });
    const [x, y, z] = [described('X', 'banana'), described('Y', 'apple'), described('Z')];

    it('Description: down = A→Z, up = Z→A; a note without one always sorts last', () => {
      expect(sortNotes([x, z, y], { property: 'description', direction: 'down' }).map((e) => e.values.name)).toEqual(['Y', 'X', 'Z']);
      expect(sortNotes([x, z, y], { property: 'description', direction: 'up' }).map((e) => e.values.name)).toEqual(['X', 'Y', 'Z']);
    });

    it('Cover image: down puts the notes that show a cover first (a hidden cover does not count); ties keep name order', () => {
      const withCover = described('B', undefined, 'Assets/b.png');
      const hidden = described('C', undefined, 'Assets/c.png', true);
      const none = described('A');
      const another = described('D', undefined, 'Assets/d.png');

      expect(sortNotes([none, hidden, another, withCover], { property: 'cover', direction: 'down' }).map((e) => e.values.name)).toEqual([
        'B',
        'D',
        'A',
        'C',
      ]);
      expect(sortNotes([none, hidden, another, withCover], { property: 'cover', direction: 'up' }).map((e) => e.values.name)).toEqual([
        'A',
        'C',
        'B',
        'D',
      ]);
    });

    it('File size is no property of a note, so it leaves the order as given', () => {
      expect(sortNotes([x, z, y], { property: 'size', direction: 'down' }).map((e) => e.values.name)).toEqual(['X', 'Z', 'Y']);
    });
  });

  it('sorts by updated, down = newest first', () => {
    const sorted = sortNotes([charlie, alpha, bravo], { property: 'updated', direction: 'down' });
    expect(sorted.map((e) => e.values.name)).toEqual(['Charlie', 'Bravo', 'Alpha']);
  });

  it('an entry missing the sorted date field always sorts last, regardless of direction', () => {
    const noDate = noteEntry({ id: 'n', title: 'NoDate' });
    const down = sortNotes([noDate, alpha], { property: 'created', direction: 'down' });
    const up = sortNotes([noDate, alpha], { property: 'created', direction: 'up' });
    expect(down[down.length - 1]!.values.name).toBe('NoDate');
    expect(up[up.length - 1]!.values.name).toBe('NoDate');
  });

  it('never mutates the input array', () => {
    const input = [charlie, alpha, bravo];
    const snapshot = [...input];
    sortNotes(input, { property: 'name', direction: 'down' });
    expect(input).toEqual(snapshot);
  });

  it('CollectionBody renders notes in the requested sort order', () => {
    const { container } = render(
      <CollectionBody
        notes={[charlie, alpha, bravo]}
        viewMode="table"
        sort={{ property: 'name', direction: 'down' }}
      />
    );

    const titles = [...container.querySelectorAll('.collection-table-cell--header .collection-entry__title')].map(
      (el) => el.textContent
    );
    expect(titles).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });
});

describe('CollectionBody: Archived column is Archive-only', () => {
  it('table mode never renders an Archived column in an ordinary collection', () => {
    const { container } = render(
      <CollectionBody
        notes={[noteEntry({ archived: CREATED_AT })]}
        viewMode="table"
        visible={noteVisible()}
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
      expect(queryByText('Create')).not.toBeInTheDocument();
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
      <CollectionBody folders={folders} viewMode="list" sort={{ property: 'name', direction: 'down' }} />
    );
    expect(titles(container)).toEqual(['2024', '2025', '2026']);
  });

  it('draws them exactly in the order given when foldersInGivenOrder is set, whatever the sort says', () => {
    const given = [folders[1]!, folders[2]!, folders[0]!];
    for (const direction of ['down', 'up'] as const) {
      const { container, unmount } = render(
        <CollectionBody folders={given} viewMode="list" sort={{ property: 'name', direction }} foldersInGivenOrder />
      );
      expect(titles(container)).toEqual(['2026', '2025', '2024']);
      unmount();
    }
  });
});

describe('CollectionBody — no create actions when none are given', () => {
  it('shows neither the create-folder card nor a Create row without onCreateFolder / onCreate', () => {
    const { container, queryByText } = render(
      <CollectionBody folders={[folderEntry()]} notes={[noteEntry()]} viewMode="list" />
    );
    expect(container.querySelector('.collection-card--empty')).not.toBeInTheDocument();
    expect(queryByText('Create')).not.toBeInTheDocument();
  });
});

