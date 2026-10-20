// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, render } from '@testing-library/react';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { AppLayout } from '../app-layout/AppLayout';
import { Application } from '@core/application/Application';
import { Vault } from '@core/vault/models/Vault';
import type { Folder } from '@core/vault/models/Folder';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '@core/vault/providers/SelfWriteRegistry';
import { FrontmatterSerializer } from '@core/vault/ingest/FrontmatterSerializer';
import { PageCreator } from '@core/application/page/PageCreator';
import { PageFactory } from '@core/application/page/PageFactory';
import { PageBuilder } from '@core/vault/ingest/PageBuilder';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import { DailyNotePath } from '@core/vault/ingest/DailyNotePath';
import type { Page } from '@core/vault/models/Page';

vi.mock('@tauri-apps/api/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tauri-apps/api/core')>()),
  convertFileSrc: (path: string) => `asset://localhost${path}`,
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

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
});

const ROOT = '/vault';
const folderMetadata = {
  defaultTemplateId: null,
  icon: null,
  favorite: false,
  description: '',
  cover: null,
  coverHidden: false,
  coverLayout: 'side' as const,
  coverPositionAbove: 50,
  coverPositionSide: 50,
  status: 'active' as const,
  archivedAt: null,
  originalPath: null,
  originalParentId: null,
};
const folder = (id: string, name: string): Folder => ({
  id,
  name,
  path: `${ROOT}/${name}`,
  parentId: null,
  metadata: folderMetadata,
});

const emptyAnalysis = {
  headings: [],
  blockReferences: [],
  tasks: [],
  tags: [],
  links: [],
  embeds: [],
};

function page(
  id: string,
  name: string,
  parentId: string | null,
  directory: string,
  body = 'Body'
): Page {
  return new PageBuilder(ROOT).build({
    parentId,
    page: {
      path: `${directory}/${name}.md`,
      directoryPath: directory,
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content: body,
      analysis: emptyAnalysis,
    },
  });
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** A real app: four templates in Templates, an empty ordinary note, an Archive — and today's Daily Note open. */
async function setup(
  open: 'daily-note' | 'note' = 'daily-note',
  options: {
    /** The default Daily Note template, set before anything is opened. */
    defaultTemplate?: string;
    /** A Daily Note for today that already exists, with this body. */
    existingToday?: string;
    /** A template archived before anything is opened. */
    archiveTemplate?: string;
  } = {}
) {
  const templates = folder('folder-templates', 'Templates');
  const pages = [
    page('tpl-alpha', 'Alpha', templates.id, `${ROOT}/Templates`),
    page('tpl-beta', 'Beta', templates.id, `${ROOT}/Templates`),
    page('tpl-gamma', 'Gamma', templates.id, `${ROOT}/Templates`),
    page('tpl-delta', 'Delta', templates.id, `${ROOT}/Templates`),
    page('note-1', 'Note', null, ROOT, ''),
    ...(options.existingToday !== undefined
      ? [
          page(
            'today-existing',
            DailyNotePath.absoluteFrom(ROOT, new Date()).split('/').pop()!.replace(/\.md$/, ''),
            null,
            DailyNotePath.absoluteFrom(ROOT, new Date()).split('/').slice(0, -1).join('/'),
            options.existingToday
          ),
        ]
      : []),
  ];
  const fileSystem = new InMemoryVaultFileSystem();
  const serializer = new FrontmatterSerializer();
  for (const seeded of pages) {
    fileSystem.seedFile(
      seeded.path,
      serializer.serializeDocument(seeded, seeded.source.markdown)
    );
  }
  await fileSystem.createDirectory(`${ROOT}/Templates`);
  await fileSystem.createDirectory(`${ROOT}/Archive`);

  const vault = new Vault(
    ROOT,
    pages,
    [templates, folder('folder-archive', 'Archive')],
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
    fileSystem,
    new SelfWriteRegistry()
  );
  application.attachVault(
    vault,
    new PageCreator(new UuidGenerator(), new PageFactory()),
    new DailyNoteService()
  );

  if (options.defaultTemplate !== undefined) {
    application.preferredTemplatesStore.setDefaultDailyNoteTemplate(options.defaultTemplate);
  }

  if (options.archiveTemplate !== undefined) {
    await application.pageOperations.archive(options.archiveTemplate);
  }

  if (open === 'daily-note') {
    await application.pageOperations.openAtPath(
      DailyNotePath.absoluteFrom(ROOT, new Date()),
      { type: 'daily-note' }
    );
  } else {
    await application.pageOperations.open('note-1');
  }

  render(<AppLayout application={application} />);
  await flush();

  return { application, vault };
}

const suggested = () =>
  Array.from(document.querySelectorAll('.template-suggestions__item')).map(
    (el) => el.textContent
  );

// The existing ranking with no preference and no usage or creation dates: the templates in their listed (by-name) order.
const BASELINE = ['Alpha', 'Beta', 'Delta', 'Gamma'];

describe('Daily Note "Start with template" suggestions and Preferred templates', () => {
  it('without a preference, keep the existing ranking', async () => {
    await setup();
    expect(suggested()).toEqual(BASELINE);
  });

  it('list the preferred templates first, in their configured order, then the rest in the existing ranking', async () => {
    const { application } = await setup();
    act(() => {
      application.preferredTemplatesStore.add('tpl-delta');
      application.preferredTemplatesStore.add('tpl-beta');
    });
    await flush();
    expect(suggested()).toEqual(['Delta', 'Beta', 'Alpha', 'Gamma']);
  });

  it('never show a template twice', async () => {
    const { application } = await setup();
    act(() => {
      ['tpl-gamma', 'tpl-alpha', 'tpl-gamma'].forEach((id) =>
        application.preferredTemplatesStore.add(id)
      );
    });
    await flush();
    expect(suggested()).toEqual(['Gamma', 'Alpha', 'Beta', 'Delta']);
    expect(new Set(suggested()).size).toBe(4);
  });

  it('reorder an already-open suggestion row as the list changes in Settings', async () => {
    const { application } = await setup();
    act(() => application.preferredTemplatesStore.add('tpl-gamma'));
    await flush();
    expect(suggested()[0]).toBe('Gamma');
    act(() => application.preferredTemplatesStore.remove('tpl-gamma'));
    await flush();
    expect(suggested()).toEqual(BASELINE);
  });

  it('hide a preferred template that is not available, without losing its saved preference', async () => {
    const { application } = await setup();
    act(() => {
      application.preferredTemplatesStore.add('ghost-template');
      application.preferredTemplatesStore.add('tpl-beta');
    });
    await flush();
    expect(suggested()).toEqual(['Beta', 'Alpha', 'Delta', 'Gamma']);
    expect(application.preferredTemplatesStore.getIds()).toEqual([
      'ghost-template',
      'tpl-beta',
    ]);
  });

  it('hide an archived preferred template, and give it back its original place when restored', async () => {
    const { application } = await setup();
    act(() => {
      ['tpl-gamma', 'tpl-alpha', 'tpl-beta'].forEach((id) =>
        application.preferredTemplatesStore.add(id)
      );
    });
    await flush();
    expect(suggested()).toEqual(['Gamma', 'Alpha', 'Beta', 'Delta']);

    await act(async () => {
      await application.pageOperations.archive('tpl-alpha');
    });
    await flush();
    expect(suggested()).toEqual(['Gamma', 'Beta', 'Delta']);
    expect(application.preferredTemplatesStore.getIds()).toEqual([
      'tpl-gamma',
      'tpl-alpha',
      'tpl-beta',
    ]);

    await act(async () => {
      await application.pageOperations.restore('tpl-alpha');
    });
    await flush();
    expect(suggested()).toEqual(['Gamma', 'Alpha', 'Beta', 'Delta']);
  });

  it("leave an ordinary note's suggestions on the existing ranking when only Daily notes has preferences", async () => {
    const { application } = await setup('note');
    act(() => application.preferredTemplatesStore.add('tpl-delta', 'dailyNotes'));
    await flush();
    expect(suggested()).toEqual(BASELINE);
  });

  it("ignore the Notes preferences on a Daily Note", async () => {
    const { application } = await setup('daily-note');
    act(() => application.preferredTemplatesStore.add('tpl-delta', 'notes'));
    await flush();
    expect(suggested()).toEqual(BASELINE);
  });
});

describe('Regular note "Start with template" suggestions and Preferred templates', () => {
  it('list the Notes preferences first, in their configured order, then the rest in the existing ranking', async () => {
    const { application } = await setup('note');
    act(() => {
      application.preferredTemplatesStore.add('tpl-delta', 'notes');
      application.preferredTemplatesStore.add('tpl-beta', 'notes');
    });
    await flush();
    expect(suggested()).toEqual(['Delta', 'Beta', 'Alpha', 'Gamma']);
  });

  it('never show a template twice', async () => {
    const { application } = await setup('note');
    act(() => {
      ['tpl-gamma', 'tpl-alpha', 'tpl-gamma'].forEach((id) =>
        application.preferredTemplatesStore.add(id, 'notes')
      );
    });
    await flush();
    expect(suggested()).toEqual(['Gamma', 'Alpha', 'Beta', 'Delta']);
  });

  it('keep Notes and Daily notes preferences independent for the same templates', async () => {
    const { application } = await setup('note');
    act(() => {
      application.preferredTemplatesStore.add('tpl-delta', 'dailyNotes');
      application.preferredTemplatesStore.add('tpl-gamma', 'notes');
    });
    await flush();
    expect(suggested()).toEqual(['Gamma', 'Alpha', 'Beta', 'Delta']);
  });

  it('go back to the existing ranking when the preference is removed, and the template stays', async () => {
    const { application } = await setup('note');
    act(() => application.preferredTemplatesStore.add('tpl-delta', 'notes'));
    await flush();
    expect(suggested()[0]).toBe('Delta');

    act(() => application.preferredTemplatesStore.remove('tpl-delta', 'notes'));
    await flush();
    expect(suggested()).toEqual(BASELINE);
  });

  it('reorder an already-open suggestion row as the Notes list changes in Settings', async () => {
    const { application } = await setup('note');
    expect(suggested()).toEqual(BASELINE);
    act(() => application.preferredTemplatesStore.add('tpl-gamma', 'notes'));
    await flush();
    expect(suggested()[0]).toBe('Gamma');
  });
});

describe('The default daily note template', () => {
  const todayPath = () => DailyNotePath.absoluteFrom(ROOT, new Date());
  const todayBody = (application: Application) => application.vault.getPageByPath(todayPath())?.source.markdown;
  const activeBody = (application: Application) =>
    application.effectivePageState.getPage(application.workspace.activePageId!)?.markdown;

  it('is applied to a new Daily Note when it is created, and the note keeps its date and type', async () => {
    const { application } = await setup('daily-note', { defaultTemplate: 'tpl-beta' });
    await flush();

    expect(activeBody(application)).toBe('Body');

    // Autosave would persist it; settle that now, then check what was written.
    const id = application.workspace.activePageId!;
    await act(async () => {
      await application.pageOperations.requestSave(id);
    });
    const created = application.vault.getPageByPath(todayPath());
    expect(created?.id).toBe(id);
    expect(created?.type).toBe('daily-note');
    expect(created?.path).toBe(todayPath());
    expect(created?.source.markdown.trim()).toBe('Body');
  });

  it('does nothing when the default is None: the new Daily Note stays empty and keeps its suggestions', async () => {
    const { application } = await setup('daily-note');
    await flush();

    expect(activeBody(application)).toBe('');
    expect(application.vault.getPageByPath(todayPath())).toBeUndefined();
    expect(suggested()).toEqual(BASELINE);
  });

  it('applies exactly the chosen template, whatever the preferred templates are', async () => {
    const { application } = await setup('daily-note', { defaultTemplate: 'tpl-beta' });
    act(() => application.preferredTemplatesStore.add('tpl-delta', 'dailyNotes'));
    await flush();

    expect(application.preferredTemplatesStore.getIds('dailyNotes')).toEqual(['tpl-delta']);
    expect(application.preferredTemplatesStore.getDefaultDailyNoteTemplateId()).toBe('tpl-beta');
    expect(activeBody(application)).toBe('Body');
  });

  it('preferred templates alone apply nothing', async () => {
    const { application } = await setup('daily-note');
    act(() => application.preferredTemplatesStore.add('tpl-alpha', 'dailyNotes'));
    await flush();

    expect(activeBody(application)).toBe('');
  });

  it('is not applied when an existing Daily Note is opened, and its content is never overwritten', async () => {
    const { application } = await setup('daily-note', { defaultTemplate: 'tpl-beta', existingToday: 'My own day' });
    await flush();

    expect(activeBody(application)).toBe('My own day');
    expect(todayBody(application)?.trim()).toBe('My own day');
  });

  it('is not applied again when the note is reopened or the user navigates away and back', async () => {
    const { application } = await setup('daily-note', { defaultTemplate: 'tpl-beta' });
    await flush();
    const id = application.workspace.activePageId!;
    expect(activeBody(application)).toBe('Body');

    await act(async () => {
      await application.pageOperations.open('note-1');
    });
    await flush();
    await act(async () => {
      await application.pageOperations.open(id);
    });
    await flush();

    expect(activeBody(application)).toBe('Body');
    await act(async () => {
      await application.pageOperations.requestSave(id);
    });
    expect(application.vault.getPage(id)?.source.markdown.trim()).toBe('Body');
  });

  it('is not applied to a regular note, even an empty one', async () => {
    const { application } = await setup('note', { defaultTemplate: 'tpl-beta' });
    await flush();

    expect(activeBody(application)).toBe('');
  });

  it('applies nothing when the chosen template is gone, and no other template in its place', async () => {
    const { application } = await setup('daily-note', { defaultTemplate: 'tpl-missing' });
    await flush();

    expect(activeBody(application)).toBe('');
    expect(application.preferredTemplatesStore.getDefaultDailyNoteTemplateId()).toBe('tpl-missing');
    expect(suggested()).toEqual(BASELINE);
  });

  it('applies nothing when the chosen template is archived, and no other template in its place', async () => {
    const { application } = await setup('daily-note', { defaultTemplate: 'tpl-beta', archiveTemplate: 'tpl-beta' });
    await flush();

    expect(activeBody(application)).toBe('');
    expect(suggested()).toEqual(['Alpha', 'Delta', 'Gamma']);
  });
});
