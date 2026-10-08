// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { PropertyId } from '@core/properties/collectionProperties';
import type { VaultResource } from '@core/vault/models/VaultResource';
import { folderEntry, noteEntry, type EntryFixture } from '@features/collection/testing/collectionEntry';
import { formatEntryTimestamp } from '@features/collection/properties/formatProperty';
import { archiveVisible } from '@features/collection/testing/visibleProperties';

import { ArchiveCollectionBody } from './ArchiveCollectionBody';

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

afterEach(() => {
  cleanup();
});

const ROOT = '/vault';

function makeResource(overrides: Partial<VaultResource> = {}): VaultResource {
  return {
    id: 'resource-1',
    kind: 'image',
    name: 'hero.png',
    path: `${ROOT}/Archive/hero.png`,
    parentId: 'folder-archive',
    ...overrides,
  };
}

const makeFolderEntry = (overrides: EntryFixture = {}) =>
  folderEntry({ id: 'folder-1', title: 'Old Project', subfolderCount: 0, noteCount: 2, ...overrides });
const makeNoteEntry = (overrides: EntryFixture = {}) => noteEntry({ id: 'page-1', title: 'Old Note', ...overrides });

// An entry's dates are ISO instants; the text a layout shows is the formatter's.
const ARCHIVED_AT = '2026-08-12T14:20:00.000Z';
const ARCHIVED_TEXT = formatEntryTimestamp(ARCHIVED_AT)!;

function renderArchive(
  props: Partial<Omit<Parameters<typeof ArchiveCollectionBody>[0], 'resources'>> & { resources?: VaultResource[] }
) {
  return render(<ArchiveCollectionBody resources={[]} resolveResourceUrl={(path) => `app://vault${path}`} {...props} />);
}

/** The rows of the generic list / table, in order — the table's "New" row (there is none here) excluded. */
const listTitles = (container: HTMLElement) =>
  [...container.querySelectorAll('.collection-list .collection-entry .collection-entry__title')].map((el) => el.textContent);
const tableTitles = (container: HTMLElement) =>
  [...container.querySelectorAll('.collection-table-row .collection-entry__title')].map((el) => el.textContent);

const EVERYTHING = {
  folders: [makeFolderEntry({ archived: ARCHIVED_AT })],
  notes: [makeNoteEntry({ archived: ARCHIVED_AT })],
  resources: [
    makeResource(),
    makeResource({ id: 'resource-2', kind: 'pdf', name: 'manual.pdf', path: `${ROOT}/Archive/manual.pdf` }),
  ],
};

describe('ArchiveCollectionBody: ONE unified collection drawn by the generic List and Table', () => {
  it('List draws a folder, a note, an image and a pdf as rows of the one generic list — no folder cards, no separate groups', () => {
    const { container } = renderArchive({ ...EVERYTHING, viewMode: 'list' });

    expect(container.querySelectorAll('.collection-list')).toHaveLength(1);
    expect(container.querySelector('.collection-card')).toBeNull();
    expect(listTitles(container).sort()).toEqual(['Old Note', 'Old Project', 'hero', 'manual']);
  });

  it('Table draws the same four as rows of the one generic table', () => {
    const { container } = renderArchive({ ...EVERYTHING, viewMode: 'table' });

    expect(container.querySelectorAll('.collection-table')).toHaveLength(1);
    expect(container.querySelector('.collection-card')).toBeNull();
    expect(tableTitles(container).sort()).toEqual(['Old Note', 'Old Project', 'hero', 'manual']);
  });

  it('is sorted TOGETHER — folders, notes and files interleave by the sort, never grouped by kind', () => {
    const { container } = renderArchive({
      folders: [makeFolderEntry({ id: 'f', title: 'Bravo' })],
      notes: [makeNoteEntry({ id: 'n', title: 'Alpha' }), makeNoteEntry({ id: 'n2', title: 'Delta' })],
      resources: [makeResource({ name: 'charlie.png' })],
      viewMode: 'list',
    });

    expect(listTitles(container)).toEqual(['Alpha', 'Bravo', 'charlie', 'Delta']);
  });

  it('draws the Archive\'s default view without being told: a table', () => {
    const { container } = renderArchive({ ...EVERYTHING });

    expect(container.querySelector('.collection-table')).not.toBeNull();
  });

  it('shows the empty state — and nothing else — when nothing is archived', () => {
    const { container } = renderArchive({ folders: [], notes: [], resources: [] });

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(container.querySelector('.collection-table, .collection-list')).toBeNull();
  });
});

describe('ArchiveCollectionBody: Type is an ordinary property, drawn from the same `visible` set in List and Table', () => {
  const metadataOf = (container: HTMLElement, title: string) =>
    [...container.querySelectorAll('.collection-entry')]
      .find((row) => row.querySelector('.collection-entry__title')?.textContent === title)
      ?.querySelector('.collection-entry-properties')?.textContent;
  const headers = (container: HTMLElement) => [...container.querySelectorAll('.collection-table__header-cell')].map((c) => c.textContent);
  const typeCells = (container: HTMLElement) => [...container.querySelectorAll('.collection-table-row__type')].map((c) => c.textContent).sort();

  it('List shows the Type as the first metadata string of every row: Folder, Note, Image, PDF', () => {
    const { container } = renderArchive({ ...EVERYTHING, viewMode: 'list' });

    expect(metadataOf(container, 'Old Project')).toBe('Folder');
    expect(metadataOf(container, 'Old Note')).toBe('Note');
    expect(metadataOf(container, 'hero')).toBe('Image');
    expect(metadataOf(container, 'manual')).toBe('PDF');
  });

  it('Table has Name, Type, then Archived — the property labels, in registry order', () => {
    const { container } = renderArchive({ ...EVERYTHING, viewMode: 'table' });

    expect(headers(container)).toEqual(['Name', 'Type', 'Archived date']);
    expect(typeCells(container)).toEqual(['Folder', 'Image', 'Note', 'PDF']);
  });

  it('hiding Type removes it from the Table AND the List', () => {
    const visible = archiveVisible('type');
    const table = renderArchive({ ...EVERYTHING, viewMode: 'table', visible });

    expect(headers(table.container)).toEqual(['Name', 'Archived date']);
    expect(typeCells(table.container)).toEqual([]);
    cleanup();

    const list = renderArchive({ ...EVERYTHING, viewMode: 'list', visible });
    expect(metadataOf(list.container, 'Old Note')).toBe(ARCHIVED_TEXT);
    expect(list.container.textContent).not.toMatch(/\b(Folder|Image|PDF)\b/);
  });

  it('hiding every property leaves only Name in both layouts — Type has no special standing', () => {
    expect(headers(renderArchive({ ...EVERYTHING, viewMode: 'table', visible: ['name'] }).container)).toEqual(['Name']);
    cleanup();

    const { container } = renderArchive({ ...EVERYTHING, viewMode: 'list', visible: ['name'] });
    expect(metadataOf(container, 'Old Note')).toBeUndefined();
  });

  it('List and Table show the same properties in the same order, for any visible set', () => {
    for (const visible of [archiveVisible(), archiveVisible('type'), archiveVisible('archived'), archiveVisible('type', 'archived')]) {
      const table = renderArchive({ ...EVERYTHING, viewMode: 'table', visible });
      const tableValues = [...table.container.querySelectorAll('.collection-table-row')]
        .find((row) => row.querySelector('.collection-entry__title')?.textContent === 'Old Note')!
        .querySelectorAll('[class*="collection-table-row__"]');
      const tableTexts = [...tableValues].map((c) => c.textContent);
      cleanup();

      const list = renderArchive({ ...EVERYTHING, viewMode: 'list', visible });
      const listTexts = [...list.container.querySelectorAll('.collection-entry')]
        .find((row) => row.querySelector('.collection-entry__title')?.textContent === 'Old Note')!
        .querySelectorAll('.collection-entry-properties');
      cleanup();

      expect([...listTexts].map((c) => c.textContent), visible.join()).toEqual(tableTexts);
    }
  });

  it('sorts by Type through the shared engine: A→Z for "down", folders, notes and files together', () => {
    const { container } = renderArchive({ ...EVERYTHING, viewMode: 'list', sort: { property: 'type', direction: 'down' } });

    expect(listTitles(container).map((t) => t)).toEqual(['Old Project', 'hero', 'Old Note', 'manual']);
  });

  it('the archived date column is headed "Archived date" in the Table', () => {
    const { container } = renderArchive({ ...EVERYTHING, viewMode: 'table' });

    expect(headers(container)).toContain('Archived date');
    expect(headers(container)).not.toContain('Delete');
  });
});

describe('ArchiveCollectionBody: a folder\'s row says what it holds', () => {
  const folderRow = (container: HTMLElement) => container.querySelector('.collection-entry, .collection-table-row')!;

  it('shows "0 subfolders · 2 notes" where a description would be — in List and Table', () => {
    for (const viewMode of ['list', 'table'] as const) {
      const { container } = renderArchive({ folders: [makeFolderEntry()], viewMode });

      expect(folderRow(container).textContent, viewMode).toContain('0 subfolders · 2 notes');
      cleanup();
    }
  });

  it('pluralizes: "1 subfolder · 1 note"', () => {
    const { container } = renderArchive({ folders: [makeFolderEntry({ subfolderCount: 1, noteCount: 1 })], viewMode: 'list' });

    expect(container.textContent).toContain('1 subfolder · 1 note');
  });

  it('a folder row always shows its contents, never a description — even with Description visible', () => {
    for (const viewMode of ['list', 'table'] as const) {
      const { container } = renderArchive({
        folders: [makeFolderEntry({ description: 'About this folder' })],
        viewMode,
        visible: ['name', 'description'],
      });

      expect(container.textContent, viewMode).not.toContain('About this folder');
      expect(container.querySelector('.collection-entry__description')?.textContent, viewMode).toBe('0 subfolders · 2 notes');
    }
  });
});

describe('ArchiveCollectionBody: Description is a property of archived notes, in List and Table', () => {
  const noteWithDescription = makeNoteEntry({ description: 'About this note' });

  it('is drawn under the note\'s title when visible, in both layouts', () => {
    for (const viewMode of ['list', 'table'] as const) {
      const { container } = renderArchive({ notes: [noteWithDescription], viewMode, visible: archiveVisible().concat('description') });

      expect(container.querySelector('.collection-entry__description')?.textContent, viewMode).toBe('About this note');
      cleanup();
    }
  });

  it('is off by default and absent when hidden', () => {
    for (const viewMode of ['list', 'table'] as const) {
      const { container } = renderArchive({ notes: [noteWithDescription], viewMode });

      expect(container.textContent, viewMode).not.toContain('About this note');
      cleanup();
    }
  });
});

describe('ArchiveCollectionBody: files have no description, and no archive date', () => {
  it('a file row has no description line and no placeholder — in List or Table', () => {
    for (const viewMode of ['list', 'table'] as const) {
      const { container } = renderArchive({ resources: [makeResource()], viewMode });

      expect(container.querySelector('.collection-entry__description'), viewMode).toBeNull();
      expect(container.textContent, viewMode).not.toMatch(/No description/);
      cleanup();
    }
  });

  it('the archive date is empty for a file (none is recorded) and filled for a note and a folder', () => {
    const { container } = renderArchive({ ...EVERYTHING, viewMode: 'table', visible: ['name', 'archived'] });

    const archivedOf = (title: string) =>
      [...container.querySelectorAll('.collection-table-row')]
        .find((row) => row.querySelector('.collection-entry__title')?.textContent === title)
        ?.querySelector('.collection-table-row__archived')?.textContent;

    expect(archivedOf('Old Note')).toBe(ARCHIVED_TEXT);
    expect(archivedOf('Old Project')).toBe(ARCHIVED_TEXT);
    expect(archivedOf('hero')).toBe('');
  });
});

describe('ArchiveCollectionBody: a file\'s archive date comes from the archive record', () => {
  const RECORDED_AT = '2026-09-20T08:00:00.000Z';
  const RECORDED_TEXT = formatEntryTimestamp(RECORDED_AT)!;
  const hero = makeResource();

  it('shows the recorded date in the Delete column — and none for a file with no record', () => {
    const noRecord = makeResource({ id: 'resource-2', name: 'old.png', path: `${ROOT}/Archive/old.png` });
    const { container } = renderArchive({
      resources: [hero, noRecord],
      archivedAtByPath: new Map([[hero.path, RECORDED_AT]]),
      viewMode: 'table',
      visible: ['name', 'archived'],
    });

    const archivedOf = (title: string) =>
      [...container.querySelectorAll('.collection-table-row')]
        .find((row) => row.querySelector('.collection-entry__title')?.textContent === title)
        ?.querySelector('.collection-table-row__archived');

    expect(archivedOf('hero')).toHaveTextContent(RECORDED_TEXT);
    expect(archivedOf('hero')).toHaveAttribute('data-date', RECORDED_AT);
    expect(archivedOf('old')?.textContent).toBe('');
  });

  it('List shows it as the file\'s metadata, after the Type', () => {
    const { container } = renderArchive({
      resources: [hero],
      archivedAtByPath: new Map([[hero.path, RECORDED_AT]]),
      viewMode: 'list',
      visible: ['name', 'type', 'archived'],
    });

    expect([...container.querySelectorAll('.collection-entry-properties')].map((s) => s.textContent)).toEqual(['Image', RECORDED_TEXT]);
  });

  it('files sort with notes and folders by that date: newest first for "down", a file with no date last', () => {
    const noRecord = makeResource({ id: 'resource-2', name: 'zzz.png', path: `${ROOT}/Archive/zzz.png` });
    const { container } = renderArchive({
      notes: [
        makeNoteEntry({ id: 'older', title: 'Older note', archived: '2026-08-01T10:00:00.000Z' }),
        makeNoteEntry({ id: 'newer', title: 'Newer note', archived: '2026-10-01T10:00:00.000Z' }),
      ],
      resources: [hero, noRecord],
      archivedAtByPath: new Map([[hero.path, RECORDED_AT]]),
      viewMode: 'list',
      sort: { property: 'archived', direction: 'down' },
    });

    expect(listTitles(container)).toEqual(['Newer note', 'hero', 'Older note', 'zzz']);
  });
});

describe('ArchiveCollectionBody: properties and sort come from the resolved view', () => {
  it('Table: a property that is not visible is not a column', () => {
    const visible: PropertyId[] = archiveVisible('archived');
    const { container } = renderArchive({ ...EVERYTHING, viewMode: 'table', visible });

    expect(container.querySelector('.collection-table__header-cell--archived')).toBeNull();
  });

  it('List: the archived time is part of a row\'s metadata only while Archived is visible', () => {
    const shown = renderArchive({ notes: [makeNoteEntry({ archived: ARCHIVED_AT })], viewMode: 'list', visible: ['name', 'archived'] });
    expect(shown.container.textContent).toContain(ARCHIVED_TEXT);
    shown.unmount();

    const hidden = renderArchive({ notes: [makeNoteEntry({ archived: ARCHIVED_AT })], viewMode: 'list', visible: ['name'] });
    expect(hidden.container.textContent).not.toContain(ARCHIVED_TEXT);
  });

  it('sorts by the raw archived instant, newest first for "down" — and a file with no archive date goes last', () => {
    const { container } = renderArchive({
      notes: [
        makeNoteEntry({ id: 'a', title: 'Older', archived: '2026-08-01T10:00:00.000Z' }),
        makeNoteEntry({ id: 'b', title: 'Newer', archived: '2026-09-01T10:00:00.000Z' }),
      ],
      resources: [makeResource({ name: 'aaa.png' })],
      viewMode: 'list',
      sort: { property: 'archived', direction: 'down' },
    });

    expect(listTitles(container)).toEqual(['Newer', 'Older', 'aaa']);
  });

  it('sorts by Name, A→Z for "down" and Z→A for "up", folders, notes and files together', () => {
    const rows = {
      folders: [makeFolderEntry({ id: 'f', title: 'Bravo' })],
      notes: [makeNoteEntry({ title: 'Alpha' })],
      resources: [makeResource({ name: 'charlie.png' })],
      viewMode: 'list' as const,
    };

    const down = renderArchive({ ...rows, sort: { property: 'name', direction: 'down' } });
    expect(listTitles(down.container)).toEqual(['Alpha', 'Bravo', 'charlie']);
    down.unmount();

    const up = renderArchive({ ...rows, sort: { property: 'name', direction: 'up' } });
    expect(listTitles(up.container)).toEqual(['charlie', 'Bravo', 'Alpha']);
  });
});

describe('ArchiveCollectionBody: opening rows, and no inline actions', () => {
  it('clicking a folder or a note fires its own onClick', () => {
    const onFolder = vi.fn();
    const onNote = vi.fn();
    renderArchive({
      folders: [makeFolderEntry({ onClick: onFolder })],
      notes: [makeNoteEntry({ onClick: onNote })],
      viewMode: 'list',
    });

    fireEvent.click(screen.getByText('Old Project'));
    fireEvent.click(screen.getByText('Old Note'));

    expect(onFolder).toHaveBeenCalledTimes(1);
    expect(onNote).toHaveBeenCalledTimes(1);
  });

  it('clicking a file opens it — images and PDFs alike — in both layouts', () => {
    for (const viewMode of ['list', 'table'] as const) {
      const onOpenResource = vi.fn();
      const image = makeResource();
      const pdf = makeResource({ id: 'resource-2', kind: 'pdf', name: 'manual.pdf', path: `${ROOT}/Archive/manual.pdf` });
      renderArchive({ resources: [image, pdf], viewMode, onOpenResource });

      fireEvent.click(screen.getByText('hero'));
      fireEvent.click(screen.getByText('manual'));

      expect(onOpenResource, viewMode).toHaveBeenNthCalledWith(1, image);
      expect(onOpenResource, viewMode).toHaveBeenNthCalledWith(2, pdf);
      cleanup();
    }
  });

  it('no row carries an inline action — no Restore, no Delete, no hover-actions slot, no confirmation', () => {
    for (const viewMode of ['list', 'table'] as const) {
      const { container } = renderArchive({ ...EVERYTHING, viewMode });

      expect(screen.queryByLabelText('Restore'), viewMode).toBeNull();
      expect(screen.queryByLabelText('Delete permanently'), viewMode).toBeNull();
      expect(container.querySelector('.entry__actions, button'), viewMode).toBeNull();
      cleanup();
    }
  });

  it('has no "New" row — there is nothing to create in the Archive', () => {
    const { container } = renderArchive({ ...EVERYTHING, viewMode: 'table' });

    expect(container.querySelector('.collection-table-row--new-item')).toBeNull();
  });
});
