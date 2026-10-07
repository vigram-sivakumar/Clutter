// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
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
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import type { Page } from '@core/vault/models/Page';
import type { TagMetadataEntry } from '@core/vault/models/Tag';

/**
 * The Tag collection page's title: it shows the tag's emoji and edits it through the page header's
 * existing emoji controls (the same ones a folder's page uses), writing the tag's definition via
 * TagOperations — not a tag-specific title UI.
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

function notePage(): Page {
  return new PageBuilder(ROOT).build({
    parentId: null,
    page: {
      path: `${ROOT}/Plan.md`,
      directoryPath: ROOT,
      frontmatter: { id: 'plan' },
      frontmatterAnalysis: { aliases: [] },
      content: 'Plan #design',
      analysis: {
        headings: [],
        blockReferences: [],
        tasks: [],
        tags: [{ name: 'design', startOffset: 5, endOffset: 12 }],
        links: [],
        embeds: [],
      },
    },
  });
}

function makeApplication(definitions: Record<string, TagMetadataEntry>) {
  const fileSystem = new InMemoryVaultFileSystem({
    [TAGS_FILE]: JSON.stringify({ version: 2, tags: definitions }),
  });
  const metadata = new Map(Object.entries(definitions));
  const pages = [notePage()];
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

const titleEmoji = () => document.querySelector('.page-header-controls__emoji .emoji-icon')?.textContent ?? null;
// The title section's More actions (Emoji/Cover/…) — a tag page also has the top bar's, which holds Delete.
const moreActions = () =>
  document.querySelector<HTMLButtonElement>('.page-header-controls button[aria-label="More actions"]');
const pickEmoji = async (label: string) => {
  const item = document.querySelector<HTMLButtonElement>(`.emoji-tray__item[aria-label="${label}"]`);
  expect(item, `emoji "${label}" in the picker`).not.toBeNull();
  fireEvent.click(item!);
  await flush();
};
const savedIcon = async (fileSystem: InMemoryVaultFileSystem) =>
  JSON.parse(await fileSystem.readFile(TAGS_FILE)).tags.design?.icon;

describe('Tag collection page — title emoji', () => {
  it("shows the tag's emoji in the title section", async () => {
    await renderTagPage({ design: { name: 'design', icon: '🎨' } });

    expect(titleEmoji()).toBe('🎨');
  });

  it('clicking the emoji opens the existing emoji picker; picking one updates the title at once and persists to the tag definition', async () => {
    const { vault, fileSystem } = await renderTagPage({ design: { name: 'design', icon: '🎨' } });

    fireEvent.click(document.querySelector('.page-header-controls__emoji')!);
    await flush();
    expect(document.querySelector('.emoji-tray')).not.toBeNull();

    await pickEmoji('rocket');

    expect(titleEmoji()).toBe('🚀');
    expect(await savedIcon(fileSystem)).toBe('🚀');
    expect(vault.getTagByName('design')?.icon).toBe('🚀');
  });

  it("removing the emoji clears it from the title and from the definition — and the tag itself stays", async () => {
    const { vault, fileSystem } = await renderTagPage({ design: { name: 'design', icon: '🎨' } });

    fireEvent.click(document.querySelector('.page-header-controls__emoji')!);
    await flush();
    const remove = [...document.querySelectorAll<HTMLButtonElement>('.emoji-tray button')].find((button) =>
      /remove|delete|trash/i.test(button.getAttribute('aria-label') ?? button.title ?? '')
    );
    expect(remove).toBeDefined();
    fireEvent.click(remove!);
    await flush();

    expect(titleEmoji()).toBeNull();
    expect(await savedIcon(fileSystem)).toBeUndefined();
    expect(vault.getTagByName('design')).toBeDefined();
  });

  it('with no emoji there is no emoji button; the existing More actions → Emoji sets the first one', async () => {
    const { fileSystem } = await renderTagPage({});

    expect(titleEmoji()).toBeNull();
    fireEvent.click(moreActions()!);
    await flush();
    const emojiItem = [...document.querySelectorAll('[role="menuitem"]')].find(
      (item) => item.textContent?.trim() === 'Change icon'
    );
    expect(emojiItem).toBeDefined();
    // Only the capability this page supplies is offered.
    expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(1);

    fireEvent.click(emojiItem!);
    await flush();
    await pickEmoji('light bulb');

    expect(titleEmoji()).toBe('💡');
    expect(await savedIcon(fileSystem)).toBe('💡');
  });

  it('Workspace and Favorites pages get no More actions and no emoji editing', async () => {
    const { application } = makeApplication({});
    application.workspace.openFilteredView({ kind: 'favorites' });
    render(<AppLayout application={application} />);
    await flush();

    expect(moreActions()).toBeNull();
    expect(titleEmoji()).toBeNull();
  });
});
