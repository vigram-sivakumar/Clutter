// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
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
import {
  isolateHistory,
  redo,
  redoDepth,
  undo,
  undoDepth,
} from '@codemirror/commands';
import { EditorView } from '@codemirror/view';

import { AppLayout } from '../app-layout/AppLayout';
import { Application } from '@core/application/Application';
import type { EditablePageMetadata } from '@core/application/page/PageOperations';
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
import { createTemplate } from '@features/notes/helpers/createTemplate';
import { __clearAllCachedEditorHistoryForTests } from '@features/markdown/editor/codemirror/editorHistoryCache';

/**
 * Applying a template is one undoable step: Cmd+Z reverses the body and every metadata change it introduced,
 * Cmd+Shift+Z reapplies them, through the real AppLayout -> PageHost -> MarkdownEditor composition.
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

beforeEach(() => {
  __clearAllCachedEditorHistoryForTests();
});

afterEach(() => {
  cleanup();
});

const ROOT = '/vault';
const TEMPLATE_BODY = '# Agenda';

function buildNote(frontmatter: Record<string, unknown>): Page {
  return new PageBuilder(ROOT).build({
    parentId: null,
    page: {
      path: `${ROOT}/Note.md`,
      directoryPath: ROOT,
      frontmatter: { id: 'note', ...frontmatter },
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
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function setup(
  noteFrontmatter: Record<string, unknown>,
  template: { body?: string; metadata?: Partial<EditablePageMetadata> },
  options: { draft?: boolean; extraTemplates?: number } = {}
) {
  const note = buildNote(noteFrontmatter);
  const vault = new Vault(
    ROOT,
    [note],
    [],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder(),
    new Map(),
    []
  );
  const fileSystem = new InMemoryVaultFileSystem();
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
  const operations = application.pageOperations;

  // Extra (blank-ish) templates, so the one under test is not the only suggestion and the row overflows.
  for (let index = 0; index < (options.extraTemplates ?? 0); index += 1) {
    await createTemplate(application.folderOperations, operations);
    const extraDraft = application.workspace.activePageId!;
    await operations.mutateBody(extraDraft, () => `extra ${index}`);
    await operations.updateDraftTitle(extraDraft, `Extra ${index}`);
    await operations.requestSave(extraDraft);
  }
  await createTemplate(application.folderOperations, operations);
  const templateDraft = application.workspace.activePageId!;
  await operations.mutateBody(
    templateDraft,
    () => template.body ?? TEMPLATE_BODY
  );
  await operations.updateDraftTitle(templateDraft, 'Meeting Notes');
  if (template.metadata) {
    await operations.updateMetadata(templateDraft, template.metadata);
  }
  await operations.requestSave(templateDraft);
  // The note under test: a persisted note, or — what "New note" gives — an unpersisted draft.
  const noteId = options.draft
    ? await operations.openDraft({ folderId: null })
    : note.id;
  if (!options.draft) {
    await operations.open(noteId);
  }

  render(<AppLayout application={application} />);
  await flush();

  const view = () =>
    EditorView.findFromDOM(
      document.querySelector<HTMLElement>('.cm-content')!
    )!;
  const doc = () => view().state.doc.toString();
  const page = () => application.vault.getPage(noteId)!;
  const metadata = () => page().metadata;
  const session = () => operations.getSession(noteId)!;
  const apply = async () => {
    fireEvent.click(document.querySelector('.template-suggestions__item')!);
    await flush();
  };
  /** Through the picker the "+N more" entry opens: choose a template there by its title. */
  const pickInPicker = async (title: string) => {
    fireEvent.click(document.querySelector('[data-suggestion="overflow"]')!);
    await flush();
    const row = [...document.querySelectorAll('.picker-list__item')].find(
      (item) => item.textContent?.includes(title)
    )!;
    fireEvent.click(row);
    await flush();
  };
  const pressUndo = async () => {
    await act(async () => {
      undo(view());
    });
    await flush();
  };
  const pressRedo = async () => {
    await act(async () => {
      redo(view());
    });
    await flush();
  };
  /** The real shortcuts as the keymap sees them: keydown on the editor's content (Mod is Ctrl under jsdom). */
  const shortcut = async (init: KeyboardEventInit) => {
    await act(async () => {
      view().contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          ...init,
        })
      );
    });
    await flush();
  };
  const pressUndoShortcut = () =>
    shortcut({ key: 'z', code: 'KeyZ', ctrlKey: true });
  // CodeMirror binds redo to Mod-Shift-z on macOS but to Ctrl-y on a platform it cannot identify, which is
  // what jsdom reports — so the same command is reached through the binding this environment has.
  const pressRedoShortcut = () =>
    shortcut({ key: 'y', code: 'KeyY', ctrlKey: true });
  const type = async (text: string) => {
    const current = view();
    current.focus();
    await act(async () => {
      current.dispatch({
        changes: { from: current.state.doc.length, insert: text },
        selection: { anchor: current.state.doc.length + text.length },
        userEvent: 'input.type',
      });
    });
  };

  return {
    application,
    fileSystem,
    noteId,
    page,
    view,
    doc,
    metadata,
    session,
    apply,
    pickInPicker,
    pressUndo,
    pressRedo,
    pressUndoShortcut,
    pressRedoShortcut,
    type,
  };
}

const FULL_TEMPLATE: Partial<EditablePageMetadata> = {
  icon: '🧾',
  cover: 'https://example.com/tpl.jpg',
  coverLayout: 'above',
  coverPositionAbove: 30,
  description: 'From the template',
  tags: ['tpl', 'meeting'],
  unownedFrontmatter: ['Priority: High', 'reviewed: true'],
};

describe('applying a template is one undoable step', () => {
  it('undo restores the previous body and every metadata change; redo reapplies them; the note keeps its identity', async () => {
    const env = await setup({ tags: ['mine'] }, { metadata: FULL_TEMPLATE });
    const pagesBefore = [...env.application.vault.pages()]
      .map((page) => page.id)
      .sort();

    await env.apply();
    expect(env.doc()).toBe(TEMPLATE_BODY);
    expect(env.metadata().icon).toBe('🧾');
    expect(env.metadata().cover).toBe('https://example.com/tpl.jpg');
    expect(env.metadata().description).toBe('From the template');
    expect(env.metadata().tags).toEqual(['mine', 'tpl', 'meeting']);
    expect(env.metadata().unownedFrontmatter).toEqual([
      'Priority: High',
      'reviewed: true',
    ]);

    await env.pressUndo();
    expect(env.doc()).toBe('');
    expect(env.session().currentRevision.markdown).toBe('');
    expect(env.metadata().icon).toBeNull();
    expect(env.metadata().cover).toBeNull();
    expect(env.metadata().description).toBeNull();
    expect(env.metadata().tags).toEqual(['mine']);
    expect(env.metadata().unownedFrontmatter ?? []).toEqual([]);

    await env.pressRedo();
    expect(env.doc()).toBe(TEMPLATE_BODY);
    expect(env.session().currentRevision.markdown).toBe(TEMPLATE_BODY);
    expect(env.metadata().icon).toBe('🧾');
    expect(env.metadata().cover).toBe('https://example.com/tpl.jpg');
    expect(env.metadata().coverLayout).toBe('above');
    expect(env.metadata().coverPositionAbove).toBe(30);
    expect(env.metadata().description).toBe('From the template');
    expect(env.metadata().tags).toEqual(['mine', 'tpl', 'meeting']);
    expect(env.metadata().unownedFrontmatter).toEqual([
      'Priority: High',
      'reviewed: true',
    ]);

    // Same note throughout: no page was created or replaced.
    expect(env.metadata()).toBeDefined();
    expect(
      [...env.application.vault.pages()].map((page) => page.id).sort()
    ).toEqual(pagesBefore);
  });

  it("undo gives back the note's own icon, cover and cover settings that the template replaced", async () => {
    const env = await setup(
      {
        icon: '📌',
        cover: 'https://example.com/mine.jpg',
        coverLayout: 'side',
        coverPositionAbove: 70,
      },
      { metadata: FULL_TEMPLATE }
    );

    await env.apply();
    expect(env.metadata().cover).toBe('https://example.com/tpl.jpg');
    expect(env.metadata().icon).toBe('🧾');

    await env.pressUndo();

    expect(env.metadata().icon).toBe('📌');
    expect(env.metadata().cover).toBe('https://example.com/mine.jpg');
    expect(env.metadata().coverLayout).toBe('side');
    expect(env.metadata().coverPositionAbove).toBe(70);
  });

  it('keeps the earlier typing history: undoing the template steps back to what was typed before it', async () => {
    const env = await setup({}, { metadata: FULL_TEMPLATE });
    await env.type('a');
    // Clear it again, so the note is blank (a template is only offered for an empty body).
    await act(async () => {
      env.view().dispatch({
        changes: { from: 0, to: 1 },
        userEvent: 'delete.backward',
        // A separate undo step from the typing: CodeMirror merges edits made within 500ms into one.
        annotations: isolateHistory.of('full'),
      });
    });
    expect(env.doc()).toBe('');

    await env.apply();
    expect(env.doc()).toBe(TEMPLATE_BODY);

    await env.pressUndo(); // the template
    expect(env.doc()).toBe('');
    expect(env.metadata().cover).toBeNull();

    await env.pressUndo(); // the deletion
    expect(env.doc()).toBe('a');
    // Metadata is untouched by the typing steps.
    expect(env.metadata().cover).toBeNull();

    await env.pressRedo();
    expect(env.doc()).toBe('');
    await env.pressRedo();
    expect(env.doc()).toBe(TEMPLATE_BODY);
    expect(env.metadata().cover).toBe('https://example.com/tpl.jpg');
  });

  it('is exactly one history step, and neither the sync nor the metadata save adds another', async () => {
    const env = await setup({}, { metadata: FULL_TEMPLATE });
    const depthBefore = undoDepth(env.view().state);
    const revisionBefore = env.session().currentRevision.number;

    await env.apply();

    expect(undoDepth(env.view().state)).toBe(depthBefore + 1);
    expect(env.session().currentRevision.number - revisionBefore).toBe(1);

    await env.pressUndo();
    expect(undoDepth(env.view().state)).toBe(depthBefore);
    expect(redoDepth(env.view().state)).toBe(1);
    expect(env.session().currentRevision.number - revisionBefore).toBe(2);

    await env.pressRedo();
    expect(undoDepth(env.view().state)).toBe(depthBefore + 1);
    expect(redoDepth(env.view().state)).toBe(0);
    expect(env.session().currentRevision.number - revisionBefore).toBe(3);
  });

  it('a template with no body still undoes and redoes its metadata', async () => {
    const env = await setup(
      {},
      { body: '', metadata: { tags: ['only-meta'], icon: '🧾' } }
    );

    await env.apply();
    expect(env.doc()).toBe('');
    expect(env.metadata().tags).toEqual(['only-meta']);

    await env.pressUndo();
    expect(env.metadata().tags).toEqual([]);
    expect(env.metadata().icon).toBeNull();

    await env.pressRedo();
    expect(env.metadata().tags).toEqual(['only-meta']);
    expect(env.metadata().icon).toBe('🧾');
  });

  it('a template with no metadata undoes just the body', async () => {
    const env = await setup({ tags: ['mine'] }, {});

    await env.apply();
    expect(env.doc()).toBe(TEMPLATE_BODY);

    await env.pressUndo();
    expect(env.doc()).toBe('');
    expect(env.metadata().tags).toEqual(['mine']);

    await env.pressRedo();
    expect(env.doc()).toBe(TEMPLATE_BODY);
  });

  it('the example: 📝 + existing cover + #work, then "Meeting Notes" — undo restores exactly that, redo restores the application', async () => {
    const MEETING_BODY = '# Meeting Notes\n\n## Agenda\n\n## Action Items';
    const env = await setup(
      {
        icon: '📝',
        cover: 'https://example.com/existing-cover.jpg',
        tags: ['work'],
      },
      {
        body: MEETING_BODY,
        metadata: {
          icon: '📅',
          cover: 'https://example.com/meeting-cover.jpg',
          tags: ['meetings', 'work'],
        },
      }
    );
    const id = env.noteId;
    expect(env.doc()).toBe('');

    await env.apply();
    expect(env.doc()).toBe(MEETING_BODY);
    expect(env.metadata().icon).toBe('📅');
    expect(env.metadata().cover).toBe('https://example.com/meeting-cover.jpg');
    // Merged without duplicates: the note's #work first, then the template's new one.
    expect(env.metadata().tags).toEqual(['work', 'meetings']);
    expect(env.page().id).toBe(id);

    await env.pressUndo();
    expect(env.doc()).toBe('');
    expect(env.session().currentRevision.markdown).toBe('');
    expect(env.metadata().icon).toBe('📝');
    expect(env.metadata().cover).toBe('https://example.com/existing-cover.jpg');
    expect(env.metadata().tags).toEqual(['work']);
    expect(env.page().id).toBe(id);

    await env.pressRedo();
    expect(env.doc()).toBe(MEETING_BODY);
    expect(env.session().currentRevision.markdown).toBe(MEETING_BODY);
    expect(env.metadata().icon).toBe('📅');
    expect(env.metadata().cover).toBe('https://example.com/meeting-cover.jpg');
    expect(env.metadata().tags).toEqual(['work', 'meetings']);
    expect(env.page().id).toBe(id);
  });

  it('typing after the template is undone first, then the template, and redone in that order', async () => {
    const env = await setup(
      { icon: '📝', tags: ['work'] },
      { metadata: FULL_TEMPLATE }
    );

    await env.apply();
    await env.type('\n\nnotes I added');
    const typedBody = `${TEMPLATE_BODY}\n\nnotes I added`;
    expect(env.doc()).toBe(typedBody);

    await env.pressUndo(); // the typing only
    expect(env.doc()).toBe(TEMPLATE_BODY);
    expect(env.metadata().icon).toBe('🧾');
    expect(env.metadata().tags).toEqual(['work', 'tpl', 'meeting']);

    await env.pressUndo(); // the template application
    expect(env.doc()).toBe('');
    expect(env.metadata().icon).toBe('📝');
    expect(env.metadata().tags).toEqual(['work']);

    await env.pressRedo(); // the template application
    expect(env.doc()).toBe(TEMPLATE_BODY);
    expect(env.metadata().icon).toBe('🧾');
    expect(env.metadata().tags).toEqual(['work', 'tpl', 'meeting']);

    await env.pressRedo(); // the typing
    expect(env.doc()).toBe(typedBody);
    expect(env.metadata().icon).toBe('🧾');
  });

  it('works on a brand-new note (an unpersisted draft), whose first metadata change promotes it', async () => {
    const env = await setup({}, { metadata: FULL_TEMPLATE }, { draft: true });
    const id = env.noteId;

    await env.apply();
    expect(env.doc()).toBe(TEMPLATE_BODY);
    expect(env.page().id).toBe(id);
    expect(env.metadata().tags).toEqual(['tpl', 'meeting']);

    await env.pressUndo();
    expect(env.doc()).toBe('');
    expect(env.page().id).toBe(id);
    expect(env.metadata().tags).toEqual([]);
    expect(env.metadata().cover).toBeNull();

    await env.pressRedo();
    expect(env.doc()).toBe(TEMPLATE_BODY);
    expect(env.page().id).toBe(id);
    expect(env.metadata().tags).toEqual(['tpl', 'meeting']);
    expect(env.metadata().cover).toBe('https://example.com/tpl.jpg');
  });

  it('the real Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z shortcuts undo and redo the whole application', async () => {
    const env = await setup(
      { icon: '📝', tags: ['work'] },
      { metadata: FULL_TEMPLATE }
    );
    await env.apply();
    // The editor holds focus after applying, so the shortcuts reach it.
    expect(env.view().hasFocus).toBe(true);

    await env.pressUndoShortcut();
    expect(env.doc()).toBe('');
    expect(env.metadata().icon).toBe('📝');
    expect(env.metadata().tags).toEqual(['work']);

    await env.pressRedoShortcut();
    expect(env.doc()).toBe(TEMPLATE_BODY);
    expect(env.metadata().icon).toBe('🧾');
    expect(env.metadata().tags).toEqual(['work', 'tpl', 'meeting']);
  });

  it('survives a save in between: after undo the file holds the empty body and the old metadata, after redo the template', async () => {
    const env = await setup(
      { icon: '📝', tags: ['work'] },
      { metadata: FULL_TEMPLATE }
    );
    const onDisk = () => env.fileSystem.readFile(env.page().path);
    await env.apply();
    await env.application.pageOperations.requestSave(env.noteId);
    expect(await onDisk()).toContain('# Agenda');

    await env.pressUndo();
    await env.application.pageOperations.requestSave(env.noteId);
    const afterUndo = await onDisk();
    expect(env.doc()).toBe('');
    expect(afterUndo).not.toContain('# Agenda');
    expect(afterUndo).toContain('📝');
    expect(afterUndo).not.toContain('🧾');

    await env.pressRedo();
    await env.application.pageOperations.requestSave(env.noteId);
    const afterRedo = await onDisk();
    expect(env.doc()).toBe(TEMPLATE_BODY);
    expect(afterRedo).toContain('# Agenda');
    expect(afterRedo).toContain('🧾');
  });

  describe('chosen through the picker (+N more)', () => {
    beforeEach(() => {
      // No layout in jsdom: every measured element is 100px and the row 150px, so one suggestion and "+N more" show.
      vi.spyOn(
        HTMLElement.prototype,
        'getBoundingClientRect'
      ).mockImplementation(function (this: HTMLElement) {
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
      });
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
      ['with metadata', { metadata: FULL_TEMPLATE }],
      ['without metadata', {}],
    ])(
      '%s: the editor keeps focus, and the shortcuts undo and redo the template',
      async (_label, template) => {
        const env = await setup({ icon: '📝', tags: ['work'] }, template, {
          extraTemplates: 3,
        });

        await env.pickInPicker('Meeting Notes');
        expect(env.doc()).toBe(TEMPLATE_BODY);
        expect(env.view().hasFocus).toBe(true);

        await env.pressUndoShortcut();
        expect(env.doc()).toBe('');
        expect(env.metadata().icon).toBe('📝');
        expect(env.metadata().tags).toEqual(['work']);

        await env.pressRedoShortcut();
        expect(env.doc()).toBe(TEMPLATE_BODY);
      }
    );
  });

  it('still undoes the metadata after switching to another note and back (the restored history carries the step)', async () => {
    const env = await setup(
      { icon: '📝', tags: ['work'] },
      { metadata: FULL_TEMPLATE }
    );
    await env.apply();
    const operations = env.application.pageOperations;
    const other = await operations.openDraft({ folderId: null });
    await act(async () => {
      await operations.open(other);
    });
    await flush();
    await act(async () => {
      await operations.open(env.noteId);
    });
    await flush();
    expect(env.doc()).toBe(TEMPLATE_BODY);
    // The note's history came back with it.
    expect(undoDepth(env.view().state)).toBe(1);

    await env.pressUndo();
    expect(env.doc()).toBe('');
    expect(env.metadata().icon).toBe('📝');
    expect(env.metadata().tags).toEqual(['work']);
    expect(env.metadata().cover).toBeNull();

    await env.pressRedo();
    expect(env.doc()).toBe(TEMPLATE_BODY);
    expect(env.metadata().icon).toBe('🧾');
    expect(env.metadata().tags).toEqual(['work', 'tpl', 'meeting']);
    expect(env.metadata().cover).toBe('https://example.com/tpl.jpg');
  });
});

describe('undoing and redoing a template application respects what the user changed since', () => {
  it('a property the user changed after the template is kept by undo; the others are still restored', async () => {
    const env = await setup({ tags: ['mine'], icon: '📝' }, { metadata: FULL_TEMPLATE });
    await env.apply();

    // The user picks their own icon afterwards.
    await act(async () => {
      await env.application.pageOperations.updateMetadata(env.noteId, { icon: '🎯' });
    });
    await flush();

    await env.pressUndo();
    expect(env.doc()).toBe('');
    // Kept: the user's later icon. Restored: everything they did not touch.
    expect(env.metadata().icon).toBe('🎯');
    expect(env.metadata().cover).toBeNull();
    expect(env.metadata().description).toBeNull();
    expect(env.metadata().tags).toEqual(['mine']);

    // Redo must not take the user's icon back either.
    await env.pressRedo();
    expect(env.doc()).toBe(TEMPLATE_BODY);
    expect(env.metadata().icon).toBe('🎯');
    expect(env.metadata().cover).toBe('https://example.com/tpl.jpg');
    expect(env.metadata().tags).toEqual(['mine', 'tpl', 'meeting']);
  });

  it('tags added after the template are kept, and so are the rest of the tags (they move together)', async () => {
    const env = await setup({ tags: ['mine'] }, { metadata: FULL_TEMPLATE });
    await env.apply();
    await act(async () => {
      await env.application.pageOperations.updateMetadata(env.noteId, {
        tags: [...(env.metadata().tags ?? []), 'later'],
      });
    });
    await flush();

    await env.pressUndo();

    expect(env.doc()).toBe('');
    expect(env.metadata().tags).toEqual(['mine', 'tpl', 'meeting', 'later']);
    // Properties the user did not touch are still restored.
    expect(env.metadata().icon).toBeNull();
    expect(env.metadata().description).toBeNull();
  });
});

describe('a metadata save that fails while undoing or redoing', () => {
  it('is reported (not silent), the properties are left as they were, and redo then undo work once saving works', async () => {
    const env = await setup({ tags: ['mine'], icon: '📝' }, { metadata: FULL_TEMPLATE });
    await env.apply();
    const operations = env.application.pageOperations;
    const real = operations.updateMetadata.bind(operations);
    let failing = true;
    vi.spyOn(operations, 'updateMetadata').mockImplementation((...args) =>
      failing ? Promise.reject(new Error('disk full')) : real(...args)
    );

    await env.pressUndo();

    // The body moved with the editor's own history; the properties could not be written, and the user is told.
    expect(env.doc()).toBe('');
    expect(env.metadata().icon).toBe('🧾');
    expect(document.body.textContent).toContain('Couldn’t update the note’s properties');

    // Saving works again: redo restores the body; the properties already hold the template's values.
    failing = false;
    await env.pressRedo();
    expect(env.doc()).toBe(TEMPLATE_BODY);
    expect(env.metadata().icon).toBe('🧾');

    await env.pressUndo();
    expect(env.doc()).toBe('');
    expect(env.metadata().icon).toBe('📝');
    expect(env.metadata().tags).toEqual(['mine']);
  });
});
