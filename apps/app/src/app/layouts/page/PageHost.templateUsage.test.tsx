// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppLayout } from '../app-layout/AppLayout';
import { Application } from '@core/application/Application';
import { TemplateUsageStore } from '@core/application/templates/TemplateUsageStore';
import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '@core/vault/providers/SelfWriteRegistry';
import { PageCreator } from '@core/application/page/PageCreator';
import { PageFactory } from '@core/application/page/PageFactory';
import { PageBuilder } from '@core/vault/ingest/PageBuilder';
import { FolderBuilder } from '@core/vault/ingest/FolderBuilder';
import { FrontmatterSerializer } from '@core/vault/ingest/FrontmatterSerializer';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import type { Page } from '@core/vault/models/Page';

/**
 * Template usage through the real AppLayout -> PageHost: every successful use of a template is recorded once
 * (applied to a note from the inline row or its "+N more" picker; a note made from it through Add menu ->
 * From template or a folder's default template), a failed one is not, and the inline row, its picker and the
 * From template list show one and the same order — most recently used first, a never-used template by its
 * creation date. A folder's default template stays the configured one whatever the ranking says.
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
const PROJECTS = `${ROOT}/Projects`;
const TEMPLATES = `${ROOT}/Templates`;
const folderBuilder = new FolderBuilder();

const folder = (path: string) =>
  folderBuilder.build({ parentId: null, directory: { path, parentPath: null, frontmatter: null } });

function pageIn(folderPath: string, id: string, name: string, body: string, frontmatter: Record<string, unknown> = {}): Page {
  return new PageBuilder(ROOT).build({
    parentId: folderPath,
    page: {
      path: `${folderPath}/${name}.md`,
      directoryPath: folderPath,
      frontmatter: { id, ...frontmatter },
      frontmatterAnalysis: { aliases: [] },
      content: body,
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
}

// Created oldest -> newest: Alpha, Bravo, Charlie. Each carries a cover, so applying one also changes metadata.
const TEMPLATE_SPECS = [
  { id: 'tpl-alpha', name: 'Alpha', created: '2020-01-01T00:00:00.000Z' },
  { id: 'tpl-bravo', name: 'Bravo', created: '2022-01-01T00:00:00.000Z' },
  { id: 'tpl-charlie', name: 'Charlie', created: '2024-01-01T00:00:00.000Z' },
];

async function setup(options: { defaultTemplateId?: string } = {}) {
  const pages = [
    pageIn(PROJECTS, 'note-1', 'Blank', ''),
    ...TEMPLATE_SPECS.map((spec) =>
      pageIn(TEMPLATES, spec.id, spec.name, `# ${spec.name} body`, {
        created: spec.created,
        cover: `https://example.com/${spec.id}.jpg`,
      })
    ),
  ];
  const vault = new Vault(
    ROOT,
    pages,
    [folder(PROJECTS), folder(TEMPLATES), folder(`${ROOT}/Inbox`), folder(`${ROOT}/Archive`)],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder(),
    new Map(),
    []
  );
  const fileSystem = new InMemoryVaultFileSystem();
  for (const page of pages) {
    fileSystem.seedFile(page.path, new FrontmatterSerializer().serializeDocument(page, page.source.markdown));
  }
  const store = TemplateUsageStore.empty(fileSystem, ROOT);
  const application = new Application(
    vault,
    fileSystem,
    new SelfWriteRegistry(),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    store
  );
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());

  if (options.defaultTemplateId) {
    await application.folderOperations.updateMetadata(PROJECTS, { defaultTemplateId: options.defaultTemplateId });
  }

  return { application, fileSystem, store };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** Shows the empty note, where the inline "Start with template" row is. */
async function showNote(application: Application): Promise<void> {
  cleanup();
  await application.pageOperations.open('note-1');
  render(<AppLayout application={application} />);
  await flush();
}

/** Shows the Projects folder, whose Add menu has From template and the default-template New button. */
async function showFolder(application: Application): Promise<void> {
  cleanup();
  await application.folderOperations.open(PROJECTS);
  render(<AppLayout application={application} />);
  await flush();
}

/** One template per line fits and the rest is "+N more": the row is 250px, every entry 100px. */
function narrowLayout(): () => void {
  const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const width = this.tagName === 'SPAN' ? 0 : 100;
    return { width, height: 20, top: 0, left: 0, right: width, bottom: 20, x: 0, y: 0, toJSON: () => ({}) };
  });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 250 });

  return () => {
    rect.mockRestore();
    // @ts-expect-error — remove the test's own override
    delete HTMLElement.prototype.clientWidth;
  };
}

const rowNames = () => [...document.querySelectorAll('.template-suggestions__item')].map((item) => item.textContent?.trim());
const pickerNames = () =>
  [...document.querySelectorAll('.picker-card [role="menuitem"]')]
    .map((row) => row.textContent?.trim() ?? '')
    .filter((name) => name !== 'New template');
const clickRow = (name: string) =>
  fireEvent.click(
    [...document.querySelectorAll<HTMLElement>('.template-suggestions__item')].find((item) => item.textContent?.trim() === name)!
  );
const clickPickerRow = (name: string) =>
  fireEvent.click(
    [...document.querySelectorAll<HTMLElement>('.picker-card [role="menuitem"]')].find((row) => row.textContent?.trim() === name)!
  );
const openFromTemplate = () => {
  fireEvent.click(document.querySelector<HTMLElement>('button[aria-label="Add options"]')!);
  fireEvent.click(
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) => item.textContent?.trim() === 'From template')!
  );
};
const openOverflowPicker = () => fireEvent.click(document.querySelector<HTMLElement>('[data-suggestion="overflow"]')!);

describe('recording a successful use', () => {
  it('applying from the inline row records the template once, and the time survives a restart', async () => {
    const { application, fileSystem, store } = await setup();
    const record = vi.spyOn(store, 'recordUse');
    await showNote(application);

    clickRow('Bravo');
    await flush();
    await flush();

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith('tpl-bravo');
    expect(application.pageOperations.getSession('note-1')!.currentRevision.markdown).toBe('# Bravo body');
    // An app restart: a fresh store reads it back from .clutter/workspace.json.
    const restarted = await TemplateUsageStore.load(fileSystem, ROOT);
    expect(restarted.lastUsedAt('tpl-bravo')).toBe(store.lastUsedAt('tpl-bravo'));
    expect(restarted.lastUsedAt('tpl-bravo')).toBeGreaterThan(0);
    expect(restarted.lastUsedAt('tpl-alpha')).toBeUndefined();
  });

  it('applying from the "+N more" picker records the template once', async () => {
    const restore = narrowLayout();
    try {
      const { application, store } = await setup();
      const record = vi.spyOn(store, 'recordUse');
      await showNote(application);

      openOverflowPicker();
      clickPickerRow('Alpha');
      await flush();
      await flush();

      expect(record).toHaveBeenCalledTimes(1);
      expect(record).toHaveBeenCalledWith('tpl-alpha');
      expect(application.pageOperations.getSession('note-1')!.currentRevision.markdown).toBe('# Alpha body');
    } finally {
      restore();
    }
  });

  it('creating a note through Add menu -> From template records the template once', async () => {
    const { application, store } = await setup();
    const record = vi.spyOn(store, 'recordUse');
    await showFolder(application);

    openFromTemplate();
    clickPickerRow('Charlie');
    await flush();
    await flush();

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith('tpl-charlie');
    expect(application.pageOperations.getSession(application.workspace.activePageId!)!.currentRevision.markdown).toBe(
      '# Charlie body'
    );
  });

  it("a folder's default-template New records that template once, and ranking never overrides the configured default", async () => {
    const { application, store } = await setup({ defaultTemplateId: 'tpl-alpha' });
    // Another template is the most recently used one, so it would rank first.
    store.recordUse('tpl-charlie', Date.now() + 10_000);
    const record = vi.spyOn(store, 'recordUse');
    await showFolder(application);

    fireEvent.click(document.querySelector<HTMLElement>('button[aria-label="New"]')!);
    await flush();
    await flush();

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith('tpl-alpha');
    expect(application.pageOperations.getSession(application.workspace.activePageId!)!.currentRevision.markdown).toBe(
      '# Alpha body'
    );
    // The default is still the configured one.
    expect(application.vault.getFolder(PROJECTS)!.metadata.defaultTemplateId).toBe('tpl-alpha');
  });

  it('creating a template is not a use', async () => {
    const { application, store } = await setup();
    const record = vi.spyOn(store, 'recordUse');
    await showFolder(application);

    openFromTemplate();
    clickPickerRow('New template');
    await flush();
    await flush();

    expect(record).not.toHaveBeenCalled();
  });
});

describe('a failed operation is not a use', () => {
  it('a template that cannot be applied to the note records nothing, and says so', async () => {
    const { application, store } = await setup();
    const record = vi.spyOn(store, 'recordUse');
    vi.spyOn(application.pageOperations, 'updateMetadata').mockRejectedValue(new Error('disk full'));
    await showNote(application);

    clickRow('Bravo');
    await flush();
    await flush();

    expect(record).not.toHaveBeenCalled();
    expect(store.lastUsedAt('tpl-bravo')).toBeUndefined();
    expect(document.body.textContent).toContain('Couldn’t apply the template');
  });

  it('a note that cannot be created from a template records nothing', async () => {
    const { application, store } = await setup();
    const record = vi.spyOn(store, 'recordUse');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(application.pageOperations, 'openDraft').mockRejectedValue(new Error('no draft'));
    await showFolder(application);

    openFromTemplate();
    clickPickerRow('Charlie');
    await flush();
    await flush();

    expect(record).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalled();
  });
});

describe('one order on every template selection surface', () => {
  /** The inline row, its "+N more" picker (all templates), and the From template list, in the order shown. */
  async function surfaces(application: Application) {
    await showNote(application);
    const row = rowNames();
    const restore = narrowLayout();
    let inlinePicker: string[];
    try {
      await showNote(application);
      openOverflowPicker();
      inlinePicker = pickerNames();
    } finally {
      restore();
    }
    await showFolder(application);
    openFromTemplate();

    return { row, inlinePicker, fromTemplate: pickerNames() };
  }

  it('with no usage: newest-created first, identically everywhere', async () => {
    const { application } = await setup();

    const { row, inlinePicker, fromTemplate } = await surfaces(application);

    expect(row).toEqual(['Charlie', 'Bravo', 'Alpha']);
    expect(inlinePicker).toEqual(['Charlie', 'Bravo', 'Alpha']);
    expect(fromTemplate).toEqual(['Charlie', 'Bravo', 'Alpha']);
  });

  it('after a use: that template first everywhere, the never-used ones still by creation date', async () => {
    const { application, store } = await setup();
    store.recordUse('tpl-alpha', Date.parse('2026-10-01T00:00:00.000Z'));

    const { row, inlinePicker, fromTemplate } = await surfaces(application);

    expect(row).toEqual(['Alpha', 'Charlie', 'Bravo']);
    expect(inlinePicker).toEqual(['Alpha', 'Charlie', 'Bravo']);
    expect(fromTemplate).toEqual(['Alpha', 'Charlie', 'Bravo']);
  });

  it('the most recent use wins, and a later use moves a template ahead', async () => {
    const { application, store } = await setup();
    store.recordUse('tpl-alpha', Date.parse('2026-10-01T00:00:00.000Z'));
    store.recordUse('tpl-bravo', Date.parse('2026-10-05T00:00:00.000Z'));

    const first = await surfaces(application);
    expect(first.row).toEqual(['Bravo', 'Alpha', 'Charlie']);
    expect(first.fromTemplate).toEqual(['Bravo', 'Alpha', 'Charlie']);

    store.recordUse('tpl-alpha', Date.parse('2026-10-09T00:00:00.000Z'));
    const second = await surfaces(application);
    expect(second.row).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(second.inlinePicker).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(second.fromTemplate).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('applying a template moves it to the front of the next empty note\'s row', async () => {
    const { application } = await setup();
    await showNote(application);
    clickRow('Alpha');
    await flush();
    await flush();

    // The note is no longer empty; clear it, and the row is back, ranked by use.
    act(() => application.pageOperations.commitEdit('note-1', ''));
    await flush();

    expect(rowNames()).toEqual(['Alpha', 'Charlie', 'Bravo']);
  });

  it('missing or malformed usage data falls back to the creation-date order', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fileSystem = new InMemoryVaultFileSystem({
      [`${ROOT}/.clutter/workspace.json`]: JSON.stringify({
        templateUsage: { 'tpl-alpha': { lastUsedAt: 'yesterday' }, 'tpl-bravo': null },
      }),
    });
    const { application } = await setup();
    // Swap in a store loaded from the malformed file.
    const loaded = await TemplateUsageStore.load(fileSystem, ROOT);
    Object.defineProperty(application, 'templateUsageStore', { value: loaded });

    await showNote(application);

    expect(rowNames()).toEqual(['Charlie', 'Bravo', 'Alpha']);
    expect(warn).toHaveBeenCalled();
  });
});
