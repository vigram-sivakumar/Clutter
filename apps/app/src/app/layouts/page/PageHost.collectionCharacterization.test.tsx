// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppLayout } from '../app-layout/AppLayout';
import { Application } from '@core/application/Application';
import { collectionViewKeyForFolder } from '@core/application/collection/collectionViewKey';
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

function makeApplication(): Application {
  const folders = [
    folder(PROJECTS, null),
    folder(INBOX, null),
    folder(TEMPLATES, null),
    folder(ARCHIVE, null),
    folder(`${PROJECTS}/Sub`, PROJECTS),
    folder(`${TEMPLATES}/Meetings`, TEMPLATES),
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
  const application = new Application(vault, new InMemoryVaultFileSystem(), new SelfWriteRegistry());
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

const hasCreateFolderCard = () => document.querySelector('.collection-grid--fixed-rows > .collection-card--empty') !== null;
const newButton = () => document.querySelector<HTMLButtonElement>('button[aria-label="New"]');
const hasTable = () => document.querySelector('.collection-table') !== null;
const noteRows = () => document.querySelectorAll('.collection-list .collection-row').length;
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

  it('Inbox: NO header action, NO create-folder card, NO New Note row — just the Configure control; Table by default', async () => {
    await renderFolder(INBOX);

    expect(newButton()).toBeNull();
    expect(hasCreateFolderCard()).toBe(false);
    expect(bodyHasText('New Note')).toBe(false);
    expect(hasTable()).toBe(true);
    expect(bodyHasText('Captured')).toBe(true);
    expect(document.querySelector('[aria-haspopup="menu"]')).not.toBeNull(); // Configure is there
  });

  it('Templates: a New menu with New note and New folder — and NO From template (it is the template source); Table by default', async () => {
    await renderFolder(TEMPLATES);

    expect(newButton()).not.toBeNull();
    expect(newMenuRows()).toEqual(['New note', 'New folder']);
    expect(hasCreateFolderCard()).toBe(true);
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

describe('KNOWN DEFECT — Templates offers folders it then never shows', () => {
  it('KNOWN DEFECT: Templates draws a create-folder card but hides its own subfolders from the page (the folders section is emptied for it)', async () => {
    await renderFolder(TEMPLATES);

    const folderCards = document.querySelectorAll('.collection-grid--fixed-rows > .collection-card:not(.collection-card--empty)');
    expect(hasCreateFolderCard()).toBe(true);
    expect(folderCards).toHaveLength(0); // `Meetings` exists in the vault but is not listed
    expect(bodyHasText('Meetings')).toBe(false);
  });

  it('an ordinary folder lists its subfolders next to the same create-folder card', async () => {
    await renderFolder(PROJECTS);

    expect(document.querySelectorAll('.collection-grid--fixed-rows > .collection-card:not(.collection-card--empty)')).toHaveLength(1);
    expect(bodyHasText('Sub')).toBe(true);
  });
});

describe('KNOWN DEFECT — Archive Card through the real composition', () => {
  it('KNOWN DEFECT: a persisted Card layout on the Archive renders its notes as a LIST, not cards', async () => {
    await renderFolder(ARCHIVE, 'card');

    expect(hasTable()).toBe(false);
    expect(noteRows()).toBe(1); // the archived note, as a list row
    expect(bodyHasText('Old note')).toBe(true);
    // No note card is drawn: the only cards on the page would be folder cards, and the Archive has none here.
    expect(document.querySelectorAll('.collection-card:not(.collection-card--empty)')).toHaveLength(0);
  });

  it('the same persisted Card layout on an ordinary folder DOES draw note cards (so the fallback is the Archive\'s alone)', async () => {
    await renderFolder(PROJECTS, 'card');

    expect(noteRows()).toBe(0);
    expect(document.querySelectorAll('.collection-card:not(.collection-card--empty)').length).toBeGreaterThan(0);
  });
});
