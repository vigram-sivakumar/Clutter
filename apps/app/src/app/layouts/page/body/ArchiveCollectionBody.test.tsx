// @vitest-environment jsdom

import { archiveVisible } from '@features/collection/testing/visibleProperties';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ArchiveCollectionBody } from './ArchiveCollectionBody';
import type { VaultResource } from '@core/vault/models/VaultResource';
import { folderEntry, noteEntry, type EntryFixture } from '@features/collection/testing/collectionEntry';
import { formatEntryTimestamp } from '@features/collection/properties/formatProperty';

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

const makeFolderEntry = (overrides: EntryFixture = {}) => folderEntry({ id: 'folder-1', title: 'Old Project', ...overrides });
const makeNoteEntry = (overrides: EntryFixture = {}) => noteEntry({ id: 'page-1', title: 'Old Note', ...overrides });

// An entry's dates are ISO instants; the text a layout shows is the formatter's.
const ARCHIVED_AT = '2026-08-12T14:20:00.000Z';
const ARCHIVED_TEXT = formatEntryTimestamp(ARCHIVED_AT)!;

function renderArchive(
  props: Partial<Omit<Parameters<typeof ArchiveCollectionBody>[0], 'resources'>> & {
    resources: VaultResource[];
  }
) {
  return render(
    <ArchiveCollectionBody
      // Most of this file's assertions target List-mode selectors
      // ('.collection-row', per actionButtonsFor's own comment below) —
      // ArchiveCollectionBody itself now defaults to Table (matching
      // CollectionBody's own new default), so tests are pinned to List
      // here explicitly rather than relying on a default that changed
      // out from under them. Table-mode tests override this per-call.
      viewMode="list"
      onRestoreResource={vi.fn()}
      onDeleteResource={vi.fn()}
      {...props}
    />
  );
}

describe('ArchiveCollectionBody: rendering every entry shape', () => {
  it('renders an archived folder, an archived note, an archived image, and an archived pdf together', () => {
    const folder = makeFolderEntry();
    const note = makeNoteEntry();
    const image = makeResource({ id: 'resource-image', name: 'hero.png', kind: 'image' });
    const pdf = makeResource({ id: 'resource-pdf', name: 'spec.pdf', kind: 'pdf' });

    renderArchive({ folders: [folder], notes: [note], resources: [image, pdf] });

    expect(screen.getByText('Old Project')).toBeInTheDocument();
    expect(screen.getByText('Old Note')).toBeInTheDocument();
    expect(screen.getByText('hero')).toBeInTheDocument();
    expect(screen.getByText('spec')).toBeInTheDocument();
  });

  it('the folder card click behavior works through the generic card', () => {
    const onClick = vi.fn();
    const folder = makeFolderEntry({ onClick });

    renderArchive({ folders: [folder], resources: [] });

    fireEvent.click(screen.getByText('Old Project').closest('.collection-card')!);

    expect(onClick).toHaveBeenCalled();
  });

  it('the note row click behavior works through the generic list', () => {
    const onClick = vi.fn();
    const note = makeNoteEntry({ onClick });

    renderArchive({ notes: [note], resources: [] });

    fireEvent.click(screen.getByText('Old Note').closest('.collection-row')!);

    expect(onClick).toHaveBeenCalled();
  });

  it('renders correctly with no folders, notes, or resources', () => {
    const { container } = renderArchive({ resources: [] });

    expect(container.querySelectorAll('.collection-row')).toHaveLength(0);
    expect(container.querySelectorAll('.collection-card')).toHaveLength(0);
    expect(container.querySelectorAll('.entry')).toHaveLength(0);
  });

  it('table mode renders notes as rows of the generic table; folders stay as generic cards in their grid', () => {
    const folder = makeFolderEntry();
    const note = makeNoteEntry();

    const { container } = renderArchive({
      folders: [folder],
      notes: [note],
      resources: [],
      viewMode: 'table',
    });

    expect(container.querySelector('.collection-table')).toBeInTheDocument();
    expect(screen.getByText('Old Note').closest('.collection-table-row')).toBeInTheDocument();
    expect(screen.getByText('Old Project').closest('.collection-card')).toBeInTheDocument();
    expect(container.querySelector('.collection-grid')).toBeInTheDocument();
  });

  it('table mode has no "New Note" row — there is nothing to create in the Archive', () => {
    renderArchive({ notes: [makeNoteEntry()], resources: [], viewMode: 'table' });

    expect(screen.queryByText('New Note')).not.toBeInTheDocument();
  });

  it('table mode: clicking a row still fires its onClick', () => {
    const onClick = vi.fn();
    const note = makeNoteEntry({ onClick });

    renderArchive({ notes: [note], resources: [], viewMode: 'table' });

    fireEvent.click(screen.getByText('Old Note').closest('.collection-table-row')!);

    expect(onClick).toHaveBeenCalled();
  });
});

describe('ArchiveCollectionBody: hover actions — resources (folders and notes carry none)', () => {
  it('a folder card and a note row carry no inline actions — they are restored or deleted from their own page', () => {
    const { container } = renderArchive({ folders: [makeFolderEntry()], notes: [makeNoteEntry()], resources: [] });

    expect(container.querySelector('.collection-card button, .collection-row button')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete permanently' })).toBeNull();
  });

  it('renders exactly two action buttons for an archived image resource: Restore and Delete', () => {
    const resource = makeResource({ kind: 'image' });

    renderArchive({ resources: [resource] });

    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete permanently' })).toBeInTheDocument();
  });

  it('renders exactly two action buttons for an archived pdf resource: Restore and Delete', () => {
    const resource = makeResource({ kind: 'pdf', name: 'spec.pdf' });

    renderArchive({ resources: [resource] });

    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete permanently' })).toBeInTheDocument();
  });

  it('shows no three-dot/overflow menu button for an archived resource — only the two action buttons', () => {
    const resource = makeResource();

    renderArchive({ resources: [resource] });

    expect(screen.queryByRole('button', { name: /more|overflow/i })).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('the action buttons live inside Entry\'s existing hover-only .entry__actions slot, not a new always-visible element', () => {
    const resource = makeResource();

    const { container } = renderArchive({ resources: [resource] });

    const actionsSlot = container.querySelector('.entry__actions');
    expect(actionsSlot).not.toBeNull();
    expect(actionsSlot!.querySelectorAll('button')).toHaveLength(2);
  });
});

describe('ArchiveCollectionBody: Restore', () => {
  it('resource: clicking Restore calls onRestoreResource with the resource id', () => {
    const onRestoreResource = vi.fn();
    const resource = makeResource();

    renderArchive({ resources: [resource], onRestoreResource });

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    expect(onRestoreResource).toHaveBeenCalledWith('resource-1');
  });

  it('resource: clicking Restore does not also trigger the row click (image overlay)', () => {
    const onOpenResource = vi.fn();
    const resource = makeResource({ kind: 'image' });

    renderArchive({ resources: [resource], onOpenResource });

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    expect(onOpenResource).not.toHaveBeenCalled();
  });

  it('resource: works identically for a pdf resource', () => {
    const onRestoreResource = vi.fn();
    const resource = makeResource({ id: 'resource-pdf', kind: 'pdf', name: 'spec.pdf' });

    renderArchive({ resources: [resource], onRestoreResource });

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    expect(onRestoreResource).toHaveBeenCalledWith('resource-pdf');
  });
});

describe('ArchiveCollectionBody: Delete (permanent) — resources', () => {
  it('clicking Delete does not immediately delete — shows a confirmation instead', () => {
    const onDeleteResource = vi.fn();
    const resource = makeResource();

    renderArchive({ resources: [resource], onDeleteResource });

    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

    expect(onDeleteResource).not.toHaveBeenCalled();
    expect(screen.getByText('Delete permanently?')).toBeInTheDocument();
  });

  it('Cancel leaves the resource untouched — onDeleteResource is never called', () => {
    const onDeleteResource = vi.fn();
    const resource = makeResource();

    renderArchive({ resources: [resource], onDeleteResource });

    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onDeleteResource).not.toHaveBeenCalled();
    expect(screen.queryByText('Delete permanently?')).not.toBeInTheDocument();
  });

  it('Confirm invokes onDeleteResource with the resource id', () => {
    const onDeleteResource = vi.fn();
    const resource = makeResource();

    renderArchive({ resources: [resource], onDeleteResource });

    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
    const confirmButtons = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);

    expect(onDeleteResource).toHaveBeenCalledWith('resource-1');
  });

  it('clicking Delete does not also trigger the row click (image overlay)', () => {
    const onOpenResource = vi.fn();
    const resource = makeResource({ kind: 'image' });

    renderArchive({ resources: [resource], onOpenResource });

    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

    expect(onOpenResource).not.toHaveBeenCalled();
  });

  it('works identically for a pdf resource', () => {
    const onDeleteResource = vi.fn();
    const resource = makeResource({ id: 'resource-pdf', kind: 'pdf', name: 'spec.pdf' });

    renderArchive({ resources: [resource], onDeleteResource });

    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
    const confirmButtons = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);

    expect(onDeleteResource).toHaveBeenCalledWith('resource-pdf');
  });
});

describe('ArchiveCollectionBody: existing image/pdf click behavior preserved', () => {
  it('clicking an archived image resource row invokes onOpenResource', () => {
    const onOpenResource = vi.fn();
    const resource = makeResource({ kind: 'image' });

    renderArchive({ resources: [resource], onOpenResource });

    fireEvent.click(screen.getByText('hero').closest('.entry')!);

    expect(onOpenResource).toHaveBeenCalledWith(resource);
  });

  it('clicking an archived pdf resource row invokes onOpenResource, reaching PdfOverlay', () => {
    const onOpenResource = vi.fn();
    const resource = makeResource({ kind: 'pdf', name: 'spec.pdf' });

    renderArchive({ resources: [resource], onOpenResource });

    fireEvent.click(screen.getByText('spec').closest('.entry')!);

    expect(onOpenResource).toHaveBeenCalledWith(resource);
  });
});

describe('ArchiveCollectionBody: Archived column', () => {
  it('table mode shows an Archived header and each note\'s archived time', () => {
    const note = makeNoteEntry({ archived: ARCHIVED_AT });

    const { container } = renderArchive({
      notes: [note],
      resources: [],
      viewMode: 'table',
    });

    expect(container.querySelector('.collection-table__header-cell--archived')).toHaveTextContent(
      'Archived'
    );
    expect(screen.getByText(ARCHIVED_TEXT).closest('.collection-table-row__archived')).toBeInTheDocument();
  });

  it('table mode hides the column when the Archived property is unchecked', () => {
    const { container } = renderArchive({
      notes: [makeNoteEntry({ archived: ARCHIVED_AT })],
      resources: [],
      viewMode: 'table',
      visible: archiveVisible('archived'),
    });

    expect(container.querySelector('.collection-table__header-cell--archived')).not.toBeInTheDocument();
    expect(screen.queryByText(ARCHIVED_TEXT)).not.toBeInTheDocument();
  });

  it('list mode shows the archived time in the note metadata', () => {
    renderArchive({
      notes: [makeNoteEntry({ archived: ARCHIVED_AT })],
      resources: [],
      viewMode: 'list',
    });

    expect(screen.getByText(ARCHIVED_TEXT)).toBeInTheDocument();
  });

  it('sorts by the raw archived instant, newest first for "down"', () => {
    renderArchive({
      notes: [
        makeNoteEntry({ id: 'a', title: 'Older', archived: '2026-08-01T10:00:00.000Z' }),
        makeNoteEntry({ id: 'b', title: 'Newer', archived: '2026-09-01T10:00:00.000Z' }),
      ],
      resources: [],
      viewMode: 'list',
      sort: { property: 'archived', direction: 'down' },
    });

    const titles = [...document.querySelectorAll('.collection-row')].map((el) => el.textContent);
    expect(titles[0]).toContain('Newer');
    expect(titles[1]).toContain('Older');
  });
});
