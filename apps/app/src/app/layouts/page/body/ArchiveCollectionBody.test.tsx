// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ArchiveCollectionBody } from './ArchiveCollectionBody';
import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import type { VaultResource } from '@core/vault/models/VaultResource';
import type { Folder } from '@core/vault/models/Folder';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';

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

function makeFolder(overrides: Partial<Folder> & Pick<Folder, 'id' | 'path'>): Folder {
  return {
    name: overrides.path.split('/').pop() ?? '',
    parentId: null,
    metadata: {
      icon: null,
      favorite: false,
      description: '',
      cover: null,
      status: 'active',
      archivedAt: null,
      originalPath: null,
      originalParentId: null,
    },
    ...overrides,
  };
}

function makeVault(folders: Folder[] = []): Vault {
  return new Vault(
    ROOT,
    [],
    folders,
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
}

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

function makeFolderEntry(overrides: Partial<CollectionEntryModel> = {}): CollectionEntryModel {
  return {
    id: 'folder-1',
    type: 'folder',
    title: 'Old Project',
    icon: 'folder',
    emoji: null,
    selected: false,
    onClick: vi.fn(),
    ...overrides,
  };
}

function makeNoteEntry(overrides: Partial<CollectionEntryModel> = {}): CollectionEntryModel {
  return {
    id: 'page-1',
    type: 'note',
    title: 'Old Note',
    icon: 'note',
    emoji: null,
    selected: false,
    onClick: vi.fn(),
    ...overrides,
  };
}

function renderArchive(
  props: Partial<Omit<Parameters<typeof ArchiveCollectionBody>[0], 'resources'>> & {
    resources: VaultResource[];
    vault?: Vault;
  }
) {
  return render(
    <ArchiveCollectionBody
      vault={makeVault()}
      onRestoreResource={vi.fn()}
      onDeleteResource={vi.fn()}
      onRestoreFolder={vi.fn()}
      onDeleteFolder={vi.fn()}
      onRestoreNote={vi.fn()}
      onDeleteNote={vi.fn()}
      {...props}
    />
  );
}

function actionButtonsFor(rowTitle: string): { restore: HTMLElement; deleteBtn: HTMLElement } {
  const row = screen.getByText(rowTitle).closest('.entry')!;
  const buttons = Array.from(row.querySelectorAll('button'));
  const restore = buttons.find((b) => b.getAttribute('aria-label') === 'Restore')!;
  const deleteBtn = buttons.find((b) => b.getAttribute('aria-label') === 'Delete permanently')!;
  return { restore, deleteBtn };
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

  it('the existing folder row click behavior is unchanged', () => {
    const onClick = vi.fn();
    const folder = makeFolderEntry({ onClick });

    renderArchive({ folders: [folder], resources: [] });

    fireEvent.click(screen.getByText('Old Project').closest('.entry')!);

    expect(onClick).toHaveBeenCalled();
  });

  it('the existing note row click behavior is unchanged', () => {
    const onClick = vi.fn();
    const note = makeNoteEntry({ onClick });

    renderArchive({ notes: [note], resources: [] });

    fireEvent.click(screen.getByText('Old Note').closest('.entry')!);

    expect(onClick).toHaveBeenCalled();
  });

  it('renders correctly with no folders, notes, or resources', () => {
    const { container } = renderArchive({ resources: [] });

    expect(container.querySelectorAll('.entry')).toHaveLength(0);
  });
});

describe('ArchiveCollectionBody: hover actions — resources', () => {
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

describe('ArchiveCollectionBody: hover actions — folders and notes now get them too', () => {
  it('an archived folder row shows Restore and Delete on hover, alongside its existing (unchanged) click-to-open behavior', () => {
    const folder = makeFolderEntry();

    renderArchive({ folders: [folder], resources: [] });

    const { restore, deleteBtn } = actionButtonsFor('Old Project');
    expect(restore).toBeInTheDocument();
    expect(deleteBtn).toBeInTheDocument();
  });

  it('an archived note row shows Restore and Delete on hover, alongside its existing (unchanged) click-to-open behavior', () => {
    const note = makeNoteEntry();

    renderArchive({ notes: [note], resources: [] });

    const { restore, deleteBtn } = actionButtonsFor('Old Note');
    expect(restore).toBeInTheDocument();
    expect(deleteBtn).toBeInTheDocument();
  });

  it('a folder/note row still gets no three-dot menu — only the two action buttons, same as resources', () => {
    const folder = makeFolderEntry();
    const note = makeNoteEntry();

    const { container } = renderArchive({ folders: [folder], notes: [note], resources: [] });

    expect(screen.queryByRole('button', { name: /more|overflow/i })).toBeNull();
    // Scoped to .entry__actions — the row itself is also role="button" (it's
    // clickable to open), so an unscoped button count would double-count it.
    expect(container.querySelectorAll('.entry__actions button')).toHaveLength(4);
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

  it('folder: clicking Restore calls onRestoreFolder with the folder id, without opening the folder', () => {
    const onRestoreFolder = vi.fn();
    const onClick = vi.fn();
    const folder = makeFolderEntry({ onClick });

    renderArchive({ folders: [folder], resources: [], onRestoreFolder });

    const { restore } = actionButtonsFor('Old Project');
    fireEvent.click(restore);

    expect(onRestoreFolder).toHaveBeenCalledWith('folder-1');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('note: clicking Restore calls onRestoreNote with the page id, without opening the note (also covers Daily Notes, which render as the same \'note\'-typed entry)', () => {
    const onRestoreNote = vi.fn();
    const onClick = vi.fn();
    const note = makeNoteEntry({ onClick });

    renderArchive({ notes: [note], resources: [], onRestoreNote });

    const { restore } = actionButtonsFor('Old Note');
    fireEvent.click(restore);

    expect(onRestoreNote).toHaveBeenCalledWith('page-1');
    expect(onClick).not.toHaveBeenCalled();
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

describe('ArchiveCollectionBody: Delete (permanent) — notes', () => {
  it('clicking Delete shows a confirmation using the plain page-delete message, not the folder-descendant one', () => {
    const onDeleteNote = vi.fn();
    const note = makeNoteEntry();

    renderArchive({ notes: [note], resources: [], onDeleteNote });

    const { deleteBtn } = actionButtonsFor('Old Note');
    fireEvent.click(deleteBtn);

    expect(onDeleteNote).not.toHaveBeenCalled();
    expect(screen.getByText('Delete permanently?')).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
  });

  it('Cancel leaves the note untouched', () => {
    const onDeleteNote = vi.fn();
    const note = makeNoteEntry();

    renderArchive({ notes: [note], resources: [], onDeleteNote });

    fireEvent.click(actionButtonsFor('Old Note').deleteBtn);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onDeleteNote).not.toHaveBeenCalled();
  });

  it('Confirm invokes onDeleteNote with the page id, without opening the note', () => {
    const onDeleteNote = vi.fn();
    const onClick = vi.fn();
    const note = makeNoteEntry({ onClick });

    renderArchive({ notes: [note], resources: [], onDeleteNote });

    fireEvent.click(actionButtonsFor('Old Note').deleteBtn);
    const confirmButtons = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);

    expect(onDeleteNote).toHaveBeenCalledWith('page-1');
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('ArchiveCollectionBody: Delete (permanent) — folders reuse the existing descendant-aware confirmation copy', () => {
  it('an empty archived folder gets the plain "cannot be undone" message', () => {
    const vault = makeVault([
      makeFolder({ id: 'folder-1', path: `${ROOT}/Archive/Old Project` }),
    ]);
    const folder = makeFolderEntry();

    renderArchive({ vault, folders: [folder], resources: [], onDeleteFolder: vi.fn() });

    fireEvent.click(actionButtonsFor('Old Project').deleteBtn);

    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
  });

  it('a non-empty archived folder gets the existing descendant-count message, matching the topbar\'s own folder-delete confirmation', () => {
    const archived = makeFolder({ id: 'folder-1', path: `${ROOT}/Archive/Old Project` });
    const nested = makeFolder({
      id: 'folder-nested',
      path: `${ROOT}/Archive/Old Project/Nested`,
      parentId: 'folder-1',
    });
    const vault = makeVault([archived, nested]);
    const folder = makeFolderEntry();

    renderArchive({ vault, folders: [folder], resources: [], onDeleteFolder: vi.fn() });

    fireEvent.click(actionButtonsFor('Old Project').deleteBtn);

    expect(
      screen.getByText(/Delete this folder and everything inside it\?/)
    ).toBeInTheDocument();
  });

  it('Confirm invokes onDeleteFolder with the folder id, without opening the folder', () => {
    const vault = makeVault([
      makeFolder({ id: 'folder-1', path: `${ROOT}/Archive/Old Project` }),
    ]);
    const onDeleteFolder = vi.fn();
    const onClick = vi.fn();
    const folder = makeFolderEntry({ onClick });

    renderArchive({ vault, folders: [folder], resources: [], onDeleteFolder });

    fireEvent.click(actionButtonsFor('Old Project').deleteBtn);
    const confirmButtons = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);

    expect(onDeleteFolder).toHaveBeenCalledWith('folder-1');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('Cancel leaves the folder untouched', () => {
    const vault = makeVault([
      makeFolder({ id: 'folder-1', path: `${ROOT}/Archive/Old Project` }),
    ]);
    const onDeleteFolder = vi.fn();
    const folder = makeFolderEntry();

    renderArchive({ vault, folders: [folder], resources: [], onDeleteFolder });

    fireEvent.click(actionButtonsFor('Old Project').deleteBtn);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onDeleteFolder).not.toHaveBeenCalled();
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
