// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppLayout } from '../app-layout/AppLayout';
import { Application } from '@core/application/Application';
import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '@core/vault/providers/SelfWriteRegistry';
import { PageCreator } from '@core/application/page/PageCreator';
import { PageFactory } from '@core/application/page/PageFactory';
import { PageBuilder } from '@core/vault/ingest/PageBuilder';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import type { Page } from '@core/vault/models/Page';
import type { Folder } from '@core/vault/models/Folder';

/**
 * End-to-end coverage of the Description UX state machine (see the
 * approved spec: "a non-empty description is persistent and directly
 * editable; an empty description is temporary and disappears on blur").
 * Real-AppLayout-composition, same approach as PageHost.dailyNoteNav.test.tsx
 * — a break anywhere in the PageHost -> Page -> PageOperations/
 * FolderOperations chain fails a test here, not just a unit in isolation.
 */

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

function buildNotePage(pathSegment = 'Note.md'): Page {
  const builder = new PageBuilder(ROOT);
  return builder.build({
    parentId: null,
    page: {
      path: `${ROOT}/${pathSegment}`,
      directoryPath: ROOT,
      frontmatter: { id: pathSegment },
      frontmatterAnalysis: { aliases: [] },
      content: 'Body',
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
}

function buildNotePageWithDescription(description: string): Page {
  const builder = new PageBuilder(ROOT);
  return builder.build({
    parentId: null,
    page: {
      path: `${ROOT}/Note.md`,
      directoryPath: ROOT,
      frontmatter: { id: 'page-1', description },
      frontmatterAnalysis: { aliases: [] },
      content: 'Body',
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
}

function makeFolder(id: string, path: string): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId: null,
    metadata: {
      icon: null,
      favorite: false,
      description: null,
      cover: null,
      coverHidden: false,
      coverLayout: 'side' as const,
      coverPositionAbove: 50,
      coverPositionSide: 50,
      status: 'active',
      archivedAt: null,
      originalPath: null,
      originalParentId: null,
    },
  };
}

function makeApplication(pages: Page[] = [], folders: Folder[] = []) {
  const vault = new Vault(
    ROOT,
    pages,
    folders,
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder(),
    new Map(),
    []
  );
  const fileSystem = new InMemoryVaultFileSystem();
  const application = new Application(vault, fileSystem, new SelfWriteRegistry());
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  return { application, vault, fileSystem };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function getDescriptionField(): HTMLElement | null {
  return document.querySelector('.page-description [role="textbox"]');
}

// Both the title-section's own control and the topbar's overflow menu use
// the same "More actions" accessible name (the established convention —
// see PageHeaderMoreActionsMenu.tsx/Page.Cover.tsx/PdfViewerMoreActions.tsx
// — every such trigger in the app shares it), so a plain
// `getByRole('button', { name: 'More actions' })` is ambiguous once both
// are mounted in the same AppLayout composition. This helper scopes to the
// title section specifically — the one whose menu these tests (other than
// the topbar-scoped one below) actually mean.
function openMoreActionsMenu(): void {
  const titleSection = document.querySelector('.page-title-section');
  if (!titleSection) {
    throw new Error('Expected a .page-title-section to be rendered');
  }
  fireEvent.click(within(titleSection as HTMLElement).getByRole('button', { name: 'More actions' }));
}

describe('Description UX: no description → hidden, entry point offered', () => {
  it('renders no description field, and offers "Description" in the page-controls (title-section) menu', async () => {
    const note = buildNotePage();
    const { application } = makeApplication([note]);
    await application.pageOperations.open(note.id);

    render(<AppLayout application={application} />);
    await flush();

    expect(getDescriptionField()).toBeNull();

    openMoreActionsMenu();
    expect(screen.getByText('Description')).toBeInTheDocument();
  });

  // Final UX decision: Description is a title-section/page-property
  // control only — it must never appear in the topbar overflow menu,
  // regardless of whether a description exists.
  it('never offers a description item in the topbar overflow menu', async () => {
    const note = buildNotePage();
    const { application } = makeApplication([note]);
    await application.pageOperations.open(note.id);

    render(<AppLayout application={application} />);
    await flush();

    // Scoped to the topbar specifically — its own overflow trigger shares
    // the same "More actions" accessible name as the title-section's (see
    // openMoreActionsMenu's own doc comment), so disambiguating by DOM
    // position/order is fragile; querying within `.topbar` targets the
    // right one directly.
    const topbar = document.querySelector('.topbar');
    expect(topbar).not.toBeNull();
    fireEvent.click(within(topbar as HTMLElement).getByRole('button', { name: 'More actions' }));
    await flush();

    expect(screen.queryByText('Add a description')).toBeNull();
    expect(screen.queryByText('Description')).toBeNull();
  });
});

describe('Description UX: opening the editor', () => {
  it('clicking "Description" in the page-controls menu shows a focused, empty editor', async () => {
    const note = buildNotePage();
    const { application } = makeApplication([note]);
    await application.pageOperations.open(note.id);

    render(<AppLayout application={application} />);
    await flush();

    openMoreActionsMenu();
    fireEvent.click(screen.getByText('Description'));
    await flush();

    const field = getDescriptionField();
    expect(field).not.toBeNull();
    expect(field!.textContent).toBe('');
    expect(document.activeElement).toBe(field);
  });
});

describe('Description UX: typing persists the description', () => {
  it('typing and blurring writes the description to Vault metadata and keeps it visible', async () => {
    const note = buildNotePage();
    const { application, vault } = makeApplication([note]);
    await application.pageOperations.open(note.id);

    render(<AppLayout application={application} />);
    await flush();

    openMoreActionsMenu();
    fireEvent.click(screen.getByText('Description'));
    await flush();

    const field = getDescriptionField()!;
    field.textContent = 'A collection of research notes.';
    fireEvent.input(field);
    fireEvent.blur(field);
    await flush();

    expect(vault.getPage(note.id)!.metadata.description).toBe(
      'A collection of research notes.'
    );
    expect(getDescriptionField()!.textContent).toBe(
      'A collection of research notes.'
    );
  });

  it('hides "Description" from the page-controls menu once a description exists', async () => {
    const note = buildNotePageWithDescription('Existing description');
    const { application } = makeApplication([note]);
    await application.pageOperations.open(note.id);

    render(<AppLayout application={application} />);
    await flush();

    openMoreActionsMenu();
    expect(screen.queryByText('Description')).toBeNull();

    // Close the page-controls menu and confirm the topbar overflow menu
    // still never offers it either (it never does, regardless of state).
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await flush();

    const overflowButtons = screen.getAllByRole('button', { name: /more/i });
    fireEvent.click(overflowButtons[overflowButtons.length - 1]!);
    await flush();
    expect(screen.queryByText('Description')).toBeNull();
  });
});

describe('Description UX: empty editor, no typing, blur', () => {
  it('opening the editor and blurring without typing writes no metadata and hides the field again', async () => {
    const note = buildNotePage();
    const { application, vault } = makeApplication([note]);
    await application.pageOperations.open(note.id);

    render(<AppLayout application={application} />);
    await flush();

    openMoreActionsMenu();
    fireEvent.click(screen.getByText('Description'));
    await flush();

    const field = getDescriptionField()!;
    fireEvent.blur(field);
    await flush();

    expect(vault.getPage(note.id)!.metadata.description).toBeNull();
    expect(getDescriptionField()).toBeNull();

    // "Description" is available again.
    openMoreActionsMenu();
    expect(screen.getByText('Description')).toBeInTheDocument();
  });
});

describe('Description UX: existing description is directly editable', () => {
  it('clicking into an existing description edits it in place, no separate mode', async () => {
    const note = buildNotePageWithDescription('Original text');
    const { application, vault } = makeApplication([note]);
    await application.pageOperations.open(note.id);

    render(<AppLayout application={application} />);
    await flush();

    const field = getDescriptionField()!;
    expect(field.textContent).toBe('Original text');

    field.textContent = 'Edited text';
    fireEvent.input(field);
    fireEvent.blur(field);
    await flush();

    expect(vault.getPage(note.id)!.metadata.description).toBe('Edited text');
  });
});

describe('Description UX: deleting an existing description', () => {
  it('select-all + delete + blur removes the description and makes "Description" available again', async () => {
    const note = buildNotePageWithDescription('Original text');
    const { application, vault } = makeApplication([note]);
    await application.pageOperations.open(note.id);

    render(<AppLayout application={application} />);
    await flush();

    const field = getDescriptionField()!;
    field.textContent = '';
    fireEvent.input(field);
    fireEvent.blur(field);
    await flush();

    expect(vault.getPage(note.id)!.metadata.description).toBeNull();
    expect(getDescriptionField()).toBeNull();

    openMoreActionsMenu();
    expect(screen.getByText('Description')).toBeInTheDocument();
  });
});

describe('Description UX: page switching does not leak the transient editor', () => {
  it('opening the editor on page A does not show it on page B', async () => {
    const noteA = buildNotePage('A.md');
    const noteB = buildNotePage('B.md');
    const { application } = makeApplication([noteA, noteB]);
    await application.pageOperations.open(noteA.id);

    render(<AppLayout application={application} />);
    await flush();

    openMoreActionsMenu();
    fireEvent.click(screen.getByText('Description'));
    await flush();
    expect(getDescriptionField()).not.toBeNull();

    await application.pageOperations.open(noteB.id);
    await flush();

    expect(getDescriptionField()).toBeNull();
  });
});

describe('Description UX: folders', () => {
  it('a folder supports the same Add-description/type/blur/persist flow', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { application, vault, fileSystem } = makeApplication([], [folder]);
    await fileSystem.createDirectory(folder.path);
    await application.folderOperations.open(folder.id);

    render(<AppLayout application={application} />);
    await flush();

    expect(getDescriptionField()).toBeNull();

    openMoreActionsMenu();
    fireEvent.click(screen.getByText('Description'));
    await flush();

    const field = getDescriptionField()!;
    expect(document.activeElement).toBe(field);

    field.textContent = 'Project files';
    fireEvent.input(field);
    fireEvent.blur(field);
    await flush();

    expect(vault.getFolder(folder.id)!.metadata.description).toBe('Project files');
  });
});

describe('Description UX: draft pages', () => {
  it('a fresh draft supports Add description, typing persists it on blur (draft promotion)', async () => {
    const { application, vault } = makeApplication([]);
    const draftId = await application.pageOperations.openDraft({ folderId: null });

    render(<AppLayout application={application} />);
    await flush();

    expect(getDescriptionField()).toBeNull();

    openMoreActionsMenu();
    fireEvent.click(screen.getByText('Description'));
    await flush();

    const field = getDescriptionField()!;
    expect(document.activeElement).toBe(field);

    field.textContent = 'A brand-new note about typography.';
    fireEvent.input(field);
    fireEvent.blur(field);
    await flush();

    await waitFor(() => {
      expect(vault.getPage(draftId)).toBeDefined();
    });
    expect(vault.getPage(draftId)!.metadata.description).toBe(
      'A brand-new note about typography.'
    );
  });

  it('opening a draft\'s empty editor and blurring without typing does not promote it', async () => {
    const { application, vault } = makeApplication([]);
    const draftId = await application.pageOperations.openDraft({ folderId: null });

    render(<AppLayout application={application} />);
    await flush();

    openMoreActionsMenu();
    fireEvent.click(screen.getByText('Description'));
    await flush();

    const field = getDescriptionField()!;
    fireEvent.blur(field);
    await flush();

    expect(vault.getPage(draftId)).toBeUndefined();
    expect(getDescriptionField()).toBeNull();
  });
});
