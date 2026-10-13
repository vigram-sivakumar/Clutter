// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { EditorView } from '@codemirror/view';

import { AppLayout } from '../app-layout/AppLayout';
import { Application } from '@core/application/Application';
import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraphBuilder } from '@core/vault/knowledge/KnowledgeGraphBuilder';
import { MarkdownAnalyzer } from '@core/vault/ingest/analysis/MarkdownAnalyzer';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '@core/vault/providers/SelfWriteRegistry';
import { PageCreator } from '@core/application/page/PageCreator';
import { PageFactory } from '@core/application/page/PageFactory';
import { PageBuilder } from '@core/vault/ingest/PageBuilder';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import { DailyNotePath } from '@core/vault/ingest/DailyNotePath';
import { FolderBuilder } from '@core/vault/ingest/FolderBuilder';
import { createTemplate } from '@features/notes/helpers/createTemplate';
import type { Page } from '@core/vault/models/Page';

/**
 * The References section through the real AppLayout -> PageHost: it renders, from the knowledge graph, for a
 * regular note and a daily note that other notes reference — never for a page nothing references, or an unsaved
 * draft — inside the page body in the editor's own column right after the editor, outside CodeMirror's DOM. The
 * editor and the template suggestions behave as before.
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
});

const ROOT = '/vault';
const analysis = {
  headings: [],
  blockReferences: [],
  tasks: [],
  tags: [],
  links: [],
  embeds: [],
};

function note(markdown: string): Page {
  return new PageBuilder(ROOT).build({
    parentId: null,
    page: {
      path: `${ROOT}/Note.md`,
      directoryPath: ROOT,
      frontmatter: { id: 'note-1' },
      frontmatterAnalysis: { aliases: [] },
      content: markdown,
      analysis,
    },
  });
}

function dailyNote(isoDate: string, markdown: string): Page {
  const [year, month, day] = isoDate.split('-').map(Number);
  const path = DailyNotePath.absoluteFrom(
    ROOT,
    new Date(year!, month! - 1, day!)
  );

  return new PageBuilder(ROOT).build({
    parentId: null,
    page: {
      path,
      directoryPath: path.slice(0, path.lastIndexOf('/')),
      frontmatter: { id: `daily-${isoDate}` },
      frontmatterAnalysis: { aliases: [] },
      content: markdown,
      analysis,
    },
  });
}

/** A second note whose markdown references other pages; its analysis comes from the real analyzer. */
function source(markdown: string): Page {
  const scanned = new MarkdownAnalyzer().analyze(markdown);

  return new PageBuilder(ROOT).build({
    parentId: null,
    page: {
      path: `${ROOT}/Source.md`,
      directoryPath: ROOT,
      frontmatter: { id: 'source-1' },
      frontmatterAnalysis: { aliases: [] },
      content: markdown,
      analysis: scanned,
    },
  });
}

/** What VaultBuilder hands the Vault at scan time: the graph derived from every page. */
const graphOf = (pages: Page[]) =>
  new KnowledgeGraphBuilder().build(
    pages,
    pages.flatMap((page) => page.analysis.links),
    pages.flatMap((page) => page.analysis.embeds),
    ROOT
  );

function makeApplication(
  pages: Page[],
  folderPaths: string[] = []
): Application {
  const folders = folderPaths.map((path) =>
    new FolderBuilder().build({
      parentId: null,
      directory: { path, parentPath: null, frontmatter: null },
    })
  );
  const vault = new Vault(
    ROOT,
    pages,
    folders,
    [],
    [],
    [],
    graphOf(pages),
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

  return application;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function show(
  application: Application,
  open: () => Promise<unknown>
): Promise<void> {
  await open();
  render(<AppLayout application={application} />);
  await flush();
}

const section = () => document.querySelector<HTMLElement>('.reference');

/** The checks that hold wherever the section renders. */
function expectPlacedAfterTheEditor() {
  const references = section();
  expect(references).not.toBeNull();
  expect(document.querySelectorAll('.reference')).toHaveLength(1);

  // A direct child of .page__body, beside .page-content.markdown__editor: not inside the Markdown
  // content, and not inside CodeMirror.
  const body = document.querySelector('.page__body')!;
  const content = document.querySelector('.page-content.markdown__editor')!;
  expect(references!.parentElement).toBe(body);
  expect(content.parentElement).toBe(body);
  expect(content.contains(references)).toBe(false);
  expect(references!.closest('.cm-editor')).toBeNull();
  expect(document.querySelector('.cm-editor')!.contains(references)).toBe(
    false
  );

  // Rendered right after the Markdown content column.
  expect(content.nextElementSibling).toBe(references);
}

describe('PageHost: the References section', () => {
  it('renders for a regular note that another note references, beside the Markdown content', async () => {
    const application = makeApplication([
      note('Some text'),
      source('See [[Note]] for details.'),
    ]);
    await show(application, () => application.pageOperations.open('note-1'));

    expectPlacedAfterTheEditor();
  });

  it('renders for a daily note that a note references, beside the Markdown content', async () => {
    const page = dailyNote('2026-01-15', 'Daily text');
    const link = DailyNotePath.from(new Date(2026, 0, 15)).replace(/\.md$/, '');
    const application = makeApplication([
      page,
      source(`Written on [[${link}]].`),
    ]);
    await show(application, () => application.pageOperations.open(page.id));

    expectPlacedAfterTheEditor();
  });

  it('lists the referencing note as a group: its title over the line that references the page', async () => {
    const application = makeApplication([
      note('Some text'),
      source('See [[Note]] for details.'),
    ]);
    await show(application, () => application.pageOperations.open('note-1'));

    const entries = section()!.querySelectorAll('.reference__entry');

    expect(entries).toHaveLength(1);
    expect(section()!.querySelector('.reference__heading')!.textContent).toBe(
      'Source'
    );
    expect(entries[0]!.textContent).toContain('See');
    // Only the section title, with the count: no group headers.
    expect(
      [...section()!.querySelectorAll('.section-header__title')].map(
        (node) => node.textContent
      )
    ).toEqual(['1 Reference']);
  });

  it('is not rendered for a page that nothing references', async () => {
    const application = makeApplication([
      note('Some text'),
      source('Nothing about it.'),
    ]);
    await show(application, () => application.pageOperations.open('note-1'));

    expect(section()).toBeNull();
  });

  it('is not rendered for an unsaved draft, which nothing can reference yet', async () => {
    const application = makeApplication([source('See [[Note]].')]);
    await show(application, () =>
      application.pageOperations.openDraft({ folderId: null })
    );

    expect(section()).toBeNull();
  });

  it('is not rendered by the collection pages', async () => {
    const application = makeApplication(
      [note('Some text'), source('See [[Note]].')],
      [`${ROOT}/Projects`]
    );
    await show(application, () =>
      application.folderOperations.open(`${ROOT}/Projects`)
    );

    expect(section()).toBeNull();
  });
});

describe('PageHost: the editor and template suggestions are unchanged by it', () => {
  const editorView = () =>
    EditorView.findFromDOM(
      document.querySelector<HTMLElement>('.cm-content')!
    )!;

  it('typing in the editor works and does not touch the section', async () => {
    const application = makeApplication([
      note('Hello'),
      source('See [[Note]].'),
    ]);
    await show(application, () => application.pageOperations.open('note-1'));
    const before = section()!.outerHTML;

    const view = editorView();
    view.focus();
    await act(async () => {
      view.dispatch({
        changes: { from: 5, insert: ' world' },
        userEvent: 'input.type',
      });
    });
    await flush();

    expect(view.state.doc.toString()).toBe('Hello world');
    expect(
      application.pageOperations.getSession('note-1')!.currentRevision.markdown
    ).toBe('Hello world');
    expect(section()!.outerHTML).toBe(before);
  });

  it('an empty note still offers its templates, outside the section and as before', async () => {
    const application = makeApplication([note(''), source('See [[Note]].')]);
    await createTemplate(
      application.folderOperations,
      application.pageOperations
    );
    const templateDraft = application.workspace.activePageId!;
    await application.pageOperations.mutateBody(
      templateDraft,
      () => '# Agenda'
    );
    await application.pageOperations.requestSave(templateDraft);
    await show(application, () => application.pageOperations.open('note-1'));

    expect(
      document.querySelector('.page__template-suggestions')
    ).not.toBeNull();
    expect(
      document.querySelector('.template-suggestions__item')
    ).not.toBeNull();
    expect(
      section()!.contains(document.querySelector('.page__template-suggestions'))
    ).toBe(false);

    fireEvent.click(document.querySelector('.template-suggestions__item')!);
    await flush();
    await flush();

    expect(
      application.pageOperations.getSession('note-1')!.currentRevision.markdown
    ).toBe('# Agenda');
    expect(editorView().state.doc.toString()).toBe('# Agenda');
    expectPlacedAfterTheEditor();
  });
});
