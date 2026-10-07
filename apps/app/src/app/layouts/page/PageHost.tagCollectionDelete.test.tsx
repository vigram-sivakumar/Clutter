// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppLayout } from '../app-layout/AppLayout';
import { Application } from '@core/application/Application';
import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { TagBuilder } from '@core/vault/knowledge/TagBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '@core/vault/providers/SelfWriteRegistry';
import { PageCreator } from '@core/application/page/PageCreator';
import { PageFactory } from '@core/application/page/PageFactory';
import { PageBuilder } from '@core/vault/ingest/PageBuilder';
import { collectionViewKeyForTag } from '@core/application/collection/collectionViewKey';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import type { Page } from '@core/vault/models/Page';
import type { TagMetadataEntry } from '@core/vault/models/Tag';

/**
 * The Tag collection page's Delete action: the top bar's More actions → Delete, behind the shared
 * confirmation surface, calling TagOperations.deleteTag and — only on a complete delete — forgetting
 * the tag's own UI state and leaving for the workspace.
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
  vi.restoreAllMocks();
});

const ROOT = '/vault';
const TAGS_FILE = '/.clutter/tags.json';

function notePage(id: string, content: string): Page {
  return new PageBuilder(ROOT).build({
    parentId: null,
    page: {
      path: `${ROOT}/${id}.md`,
      directoryPath: ROOT,
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content,
      analysis: {
        headings: [],
        blockReferences: [],
        tasks: [],
        tags: [{ name: 'design', startOffset: content.indexOf('#'), endOffset: content.indexOf('#') + 7 }],
        links: [],
        embeds: [],
      },
    },
  });
}

const NOTES = { a: 'Plan #design', b: 'Also #design' };

function makeApplication(definitions: Record<string, TagMetadataEntry>) {
  const pages = Object.entries(NOTES).map(([id, content]) => notePage(id, content));
  const fileSystem = new InMemoryVaultFileSystem({
    [TAGS_FILE]: JSON.stringify({ version: 2, tags: definitions }),
    ...Object.fromEntries(pages.map((page) => [page.path, page.source.markdown])),
  });
  const metadata = new Map(Object.entries(definitions));
  const vault = new Vault(
    ROOT,
    pages,
    [],
    new TagBuilder().build(pages, metadata),
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder(),
    metadata,
    []
  );
  const application = new Application(vault, fileSystem, new SelfWriteRegistry());
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());

  return { application, vault, fileSystem };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function renderTagPage(definitions: Record<string, TagMetadataEntry>) {
  const app = makeApplication(definitions);
  app.application.navigation.openTag('design');
  render(<AppLayout application={app.application} />);
  await flush();
  return app;
}

// The top bar's More actions — the title section has its own (Emoji/Cover/…).
const topBarMoreActions = () =>
  [...document.querySelectorAll<HTMLButtonElement>('button[aria-label="More actions"]')].find(
    (button) => !button.closest('.page-header-controls')
  );
const menuItems = () => [...document.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent?.trim());
const confirmation = () => document.querySelector<HTMLElement>('.confirmation');
const openDeleteConfirmation = async () => {
  fireEvent.click(topBarMoreActions()!);
  await flush();
  fireEvent.click([...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent?.trim() === 'Delete')!);
  await flush();
};
const confirmDelete = async () => {
  fireEvent.click(within(confirmation()!).getByRole('button', { name: 'Delete' }));
  await flush();
};

describe('Tag collection page — Delete', () => {
  it('offers Delete in the top bar\'s More actions; Workspace and Favorites offer none', async () => {
    await renderTagPage({ design: { name: 'design', icon: '🎨' } });

    fireEvent.click(topBarMoreActions()!);
    await flush();
    expect(menuItems()).toEqual(['Delete']);
    cleanup();

    const { application } = makeApplication({});
    application.workspace.openFilteredView({ kind: 'favorites' });
    render(<AppLayout application={application} />);
    await flush();
    expect(topBarMoreActions()).toBeUndefined();
  });

  it('opens the confirmation naming the tag', async () => {
    const { application } = await renderTagPage({ design: { name: 'design', icon: '🎨' } });
    const deleteTag = vi.spyOn(application.tagOperations, 'deleteTag');

    await openDeleteConfirmation();

    expect(within(confirmation()!).getByText('Delete design?')).toBeInTheDocument();
    expect(
      within(confirmation()!).getByText('This will permanently delete the tag. You can\u2019t undo this action.')
    ).toBeInTheDocument();
    expect(within(confirmation()!).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(deleteTag).not.toHaveBeenCalled();
  });

  it('Cancel deletes nothing', async () => {
    const { application, vault } = await renderTagPage({ design: { name: 'design', icon: '🎨' } });
    const deleteTag = vi.spyOn(application.tagOperations, 'deleteTag');
    await openDeleteConfirmation();

    fireEvent.click(within(confirmation()!).getByRole('button', { name: 'Cancel' }));
    await flush();

    expect(deleteTag).not.toHaveBeenCalled();
    expect(vault.getTagByName('design')).toBeDefined();
    expect(application.workspace.activeView).toEqual({ type: 'filtered-view', view: { kind: 'tag', tagName: 'design' } });
  });

  it('confirming calls deleteTag, removes the tag everywhere, and navigates to the workspace', async () => {
    const { application, vault, fileSystem } = await renderTagPage({ design: { name: 'design', icon: '🎨' } });
    const deleteTag = vi.spyOn(application.tagOperations, 'deleteTag');
    await openDeleteConfirmation();

    await confirmDelete();
    await vi.waitFor(() => expect(application.workspace.activeView).toEqual({ type: 'filtered-view', view: { kind: 'workspace' } }));

    expect(deleteTag).toHaveBeenCalledWith('design');
    expect(vault.getTagByName('design')).toBeUndefined();
    expect(vault.getPage('a')!.source.markdown).not.toContain('#design');
    expect(JSON.parse(await fileSystem.readFile(TAGS_FILE)).tags.design).toBeUndefined();
  });

  it("a complete delete also forgets the tag's collection configuration and sidebar expansion", async () => {
    const { application } = await renderTagPage({ design: { name: 'design', icon: '🎨' } });
    application.collectionViewConfigStore.update(collectionViewKeyForTag('design'), { layout: 'table' });
    application.tagExpansionStore.expand('design');
    await openDeleteConfirmation();

    await confirmDelete();
    await vi.waitFor(() => expect(application.workspace.activeView).toEqual({ type: 'filtered-view', view: { kind: 'workspace' } }));

    expect(application.collectionViewConfigStore.get(collectionViewKeyForTag('design'))).toBeUndefined();
    expect(application.tagExpansionStore.isExpanded('design')).toBe(false);
  });

  it('an incomplete delete keeps the definition, the UI state and the page', async () => {
    const { application, vault, fileSystem } = await renderTagPage({ design: { name: 'design', icon: '🎨' } });
    application.collectionViewConfigStore.update(collectionViewKeyForTag('design'), { layout: 'table' });
    application.tagExpansionStore.expand('design');
    // A note changed on disk since Clutter read it: the batch must skip it, never overwrite it.
    await fileSystem.writeFile(`${ROOT}/b.md`, 'Also #design, edited elsewhere');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const deleteTag = vi.spyOn(application.tagOperations, 'deleteTag');
    await openDeleteConfirmation();

    await confirmDelete();
    await vi.waitFor(() => expect(deleteTag).toHaveBeenCalled());
    await flush();

    expect((await deleteTag.mock.results[0]!.value).complete).toBe(false);
    expect(JSON.parse(await fileSystem.readFile(TAGS_FILE)).tags.design).toBeDefined();
    expect(vault.getTagByName('design')).toBeDefined();
    expect(application.collectionViewConfigStore.get(collectionViewKeyForTag('design'))).toBeDefined();
    expect(application.tagExpansionStore.isExpanded('design')).toBe(true);
    expect(application.workspace.activeView).toEqual({ type: 'filtered-view', view: { kind: 'tag', tagName: 'design' } });
  });
});
