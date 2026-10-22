// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, render } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { undoDepth } from '@codemirror/commands';

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
import { writeShowTagEmojis } from '@shared/helpers/showTagEmojisPreference';

/**
 * A tag's emoji changed while its notes are open — in the sidebar's Change icon, which goes through
 * `TagOperations.updateMetadata` and publishes the new definitions to the Vault. Everything on screen that shows it
 * follows at once, with no reload and no edit: the `#tag` references in the Markdown and the Tags property pills. The
 * editor is redecorated, never rebuilt: its text, caret and undo history stay as they were. Through the real AppLayout.
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
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

const ROOT = '/vault';

function buildPage(name: string, id: string, content: string, tags: string[]): Page {
  return new PageBuilder(ROOT).build({
    parentId: null,
    page: {
      path: `${ROOT}/${name}.md`,
      directoryPath: ROOT,
      // `entryOrder` lists `tags` as an entry of the file, which is what puts the Tags property on the page.
      frontmatter: { id, tags, entryOrder: ['tags'] },
      frontmatterAnalysis: { aliases: [] },
      content,
      analysis: {
        headings: [],
        blockReferences: [],
        // Inline `#design` references, as the scanner reports them (the Vault's tag model is built from these).
        tasks: [],
        tags: [...content.matchAll(/#design/g)].map((match) => ({
          name: 'design',
          startOffset: match.index!,
          endOffset: match.index! + match[0].length,
        })),
        links: [],
        embeds: [],
      },
    },
  });
}

const NOTE_A = 'see #design and #design again here';
const NOTE_B = 'also #design in this other note here';

async function openApplication(): Promise<{ application: Application; a: Page; b: Page }> {
  const a = buildPage('Alpha', 'alpha', NOTE_A, ['design']);
  const b = buildPage('Beta', 'beta', NOTE_B, ['design']);
  const vault = new Vault(
    ROOT,
    [a, b],
    [],
    new TagBuilder().build([a, b]),
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder(),
    new Map(),
    []
  );
  const application = new Application(vault, new InMemoryVaultFileSystem(), new SelfWriteRegistry());
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  await application.pageOperations.open('alpha');
  return { application, a, b };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

const setEmoji = async (application: Application, icon: string | undefined) => {
  await act(async () => {
    await application.tagOperations.updateMetadata('design', icon === undefined ? { icon: undefined } : { icon });
  });
  await flush();
};

const editorView = () => EditorView.findFromDOM(document.querySelector<HTMLElement>('.cm-editor')!.parentElement as HTMLElement)!;
/** The `#`-or-emoji in front of each tag reference in the Markdown. */
const markdownPrefixes = () =>
  [...document.querySelectorAll('.cm-editor .tok-tag .tok-tag-prefix')].map((el) => el.textContent);
/** The same, on the Tags property's pills. */
const pillPrefixes = () => [...document.querySelectorAll('.pill .pill__prefix')].map((el) => el.textContent);

describe('changing a tag’s emoji while its note is open', () => {
  it('starts with the `#` everywhere for a tag with no emoji', async () => {
    const { application } = await openApplication();
    render(<AppLayout application={application} />);
    await flush();

    expect(markdownPrefixes()).toEqual(['#', '#']);
    expect(pillPrefixes()).toEqual(['#']);
  });

  it('updates every occurrence in the Markdown and the Tags property pill at once, with each change, both ways', async () => {
    const { application } = await openApplication();
    render(<AppLayout application={application} />);
    await flush();

    await setEmoji(application, '📦');
    expect(markdownPrefixes()).toEqual(['📦', '📦']);
    expect(pillPrefixes()).toEqual(['📦']);

    await setEmoji(application, '🚀');
    expect(markdownPrefixes()).toEqual(['🚀', '🚀']);
    expect(pillPrefixes()).toEqual(['🚀']);

    await setEmoji(application, undefined);
    expect(markdownPrefixes()).toEqual(['#', '#']);
    expect(pillPrefixes()).toEqual(['#']);
  });

  it('redecorates the open editor in place: same view, same text, caret and undo history untouched', async () => {
    const { application } = await openApplication();
    render(<AppLayout application={application} />);
    await flush();
    const view = editorView();
    // Inside the word "see", clear of both tags (a tag under the caret shows as raw text).
    act(() => view.dispatch({ selection: { anchor: 1, head: 1 } }));
    const undoBefore = undoDepth(view.state);
    const docBefore = view.state.doc.toString();

    await setEmoji(application, '📦');

    expect(editorView()).toBe(view);
    expect(view.state.doc.toString()).toBe(docBefore);
    expect(view.state.selection.main.anchor).toBe(1);
    expect(view.state.selection.main.head).toBe(1);
    expect(undoDepth(view.state)).toBe(undoBefore);
    expect(markdownPrefixes()).toEqual(['📦', '📦']);
  });

  it('never rewrites the note: the Markdown still reads `#design` and nothing is saved', async () => {
    const { application, a } = await openApplication();
    render(<AppLayout application={application} />);
    await flush();

    await setEmoji(application, '📦');

    expect(editorView().state.doc.toString()).toBe(NOTE_A);
    expect(application.vault.getPage(a.id)!.source.markdown).toBe(NOTE_A);
  });

  it('shows the new emoji in another note that uses the tag, without reopening anything', async () => {
    const { application, b } = await openApplication();
    render(<AppLayout application={application} />);
    await flush();

    await setEmoji(application, '📦');
    await act(async () => {
      await application.pageOperations.open(b.id);
    });
    await flush();

    expect(markdownPrefixes()).toEqual(['📦']);
    expect(pillPrefixes()).toEqual(['📦']);

    await setEmoji(application, '🚀');
    expect(markdownPrefixes()).toEqual(['🚀']);
    expect(pillPrefixes()).toEqual(['🚀']);
  });
});

describe('changing a tag’s emoji with Show tag emojis turned off', () => {
  it('keeps every `#` — a changed emoji never makes one visible — and shows it once the setting is turned back on', async () => {
    writeShowTagEmojis(false);
    const { application } = await openApplication();
    render(<AppLayout application={application} />);
    await flush();

    await setEmoji(application, '📦');
    expect(markdownPrefixes()).toEqual(['#', '#']);
    expect(pillPrefixes()).toEqual(['#']);
    expect(document.querySelector('.tok-tag-prefix--emoji, .pill__prefix--emoji')).toBeNull();

    await setEmoji(application, '🚀');
    expect(markdownPrefixes()).toEqual(['#', '#']);

    act(() => writeShowTagEmojis(true));
    await flush();
    expect(markdownPrefixes()).toEqual(['🚀', '🚀']);
    expect(pillPrefixes()).toEqual(['🚀']);
  });
});
