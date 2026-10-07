// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppLayout } from '../app-layout/AppLayout';
import { Application } from '@core/application/Application';
import { collectionViewKeyForFolder } from '@core/application/collection/collectionViewKey';
import { CollectionViewConfigStore } from '@core/application/collection/CollectionViewConfigStore';
import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '@core/vault/providers/SelfWriteRegistry';
import { PageCreator } from '@core/application/page/PageCreator';
import { PageFactory } from '@core/application/page/PageFactory';
import { PageBuilder } from '@core/vault/ingest/PageBuilder';
import { FolderBuilder } from '@core/vault/ingest/FolderBuilder';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import type { Folder } from '@core/vault/models/Folder';
import type { Page } from '@core/vault/models/Page';

/**
 * CHARACTERIZATION of what each collection kind gets TODAY through the real AppLayout/PageHost
 * composition — written before the property-registry / collection-definition migration. It pins the
 * decisions that currently live as scattered conditionals in PageHost (header actions, create cards,
 * default layout) so a CollectionDefinition can replace them without silently changing any.
 *
 *  - "CURRENT BEHAVIOR" = must survive the migration unless a product decision changes it.
 *  - "KNOWN DEFECT:"    = confirmed wrong/inconsistent, deliberately not fixed yet; a tripwire that is
 *                         expected to be rewritten when the defect is fixed.
 *  - "FIXED BY …"       = was a known defect, fixed by the collection-definition migration; kept to
 *                         prove it stays fixed.
 *
 * Daily Notes collection pages are already characterized end-to-end by
 * PageHost.dailyNotesCollections.test.tsx (feature-flagged off by default) and are not repeated.
 */

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
});

const ROOT = '/vault';
const folderBuilder = new FolderBuilder();

function folder(path: string, parentPath: string | null): Folder {
  // A folder's id is its path when it has no frontmatter id.
  return folderBuilder.build({ parentId: parentPath, directory: { path, parentPath, frontmatter: null } });
}

function pageIn(folderPath: string, id: string, name: string): Page {
  return new PageBuilder(ROOT).build({
    parentId: folderPath,
    page: {
      path: `${folderPath}/${name}.md`,
      directoryPath: folderPath,
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content: `${name} body`,
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
}

const PROJECTS = `${ROOT}/Projects`;
const INBOX = `${ROOT}/Inbox`;
const TEMPLATES = `${ROOT}/Templates`;
const ARCHIVE = `${ROOT}/Archive`;

function makeApplication(collectionViewConfigStore?: CollectionViewConfigStore): Application {
  const folders = [
    folder(PROJECTS, null),
    folder(INBOX, null),
    folder(TEMPLATES, null),
    folder(ARCHIVE, null),
    folder(`${PROJECTS}/Sub`, PROJECTS),
    folder(`${TEMPLATES}/Meetings`, TEMPLATES),
    folder(`${INBOX}/Triage`, INBOX),
  ];
  const pages = [
    pageIn(PROJECTS, 'plan', 'Plan'),
    pageIn(INBOX, 'captured', 'Captured'),
    pageIn(TEMPLATES, 'tpl', 'Meeting'),
    pageIn(ARCHIVE, 'old', 'Old note'),
  ];
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
  const application = new Application(
    vault,
    new InMemoryVaultFileSystem(),
    new SelfWriteRegistry(),
    undefined,
    undefined,
    collectionViewConfigStore
  );
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  return application;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function renderFolder(path: string, persistedLayout?: 'list' | 'table' | 'card'): Promise<Application> {
  const application = makeApplication();
  if (persistedLayout) {
    application.collectionViewConfigStore.update(collectionViewKeyForFolder(path), { layout: persistedLayout });
  }
  await application.folderOperations.open(path);
  render(<AppLayout application={application} />);
  await flush();
  return application;
}

/** Opens a folder whose saved Configure state was written by an earlier build or the current one — raw, exactly as in workspace.json. */
async function renderFolderSavedAs(path: string, savedEntry: Record<string, unknown>): Promise<Application> {
  const fileSystem = new InMemoryVaultFileSystem({
    [`${ROOT}/.clutter/workspace.json`]: JSON.stringify({
      collectionViewConfig: { [collectionViewKeyForFolder(path)]: savedEntry },
    }),
  });
  const application = makeApplication(await CollectionViewConfigStore.load(fileSystem, ROOT));
  await application.folderOperations.open(path);
  render(<AppLayout application={application} />);
  await flush();
  return application;
}

const tableHeaders = () =>
  [...document.querySelectorAll('.collection-table__header-cell')].map((cell) => cell.textContent);

const hasCreateFolderCard = () => document.querySelector('.collection-grid--fixed-rows > .collection-card--empty') !== null;
const newButton = () => document.querySelector<HTMLButtonElement>('button[aria-label="New"]');
const hasTable = () => document.querySelector('.collection-table') !== null;
// The notes in a List — not its trailing "New Note" action row.
const noteRows = () => document.querySelectorAll('.collection-list .collection-row:not(.collection-row--tone-action)').length;
const bodyHasText = (text: string) => (document.body.textContent ?? '').includes(text);

/** Opens the header's "New" menu and returns its rows (empty when "New" is a single-action button). */
function newMenuRows(): string[] {
  fireEvent.click(newButton()!);
  return [...document.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent?.trim() ?? '');
}

describe('CURRENT BEHAVIOR — header actions and create affordances, by collection kind', () => {
  it('an ordinary folder: a New menu with New note / New folder / From template, a create-folder card, Table by default', async () => {
    await renderFolder(PROJECTS);

    expect(newButton()).not.toBeNull();
    expect(newMenuRows()).toEqual(['New note', 'New folder', 'From template']);
    expect(hasCreateFolderCard()).toBe(true);
    expect(hasTable()).toBe(true);
  });

  it('Inbox: a New menu with New note and From template — no New folder, no create-folder card, no folders section; Table by default', async () => {
    await renderFolder(INBOX);

    expect(newButton()).not.toBeNull();
    expect(newMenuRows()).toEqual(['New note', 'From template']);
    expect(hasCreateFolderCard()).toBe(false);
    expect(hasTable()).toBe(true);
    expect(bodyHasText('Captured')).toBe(true);
    // Inbox lists only its notes: the subfolder that exists in the vault is not drawn.
    expect(bodyHasText('Triage')).toBe(false);
    expect(document.querySelectorAll('.collection-grid--fixed-rows')).toHaveLength(0);
  });

  it('Inbox\'s table ends with the generic Create row, like any collection that can create', async () => {
    await renderFolder(INBOX);

    expect(document.querySelectorAll('.collection-table-row--new-item')).toHaveLength(1);
    expect(bodyHasText('Create')).toBe(true);
  });

  it('Templates (flat): a single New template button — no menu, no New folder, no create-folder card, NO From template; Table by default', async () => {
    await renderFolder(TEMPLATES);

    expect(newButton()).toBeNull();
    expect(document.querySelector('button[aria-label="New template"]')).not.toBeNull();
    expect(hasCreateFolderCard()).toBe(false);
    expect(hasTable()).toBe(true);
  });

  it('Archive: NO header action, NO create-folder card, NO New Note row (nothing is created in the Archive); Table by default', async () => {
    await renderFolder(ARCHIVE);

    expect(newButton()).toBeNull();
    expect(hasCreateFolderCard()).toBe(false);
    expect(bodyHasText('New Note')).toBe(false);
    expect(hasTable()).toBe(true);
    expect(bodyHasText('Old note')).toBe(true);
  });

  it('a reserved folder has no editable title and no emoji / More-actions controls, while an ordinary folder is renameable', async () => {
    await renderFolder(INBOX);
    expect(document.querySelector('.page-title [contenteditable="true"], .page-title input')).toBeNull();
    cleanup();

    await renderFolder(PROJECTS);
    expect(document.querySelector('.page-title [contenteditable="true"], .page-title input, .page-title textarea')).not.toBeNull();
  });
});

describe('CURRENT BEHAVIOR — a persisted layout applies per folder, to Inbox like any other', () => {
  it('Inbox honours a persisted List layout (rows, no table)', async () => {
    await renderFolder(INBOX, 'list');

    expect(hasTable()).toBe(false);
    expect(noteRows()).toBe(1);
  });

  it('Inbox honours a persisted Card layout (a note card, no table)', async () => {
    await renderFolder(INBOX, 'card');

    expect(hasTable()).toBe(false);
    expect(document.querySelectorAll('.collection-card:not(.collection-card--empty)').length).toBeGreaterThan(0);
    expect(noteRows()).toBe(0);
  });
});

describe('FIXED BY THE COLLECTION DEFINITION — Templates lists the subfolders it lets you create', () => {
  // Before: PageHost emptied Templates' folders section (`folders=[]`) while still wiring the create-folder
  // card, so a folder created there never appeared. Templates is now an ordinary folder hierarchy that can
  // create notes and folders (and is not offered "From template").
  const folderCards = () =>
    document.querySelectorAll('.collection-grid--fixed-rows > .collection-card:not(.collection-card--empty)');

  it('Templates are flat: no create-folder card — a folder already on disk is still listed, never created from here', async () => {
    await renderFolder(TEMPLATES);

    expect(hasCreateFolderCard()).toBe(false);
    expect(folderCards()).toHaveLength(1);
    expect(bodyHasText('Meetings')).toBe(true);
  });

  it('an ordinary folder lists its subfolders next to the same create-folder card — Templates now behaves the same', async () => {
    await renderFolder(PROJECTS);

    expect(folderCards()).toHaveLength(1);
    expect(bodyHasText('Sub')).toBe(true);
  });

  it('Templates still has no folders to create and no From template', async () => {
    await renderFolder(TEMPLATES);

    expect(document.querySelector('button[aria-label="New template"]')).not.toBeNull();
    expect(bodyHasText('From template')).toBe(false);
    expect(bodyHasText('New folder')).toBe(false);
  });

  it('ordinary folders — including a nested one — still say New note, with From template', async () => {
    await renderFolder(PROJECTS);
    expect(newMenuRows()).toEqual(['New note', 'New folder', 'From template']);
    cleanup();

    await renderFolder(`${PROJECTS}/Sub`);
    expect(newMenuRows()).toEqual(['New note', 'New folder', 'From template']);
  });
});

describe('FIXED BY THE ARCHIVE MIGRATION — the Archive has no Card', () => {
  it('a persisted Card layout on the Archive resolves to its default, the Table', async () => {
    await renderFolder(ARCHIVE, 'card');

    expect(hasTable()).toBe(true);
    expect(bodyHasText('Old note')).toBe(true);
    expect(document.querySelectorAll('.collection-card:not(.collection-card--empty)')).toHaveLength(0);
  });

  it('a persisted List layout on the Archive is honoured', async () => {
    await renderFolder(ARCHIVE, 'list');

    expect(hasTable()).toBe(false);
    expect(noteRows()).toBe(1);
  });

  it('the same persisted Card layout on an ordinary folder DOES draw note cards (so the fallback is the Archive\'s alone)', async () => {
    await renderFolder(PROJECTS, 'card');

    expect(noteRows()).toBe(0);
    expect(document.querySelectorAll('.collection-card:not(.collection-card--empty)').length).toBeGreaterThan(0);
  });
});

describe('CURRENT BEHAVIOR — saved Configure state, resolved through the real composition', () => {
  it('a saved property override hides that property\'s column — and only that one', async () => {
    await renderFolderSavedAs(PROJECTS, { layout: 'table', propertyOverrides: { cover: false } });

    expect(tableHeaders()).toEqual(['Name', 'Created', 'Last edited']);
  });

  it('with nothing saved, a note collection shows every default property it offers', async () => {
    await renderFolder(PROJECTS);

    // (Cover image is a column only when the host can change covers — a note collection can.)
    expect(tableHeaders()).toEqual(['Name', 'Cover image', 'Created', 'Last edited']);
  });

  it('an entry saved before the property registry (the full snapshot) is converted: what the user had hidden stays hidden', async () => {
    await renderFolderSavedAs(PROJECTS, {
      layout: 'table',
      properties: { description: true, created: false, updated: true, archived: true, cover: true, preview: true, title: true, size: true },
    });

    expect(tableHeaders()).toEqual(['Name', 'Cover image', 'Last edited']);
  });

  it('an old snapshot of nothing but defaults changes nothing — including the properties a note collection never offers', async () => {
    await renderFolderSavedAs(PROJECTS, {
      properties: { description: true, created: true, updated: true, archived: true, cover: true, preview: true, title: true, size: true },
    });

    expect(tableHeaders()).toEqual(['Name', 'Cover image', 'Created', 'Last edited']);
  });

  it('the Archive\'s old snapshot hides its Archived column when the user had hidden it', async () => {
    await renderFolderSavedAs(ARCHIVE, {
      layout: 'table',
      properties: { description: true, created: true, updated: true, archived: false, cover: true, preview: true, title: true, size: true },
    });

    // The snapshot hid the archive date: a real choice. Its other choices (Created, Last edited, File size) are ignored — the Archive no longer offers them.
    expect(tableHeaders()).toEqual(['Name', 'Type']);
  });

  it('the Archive shows its Archived column by default', async () => {
    await renderFolder(ARCHIVE);

    // Name, then the Archive's own Type column, then its visible properties in registry order.
    expect(tableHeaders()).toEqual(['Name', 'Type', 'Delete']);
  });

  it('a saved `name: false` cannot hide the Name column — Name is required in a table', async () => {
    await renderFolderSavedAs(PROJECTS, { layout: 'table', propertyOverrides: { name: false } });

    expect(tableHeaders()[0]).toBe('Name');
  });

  it('an old snapshot\'s `title: false` (the Asset card\'s name toggle) cannot hide a note collection\'s name either', async () => {
    await renderFolderSavedAs(PROJECTS, {
      layout: 'table',
      properties: { description: true, created: true, updated: true, archived: true, cover: true, preview: true, title: false, size: true },
    });

    expect(tableHeaders()[0]).toBe('Name');
  });

  it('a saved sort by a property this collection does not offer falls back to its default sort (Name, A→Z)', async () => {
    await renderFolderSavedAs(INBOX, { layout: 'list', sort: { property: 'size', direction: 'up' } });

    expect(noteRows()).toBe(1);
    expect(bodyHasText('Captured')).toBe(true);
  });

  it('Configure shows Name ticked and locked, and the same properties in every layout', async () => {
    await renderFolder(PROJECTS);
    fireEvent.click(document.querySelector('button.page-title__button-outline-fill[aria-haspopup="menu"]')!);
    fireEvent.click([...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent === 'Properties')!);

    const rows = [...document.querySelectorAll('[role="menuitem"]')];
    expect(rows.map((row) => row.textContent)).toEqual(['Name', 'Description', 'Cover image', 'Created', 'Last edited']);
    expect(rows[0]).toHaveAttribute('aria-disabled', 'true');
    expect(rows[1]).not.toHaveAttribute('aria-disabled');
  });
});

describe('CURRENT BEHAVIOR — one Create capability per collection (header and body share the handler)', () => {
  it('Inbox: the table\'s Create row and the header\'s "New note" both run the same note creation in Inbox', async () => {
    const application = makeApplication();
    const openDraft = vi.spyOn(application.pageOperations, 'openDraft').mockResolvedValue(undefined as never);
    await application.folderOperations.open(INBOX);
    render(<AppLayout application={application} />);
    await flush();

    fireEvent.click(document.querySelector('.collection-table-row--new-item')!);
    expect(openDraft).toHaveBeenCalledTimes(1);
    expect(openDraft).toHaveBeenLastCalledWith({ folderId: INBOX });

    fireEvent.click(newButton()!);
    fireEvent.click([...document.querySelectorAll('[role="menuitem"]')].find((i) => i.textContent === 'New note')!);
    expect(openDraft).toHaveBeenCalledTimes(2);
    expect(openDraft).toHaveBeenLastCalledWith({ folderId: INBOX });
  });

  it('every layout of an ordinary folder ends with the generic Create affordance', async () => {
    for (const layout of ['list', 'table', 'card'] as const) {
      await renderFolder(PROJECTS, layout);

      const found =
        layout === 'list'
          ? document.querySelector('.collection-list > .collection-row--tone-action')
          : layout === 'table'
            ? document.querySelector('.collection-table-row--new-item')
            : document.querySelector('.collection-grid:not(.collection-grid--fixed-rows) > .collection-card--empty');
      expect(found, layout).not.toBeNull();
      cleanup();
    }
  });

  it('a completely empty collection shows the empty state and no Create row (the header "+" is the way in)', async () => {
    await renderFolder(`${PROJECTS}/Sub`);

    expect(document.querySelector('[role="status"]')).not.toBeNull();
    expect(document.querySelector('.collection-table-row--new-item')).toBeNull();
    expect(newButton()).not.toBeNull();
  });
});
