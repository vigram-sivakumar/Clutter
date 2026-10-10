// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, render } from '@testing-library/react';
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
import { undo, undoDepth } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';

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
import type { Page } from '@core/vault/models/Page';
import { __clearAllCachedEditorHistoryForTests } from '@features/markdown/editor/codemirror/editorHistoryCache';

/**
 * Editor identity and isolation through the real AppLayout -> PageHost -> MarkdownEditor composition: an update
 * for one note never reaches another note's editor, a note's cached history comes back with it, and an external
 * write adds exactly one revision (no echo, no duplicate transaction).
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

function buildNote(id: string, name: string, markdown: string): Page {
  return new PageBuilder(ROOT).build({
    parentId: null,
    page: {
      path: `${ROOT}/${name}.md`,
      directoryPath: ROOT,
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content: markdown,
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

async function setup() {
  const pages = [buildNote('a', 'A', 'Alpha'), buildNote('b', 'B', 'Beta')];
  const vault = new Vault(
    ROOT,
    pages,
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
  await application.pageOperations.open('a');

  render(<AppLayout application={application} />);
  await flush();

  const operations = application.pageOperations;
  const open = async (id: string) => {
    await act(async () => {
      await operations.open(id);
    });
    await flush();
  };
  const view = () =>
    EditorView.findFromDOM(
      document.querySelector<HTMLElement>('.cm-content')!
    )!;
  const doc = () => view().state.doc.toString();
  const revision = (id: string) =>
    operations.getSession(id)!.currentRevision.number;
  const markdown = (id: string) =>
    operations.getSession(id)!.currentRevision.markdown;
  /** A real keystroke in whichever note is showing. */
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
  const externalWrite = async (id: string, suffix: string) => {
    await act(async () => {
      await operations.mutateBody(id, (current) => current + suffix);
    });
    await flush();
  };

  return {
    operations,
    open,
    view,
    doc,
    revision,
    markdown,
    type,
    externalWrite,
  };
}

describe('editor isolation and history across notes', () => {
  it("shows each note's own document and nothing leaks between them", async () => {
    const { open, doc } = await setup();
    expect(doc()).toBe('Alpha');

    await open('b');
    expect(doc()).toBe('Beta');

    await open('a');
    expect(doc()).toBe('Alpha');
  });

  it('returning to a note restores its document and its undo history', async () => {
    const { open, view, doc, type } = await setup();
    await type('!');
    expect(doc()).toBe('Alpha!');

    await open('b');
    await open('a');

    expect(doc()).toBe('Alpha!');
    expect(undoDepth(view().state)).toBe(1);
    undo(view());
    expect(doc()).toBe('Alpha');
  });

  it('an external write to a note that is not showing cannot reach the note that is', async () => {
    const { open, doc, markdown, revision, externalWrite } = await setup();
    await open('b');
    const aBefore = revision('a');
    const bBefore = revision('b');

    await externalWrite('a', ' [ext]');

    expect(doc()).toBe('Beta');
    expect(markdown('b')).toBe('Beta');
    expect(revision('b')).toBe(bBefore);
    expect(revision('a') - aBefore).toBe(1);
  });

  it('the note picks up that write when it is opened again — current content, fresh history, no extra revision', async () => {
    const { open, view, doc, revision, type, externalWrite } = await setup();
    await type('!');
    await open('b');
    await externalWrite('a', ' [ext]');
    const aBefore = revision('a');

    await open('a');

    expect(doc()).toBe('Alpha! [ext]');
    // The cached history belonged to a document that no longer exists, so it is not applied (docTextMatches).
    expect(undoDepth(view().state)).toBe(0);
    expect(revision('a')).toBe(aBefore);
  });

  it('writes and switches in quick succession each land on their own note', async () => {
    const { operations, open, doc, markdown, revision } = await setup();
    // Both notes have been opened, so each has a live session.
    await open('b');
    await open('a');
    const aBefore = revision('a');
    const bBefore = revision('b');

    // Issued back to back, with no render between them.
    await act(async () => {
      await Promise.all([
        operations.mutateBody('a', (current) => `${current} [a1]`),
        operations.open('b'),
        operations.mutateBody('b', (current) => `${current} [b1]`),
      ]);
      await operations.mutateBody('a', (current) => `${current} [a2]`);
      await operations.open('a');
    });
    await flush();

    expect(doc()).toBe('Alpha [a1] [a2]');
    expect(markdown('a')).toBe('Alpha [a1] [a2]');
    expect(markdown('b')).toBe('Beta [b1]');
    expect(revision('a') - aBefore).toBe(2);
    expect(revision('b') - bBefore).toBe(1);

    await open('b');
    expect(doc()).toBe('Beta [b1]');
  });

  it('an external write to the note that is showing adds one revision and is not echoed back', async () => {
    const { doc, revision, externalWrite } = await setup();
    const before = revision('a');

    await externalWrite('a', ' [ext]');

    expect(doc()).toBe('Alpha [ext]');
    expect(revision('a') - before).toBe(1);
  });

  it('a keystroke typed before React renders an external write keeps both the write and the keystroke', async () => {
    const { operations, view, doc, markdown, revision } = await setup();
    const current = view();
    current.focus();
    const before = revision('a');

    await act(async () => {
      // The external write reaches the session; React has not rendered it into the editor yet.
      await operations.mutateBody('a', (text) => `${text} [ext]`);
      expect(current.state.doc.toString()).toBe('Alpha');
      // The next keystroke, made from the text the editor still has.
      current.dispatch({
        changes: { from: 5, insert: '!' },
        selection: { anchor: 6 },
        userEvent: 'input.type',
      });
    });
    await flush();

    expect(markdown('a')).toBe('Alpha [ext]!');
    expect(doc()).toBe('Alpha [ext]!');
    // One revision for the write, one for the keystroke; the sync adds none.
    expect(revision('a') - before).toBe(2);
    // The caret stays right after what the user typed, which now sits after the external text.
    expect(view().state.selection.main.head).toBe('Alpha [ext]!'.length);
  });
});
