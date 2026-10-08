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
import type { Page } from '@core/vault/models/Page';
import type { Folder } from '@core/vault/models/Folder';
import type { VaultResource } from '@core/vault/models/VaultResource';

/** An untitled (auto-named) note's "New Note" title placeholder survives archiving and restoring. */

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


const pageTitle = () => document.querySelector<HTMLElement>('.page-title')!;
const editableTitle = () => pageTitle().querySelector<HTMLElement>('[contenteditable]');

async function open(page: Page) {
  const application = makeApplication([page]);
  await application.pageOperations.open(page.id);
  render(<AppLayout application={application} />);
  await flush();
  return application;
}

describe('an empty (untitled) note', () => {
  it('active: the editable title carries the New Note placeholder', async () => {
    await open(buildPage(`${ROOT}/Untitled.md`, 'note-1', {}));

    expect(editableTitle()?.getAttribute('data-placeholder')).toBe('New Note');
  });

  it('archived: the read-only title still represents it as New Note', async () => {
    await open(buildPage(`${ROOT}/Archive/Untitled.md`, 'note-1', { status: 'archived' }));

    expect(editableTitle()).toBeNull();
    expect(pageTitle().textContent).toBe('New Note');
  });

  it('restoring it brings back the editable placeholder title', async () => {
    const page = buildPage(`${ROOT}/Archive/Untitled.md`, 'note-1', {
      status: 'archived',
      originalPath: `${ROOT}/Untitled.md`,
    });
    await open(page);

    fireEvent.click(Array.from(document.querySelectorAll('.banner button')).find((b) => b.textContent === 'Restore')!);
    await flush();

    expect(editableTitle()?.getAttribute('data-placeholder')).toBe('New Note');
  });
});

describe('a titled archived note', () => {
  it('keeps showing its own title, not the placeholder', async () => {
    await open(buildPage(`${ROOT}/Archive/Plans.md`, 'note-1', { status: 'archived' }));

    expect(pageTitle().textContent).toBe('Plans');
  });
});
