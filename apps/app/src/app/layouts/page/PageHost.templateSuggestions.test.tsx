// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

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
import { createTemplate } from '@features/notes/helpers/createTemplate';
import type { Page } from '@core/vault/models/Page';

// A vault path becomes a loadable URL through Tauri's convertFileSrc, which jsdom has no runtime for.
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

function buildNote(frontmatter: Record<string, unknown>): Page {
  return new PageBuilder(ROOT).build({
    parentId: null,
    page: {
      path: `${ROOT}/Note.md`,
      directoryPath: ROOT,
      frontmatter: { id: 'page-1', ...frontmatter },
      frontmatterAnalysis: { aliases: [] },
      content: '',
      analysis: {
        headings: [],
        blockReferences: [],
        tasks: [],
        tags: [],
        links: [],
        embeds: [],
      },
    },
  });
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/**
 * A real Application with one template and a note open: a new, unpersisted draft by default, or — when
 * `frontmatter` is given — an empty persisted note carrying it.
 */
async function setup(
  frontmatter?: Record<string, unknown>,
  templateCount = 1,
  templateCover?: string
) {
  const note = frontmatter ? buildNote(frontmatter) : undefined;
  const vault = new Vault(
    ROOT,
    note ? [note] : [],
    [],
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
    new SelfWriteRegistry()
  );
  application.attachVault(
    vault,
    new PageCreator(new UuidGenerator(), new PageFactory()),
    new DailyNoteService()
  );

  for (let index = 0; index < templateCount; index += 1) {
    await createTemplate(
      application.folderOperations,
      application.pageOperations
    );
    const templateDraft = application.workspace.activePageId!;
    await application.pageOperations.mutateBody(
      templateDraft,
      () => '# Agenda'
    );
    if (templateCover) {
      await application.pageOperations.updateMetadata(templateDraft, {
        cover: templateCover,
      });
    }
    await application.pageOperations.requestSave(templateDraft);
  }
  const noteId = note
    ? note.id
    : await application.pageOperations.openDraft({ folderId: null });

  if (note) {
    await application.pageOperations.open(noteId);
  }

  render(<AppLayout application={application} />);
  await flush();

  return { application, noteId };
}

const suggestionsShown = () =>
  screen.queryByText('Start with template') !== null;

describe('TemplateSuggestions are offered to a new draft with an empty body', () => {
  it('a new note draft shows the suggestions', async () => {
    await setup();

    expect(suggestionsShown()).toBe(true);
  });

  it.each([
    ['no metadata', {}],
    ['a cover image', { cover: 'https://example.com/c.jpg' }],
    [
      'an emoji, description and tags',
      { icon: '📌', description: 'Mine', tags: ['x'] },
    ],
  ])(
    'an empty note that is already saved, with %s, does not',
    async (_label, frontmatter) => {
      await setup(frontmatter);

      expect(suggestionsShown()).toBe(false);
    }
  );

  it('a new daily-note draft shows them', async () => {
    const draft = await setup();
    cleanup();
    await act(async () => {
      await draft.application.pageOperations.openAtPath(
        `${ROOT}/Daily/2026-10-13.md`,
        { type: 'daily-note' }
      );
    });
    render(<AppLayout application={draft.application} />);
    await flush();
    expect(suggestionsShown()).toBe(true);
  });

  it('a template being authored (a draft inside Templates) does not', async () => {
    const { application } = await setup();
    cleanup();
    await createTemplate(
      application.folderOperations,
      application.pageOperations
    );
    render(<AppLayout application={application} />);
    await flush();

    expect(suggestionsShown()).toBe(false);
  });

  it('a change that saves the draft (a property, icon or cover) removes them for good', async () => {
    const { application, noteId } = await setup();

    await act(async () => {
      await application.pageOperations.updateMetadata(noteId, { icon: '📌' });
    });
    await flush();
    expect(application.vault.getPage(noteId)).toBeDefined();
    expect(suggestionsShown()).toBe(false);

    act(() => application.pageOperations.commitEdit(noteId, ''));
    await flush();
    expect(suggestionsShown()).toBe(false);
  });

  it('applying a template that carries a cover saves the note, so clearing the body does not bring them back', async () => {
    const { application, noteId } = await setup(
      undefined,
      1,
      'https://example.com/tpl.jpg'
    );

    fireEvent.click(document.querySelector('.template-suggestions__item')!);
    await flush();
    expect(suggestionsShown()).toBe(false);

    act(() => application.pageOperations.commitEdit(noteId, ''));
    await flush();

    expect(suggestionsShown()).toBe(false);
  });

  it('applying a body-only template hides them, and clearing the body (still a draft) shows them again', async () => {
    const { application, noteId } = await setup();

    fireEvent.click(document.querySelector('.template-suggestions__item')!);
    await flush();
    expect(
      application.pageOperations.getSession(noteId)!.currentRevision.markdown
    ).toBe('# Agenda');
    expect(suggestionsShown()).toBe(false);

    act(() => application.pageOperations.commitEdit(noteId, ''));
    await flush();

    expect(suggestionsShown()).toBe(true);
  });

  it('whitespace-only text still counts as empty; real content hides them', async () => {
    const { application, noteId } = await setup();

    act(() => application.pageOperations.commitEdit(noteId, '  \n'));
    await flush();
    expect(suggestionsShown()).toBe(true);

    act(() => application.pageOperations.commitEdit(noteId, 'hello'));
    await flush();
    expect(suggestionsShown()).toBe(false);

    act(() => application.pageOperations.commitEdit(noteId, ''));
    await flush();
    expect(suggestionsShown()).toBe(true);
  });
});

describe('applying a template through the picker (+N more)', () => {
  beforeEach(() => {
    // No layout in jsdom: every measured element is 100px wide and the row 150px, so one template and "+N more" show.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        const width = this.tagName === 'SPAN' ? 0 : 100;
        return {
          width,
          height: 20,
          top: 0,
          left: 0,
          right: width,
          bottom: 20,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        };
      }
    );
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 250,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error — remove the test's own override
    delete HTMLElement.prototype.clientWidth;
  });

  it.each([
    ['no cover', undefined, true],
    // A template cover is metadata: applying it saves the note, which then never asks again.
    ['a cover on the template', 'https://example.com/tpl.jpg', false],
  ])(
    'with %s: suggestions go while the body has content; clearing it brings them back only if the note is still a draft',
    async (_label, templateCover, backWhenCleared) => {
      const { application, noteId } = await setup(undefined, 4, templateCover);

      fireEvent.click(screen.getByText(/more$/));
      await flush();
      // The picker's rows: the leading New template row, then every template — pick the last template.
      const rows = [...document.querySelectorAll('.picker-list__item')];
      expect(rows.length).toBeGreaterThan(1);
      fireEvent.click(rows[rows.length - 1]!);
      await flush();

      expect(
        application.pageOperations.getSession(noteId)!.currentRevision.markdown
      ).toBe('# Agenda');
      expect(suggestionsShown()).toBe(false);

      act(() => application.pageOperations.commitEdit(noteId, ''));
      await flush();

      expect(suggestionsShown()).toBe(backWhenCleared);
    }
  );

  const editorText = () => document.querySelector('.cm-content')!.textContent;
  const pickLastTemplateInPicker = async () => {
    fireEvent.click(screen.getByText(/more$/));
    await flush();
    const rows = [...document.querySelectorAll('.picker-list__item')];
    fireEvent.click(rows[rows.length - 1]!);
    await flush();
  };

  it('a template chosen in the picker puts its Markdown into the draft (same id; the draft becomes the only new page) and shows it in the editor', async () => {
    const { application, noteId } = await setup(
      undefined,
      4,
      'https://example.com/tpl.jpg'
    );
    const pagesBefore = [...application.vault.pages()]
      .map((page) => page.id)
      .sort();

    await pickLastTemplateInPicker();

    expect(
      application.pageOperations.getSession(noteId)!.currentRevision.markdown
    ).toBe('# Agenda');
    expect(editorText()).toBe('# Agenda');
    // The template's cover saved the draft under its own id; no other page was created.
    expect(
      [...application.vault.pages()].map((page) => page.id).sort()
    ).toEqual([...pagesBefore, noteId].sort());
    expect(application.vault.getPage(noteId)!.metadata.cover).toBe(
      'https://example.com/tpl.jpg'
    );
    expect(suggestionsShown()).toBe(false);
  });

  it('the editor shows an applied template even when it had focus while it was applied', async () => {
    const { application, noteId } = await setup();
    const content = document.querySelector<HTMLElement>('.cm-content')!;
    content.focus();
    expect(content.contains(document.activeElement)).toBe(true);

    // A visible suggestion: clicking it (as a test) does not move focus off the editor.
    fireEvent.click(document.querySelector('.template-suggestions__item')!);
    await flush();

    expect(
      application.pageOperations.getSession(noteId)!.currentRevision.markdown
    ).toBe('# Agenda');
    // The session and the editor agree — before, the editor kept showing nothing while the session held the body.
    expect(editorText()).toBe('# Agenda');
    expect(suggestionsShown()).toBe(false);
    // Focus is not touched: the editor had it, and still has it.
    expect(content.contains(document.activeElement)).toBe(true);
  });

  it('a pointer click: the browser moves focus onto the suggestion on mousedown, and applying does not hand it back to the editor', async () => {
    const { application, noteId } = await setup();
    const content = document.querySelector<HTMLElement>('.cm-content')!;
    content.focus();
    expect(content.contains(document.activeElement)).toBe(true);
    const item = document.querySelector<HTMLElement>('.template-suggestions__item')!;

    // What a real click does before `click` fires (jsdom does not do it): mousedown focuses the control.
    item.setAttribute('tabindex', '0');
    fireEvent.mouseDown(item);
    item.focus();
    expect(content.contains(document.activeElement)).toBe(false);
    fireEvent.mouseUp(item);
    fireEvent.click(item);
    await flush();

    expect(editorText()).toBe('# Agenda');
    expect(
      application.pageOperations.getSession(noteId)!.currentRevision.markdown
    ).toBe('# Agenda');
    // Neither during nor after the apply is focus returned to the editor.
    expect(content.contains(document.activeElement)).toBe(false);
  });

  it('applying a template does not force focus into the editor', async () => {
    const { application, noteId } = await setup();
    const content = document.querySelector<HTMLElement>('.cm-content')!;
    // Focus is somewhere else (here: nowhere), exactly as before the user chooses where to type.
    (document.activeElement as HTMLElement | null)?.blur();
    expect(content.contains(document.activeElement)).toBe(false);

    fireEvent.click(document.querySelector('.template-suggestions__item')!);
    await flush();

    // The template is in the session and in the editor, immediately...
    expect(
      application.pageOperations.getSession(noteId)!.currentRevision.markdown
    ).toBe('# Agenda');
    expect(editorText()).toBe('# Agenda');
    // ...and the editor was not given focus by it.
    expect(content.contains(document.activeElement)).toBe(false);
  });
});
