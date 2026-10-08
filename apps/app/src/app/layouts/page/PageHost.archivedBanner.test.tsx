// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
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
import { FrontmatterSerializer } from '@core/vault/ingest/FrontmatterSerializer';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import { DailyNotePath } from '@core/vault/ingest/DailyNotePath';
import type { Page } from '@core/vault/models/Page';
import type { Folder } from '@core/vault/models/Folder';
import type { VaultResource } from '@core/vault/models/VaultResource';

/** The archived banner in the top bar of an effectively archived Note, Daily Note and Folder. */

// Application's constructor and the image URL resolver reach Tauri IPC with no runtime to answer under vitest.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
  convertFileSrc: (path: string) => `app://${path}`,
}));

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
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);

const ROOT = '/vault';
const ISO = '2026-01-15';
const DATE = new Date(2026, 0, 15);

/**
 * Archived state is physical location: a fixture meant to be archived (`status: 'archived'`) is
 * placed inside Archive/, since status alone no longer archives anything.
 */
function archivedLocation(path: string): string {
  return path.startsWith(`${ROOT}/Archive/`) ? path : `${ROOT}/Archive/${path.slice(path.lastIndexOf('/') + 1)}`;
}

function buildPage(path: string, id: string, frontmatter: Record<string, unknown> = {}): Page {
  if (frontmatter.status === 'archived') path = archivedLocation(path);
  return new PageBuilder(ROOT).build({
    parentId: null,
    page: {
      path,
      directoryPath: path.slice(0, path.lastIndexOf('/')),
      frontmatter: { id, ...frontmatter },
      frontmatterAnalysis: { aliases: [] },
      content: '',
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
}

function makeApplication(pages: Page[] = [], folders: Folder[] = [], resources: VaultResource[] = []): Application {
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
    resources
  );
  const fileSystem = new InMemoryVaultFileSystem();
  for (const page of pages) {
    fileSystem.seedFile(page.path, new FrontmatterSerializer().serializeDocument(page, page.source.markdown));
  }
  for (const resource of resources) {
    fileSystem.seedFile(resource.path, 'binary');
  }
  const application = new Application(vault, fileSystem, new SelfWriteRegistry());
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  return application;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}


function buildFolder(id: string, path: string, status: 'active' | 'archived', favorite = false): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId: null,
    metadata: {
      icon: '📁',
      favorite,
      description: null,
      cover: null,
      coverHidden: false,
      coverLayout: 'side',
      coverPositionAbove: 50,
      coverPositionSide: 50,
      status,
      archivedAt: null,
      originalPath: null,
      originalParentId: null,
    },
  };
}

const ARCHIVED_AT = new Date(2026, 9, 8, 14, 30).toISOString();
const BANNER_TEXT = 'This has been archived on 08 October 2026';
const banner = () => document.querySelector<HTMLElement>('.topbar .banner');
const restoreButton = () =>
  Array.from(banner()?.querySelectorAll('button') ?? []).find((button) => button.textContent === 'Restore');

async function openPage(page: Page) {
  const application = makeApplication([page]);
  await application.pageOperations.open(page.id);
  render(<AppLayout application={application} />);
  await flush();
  return application;
}

async function openFolder(folder: Folder) {
  const application = makeApplication([], [folder]);
  await application.folderOperations.open(folder.id);
  render(<AppLayout application={application} />);
  await flush();
  return application;
}

describe('archived Note', () => {
  it('shows the banner with its archivedAt date and a Restore that restores it', async () => {
    const page = buildPage(`${ROOT}/Archive/Note.md`, 'note-1', { status: 'archived', archivedAt: ARCHIVED_AT });
    const application = await openPage(page);
    const restore = vi.spyOn(application.pageOperations, 'restore');

    expect(banner()?.textContent).toContain(BANNER_TEXT);
    fireEvent.click(restoreButton()!);

    expect(restore).toHaveBeenCalledWith('note-1');
  });

  it('a location-only archived note (no archivedAt) says so without inventing a date', async () => {
    await openPage(buildPage(`${ROOT}/Archive/Note.md`, 'note-1', {}));

    expect(banner()?.textContent).toContain('This has been archived');
    expect(banner()?.textContent).not.toContain(' on ');
    expect(restoreButton()).toBeDefined();
  });

  it('a note nested in an archived folder has no Restore of its own and no date', async () => {
    const folder = buildFolder('folder-1', `${ROOT}/Archive/Projects`, 'archived');
    const page = buildPage(`${folder.path}/Note.md`, 'note-1', {});
    const application = makeApplication([{ ...page, parentId: 'folder-1' }], [folder]);
    await application.pageOperations.open('note-1');
    render(<AppLayout application={application} />);
    await flush();

    expect(banner()?.textContent).toBe('This has been archived');
    expect(restoreButton()).toBeUndefined();
  });
});

describe('archived Daily Note', () => {
  it('shows the banner with its archivedAt date and a Restore', async () => {
    const page = buildPage(DailyNotePath.absoluteFrom(ROOT, DATE), `daily-${ISO}`, {
      status: 'archived',
      archivedAt: ARCHIVED_AT,
    });
    const application = await openPage(page);
    const restore = vi.spyOn(application.pageOperations, 'restore');

    expect(banner()?.textContent).toContain(BANNER_TEXT);
    fireEvent.click(restoreButton()!);

    expect(restore).toHaveBeenCalledWith(`daily-${ISO}`);
  });
});

describe('archived Folder', () => {
  it('shows the banner with its archivedAt date and a Restore that restores it', async () => {
    const base = buildFolder('f1', `${ROOT}/Archive/Projects`, 'archived');
    const application = await openFolder({ ...base, metadata: { ...base.metadata, archivedAt: ARCHIVED_AT } });
    const restore = vi.spyOn(application.folderOperations, 'restore');

    expect(banner()?.textContent).toContain(BANNER_TEXT);
    fireEvent.click(restoreButton()!);

    expect(restore).toHaveBeenCalledWith('f1');
  });

  it('a location-only archived folder shows no fabricated date', async () => {
    await openFolder(buildFolder('f1', `${ROOT}/Archive/Projects`, 'archived'));

    expect(banner()?.textContent).toContain('This has been archived');
    expect(banner()?.textContent).not.toContain(' on ');
  });
});

describe('active resources', () => {
  it('render no banner', async () => {
    await openPage(buildPage(`${ROOT}/Note.md`, 'note-1', {}));
    expect(banner()).toBeNull();
    cleanup();

    await openPage(buildPage(DailyNotePath.absoluteFrom(ROOT, DATE), `daily-${ISO}`, {}));
    expect(banner()).toBeNull();
    cleanup();

    await openFolder(buildFolder('f1', `${ROOT}/Projects`, 'active'));
    expect(banner()).toBeNull();
  });
});
