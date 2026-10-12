// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { MarkdownAnalyzer } from '@core/vault/ingest/analysis/MarkdownAnalyzer';
import { PageAnalysisMapper } from '@core/vault/ingest/PageAnalysisMapper';
import { KnowledgeGraphBuilder } from '@core/vault/knowledge/KnowledgeGraphBuilder';
import { TagBuilder } from '@core/vault/knowledge/TagBuilder';
import { TaskBuilder } from '@core/vault/knowledge/TaskBuilder';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { Vault } from '@core/vault/models/Vault';
import type { Page } from '@core/vault/models/Page';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { TaskOperations } from '@core/application/task/TaskOperations';

import * as buildEditorExtensionsModule from '@features/markdown/editor/codemirror/buildEditorExtensions';
import { EditorView } from '@codemirror/view';

import { PageReferences } from './PageReferences';

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => vi.stubGlobal('ResizeObserver', ResizeObserverMock));
afterAll(() => vi.unstubAllGlobals());
afterEach(() => cleanup());

const ROOT = '/vault';
const analyzer = new MarkdownAnalyzer();
const mapper = new PageAnalysisMapper();
const pageMeta = {
  icon: null,
  cover: null,
  coverHidden: false,
  coverLayout: 'side' as const,
  coverPositionAbove: 50,
  coverPositionSide: 50,
  description: '',
  favorite: false,
  status: 'active' as const,
  archivedAt: null,
  originalParentId: null,
  originalPath: null,
  createdAt: null,
  updatedAt: null,
};

function page(
  id: string,
  relativePath: string,
  markdown = '',
  type: Page['type'] = 'note'
): Page {
  const scanned = analyzer.analyze(markdown);

  return {
    id,
    type,
    name: relativePath.split('/').pop()!.replace(/\.md$/, ''),
    path: `${ROOT}/${relativePath}`,
    parentId: null,
    metadata: pageMeta,
    source: { markdown },
    analysis: {
      headings: [],
      aliases: [],
      blockReferences: [],
      tasks: mapper.buildTasks(id, scanned.tasks),
      tags: [],
      links: mapper.buildLinks(id, scanned.links),
      embeds: mapper.buildEmbeds(id, scanned.embeds),
    },
  } as Page;
}

function makeVault(pages: Page[]): Vault {
  return new Vault(
    ROOT,
    pages,
    [],
    new TagBuilder().build(pages, new Map()),
    new TaskBuilder().build(pages),
    [],
    new KnowledgeGraphBuilder().build(
      pages,
      pages.flatMap((p) => p.analysis.links),
      pages.flatMap((p) => p.analysis.embeds),
      ROOT
    ),
    new VaultProjectionBuilder(),
    new Map()
  );
}

function setup(pages: Page[], pageId = 'target') {
  const vault = makeVault(pages);
  const pageOperations = { open: vi.fn() } as unknown as PageOperations;
  const taskOperations = {
    toggleComplete: vi.fn(),
    setDate: vi.fn(),
    clearDate: vi.fn(),
    duplicate: vi.fn(),
    delete: vi.fn(),
  } as unknown as TaskOperations;
  const onRequestReveal = vi.fn();

  const view = render(
    <PageReferences
      pageId={pageId}
      vault={vault}
      pageOperations={pageOperations}
      taskOperations={taskOperations}
      onRequestReveal={onRequestReveal}
    />
  );

  return { vault, pageOperations, taskOperations, onRequestReveal, ...view };
}

const TARGET = page('target', 'Target.md');

describe('PageReferences', () => {
  const entries = (list: number) =>
    [
      ...(document
        .querySelectorAll('.reference__list')
        [list]?.querySelectorAll('.reference__entry') ?? []),
    ] as HTMLElement[];

  it('renders nothing when the page has no references', () => {
    const { container } = setup([TARGET, page('x', 'X.md', 'unrelated')]);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows only the list that has results, with no divider', () => {
    setup([TARGET, page('n', 'Alpha.md', 'see [[Target]]')]);

    expect(document.querySelectorAll('.reference__list')).toHaveLength(1);
    expect(document.querySelectorAll('.reference__divider')).toHaveLength(0);
  });

  it('puts tasks in one list and notes, then daily notes, in the other, split by one divider', () => {
    setup([
      TARGET,
      page('t', 'Planner.md', '- [ ] Follow up [[Target]]'),
      page('n', 'Alpha.md', 'see [[Target]]'),
      page('d', 'Daily Notes/2026-10-10.md', 'Today: [[Target]]', 'daily-note'),
    ]);

    expect(document.querySelectorAll('.reference__divider')).toHaveLength(1);
    expect(entries(0).map((row) => row.textContent)).toEqual([
      expect.stringContaining('Follow up'),
    ]);
    // Notes first, then the daily note. Planner is not listed again — its only reference is the task above.
    expect(
      entries(1).map((row) => row.querySelector('.wiki__title')?.textContent)
    ).toEqual(['Alpha', expect.any(String)]);
    expect(entries(1)[0]!.textContent).toContain('see Target');
    expect(entries(1)[1]!.textContent).toContain('Today:');
  });

  it("a task entry shows its source note's title above the task text", () => {
    setup([TARGET, page('t', 'Planner.md', '- [ ] Follow up [[Target]]')]);

    expect(entries(0)[0]!.querySelector('.wiki__title')?.textContent).toBe(
      'Planner'
    );
  });

  it('opens a note and reveals every reference range in it', () => {
    const markdown = '[[Target]] and ![[Target]]';
    const { pageOperations, onRequestReveal } = setup([
      TARGET,
      page('n', 'Alpha.md', markdown),
    ]);

    fireEvent.click(entries(0)[0]!);

    expect(pageOperations.open).toHaveBeenCalledWith('n');
    expect(onRequestReveal).toHaveBeenCalledWith({
      pageId: 'n',
      ranges: [
        { from: 0, to: 10 },
        { from: 15, to: 26 },
      ],
    });
  });

  it("reveals only the clicked entry's own line, even between adjacent lines of one paragraph", () => {
    const markdown = 'First [[Target]]\nSecond [[Target]] and ![[Target]]\nthird';
    const { onRequestReveal } = setup([
      TARGET,
      page('n', 'Alpha.md', markdown),
    ]);

    expect(entries(0)).toHaveLength(2);

    fireEvent.click(entries(0)[1]!);

    expect(onRequestReveal).toHaveBeenCalledTimes(1);
    expect(onRequestReveal).toHaveBeenCalledWith({
      pageId: 'n',
      ranges: [
        { from: 24, to: 34 },
        { from: 39, to: 50 },
      ],
    });

    fireEvent.click(entries(0)[0]!);

    expect(onRequestReveal).toHaveBeenLastCalledWith({
      pageId: 'n',
      ranges: [{ from: 6, to: 16 }],
    });
  });

  it("opens a task's source note and reveals the task's own line", () => {
    const markdown = '- [ ] unrelated\n- [ ] Follow up [[Target]]';
    const { pageOperations, onRequestReveal } = setup([
      TARGET,
      page('t', 'Planner.md', markdown),
    ]);

    fireEvent.click(entries(0)[0]!);

    const line = '- [ ] Follow up [[Target]]';
    const from = markdown.indexOf(line);

    expect(pageOperations.open).toHaveBeenCalledWith('t');
    expect(onRequestReveal).toHaveBeenCalledWith({
      pageId: 't',
      ranges: [{ from, to: from + line.length }],
    });
  });

  it('toggles a task from its checkbox without opening the note', () => {
    const { pageOperations, taskOperations } = setup([
      TARGET,
      page('t', 'Planner.md', '- [ ] Follow up [[Target]]'),
    ]);

    fireEvent.click(screen.getByRole('checkbox'));

    expect(taskOperations.toggleComplete).toHaveBeenCalledTimes(1);
    expect(pageOperations.open).not.toHaveBeenCalled();
  });

  it('opens a daily note and reveals the reference in it', () => {
    const { pageOperations, onRequestReveal } = setup([
      TARGET,
      page('d', 'Daily Notes/2026-10-10.md', 'Met [[Target]]', 'daily-note'),
    ]);

    fireEvent.click(entries(0)[0]!);

    expect(pageOperations.open).toHaveBeenCalledWith('d');
    expect(onRequestReveal).toHaveBeenCalledWith({
      pageId: 'd',
      ranges: [{ from: 4, to: 14 }],
    });
  });

  it('collapses the whole section from its header', () => {
    setup([TARGET, page('n', 'Alpha.md', 'see [[Target]]')]);

    fireEvent.click(screen.getByRole('button', { name: 'References' }));

    expect(document.querySelectorAll('.reference__entry')).toHaveLength(0);
  });

  it('updates when the underlying content changes', () => {
    const { vault, rerender, pageOperations, taskOperations, onRequestReveal } =
      setup([TARGET, page('n', 'Alpha.md', 'nothing yet')]);
    const props = {
      pageId: 'target',
      vault,
      pageOperations,
      taskOperations,
      onRequestReveal,
    };

    expect(screen.queryByText('Alpha')).toBeNull();

    vault.replacePage(page('n', 'Alpha.md', 'now [[Target]]'));
    rerender(<PageReferences {...props} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();

    vault.replacePage(page('n', 'Alpha.md', 'gone again'));
    rerender(<PageReferences {...props} />);
    expect(screen.queryByText('Alpha')).toBeNull();
  });

  it('recomputes only when the vault changes, not on every render', () => {
    const { vault, rerender, pageOperations, taskOperations, onRequestReveal } =
      setup([TARGET, page('n', 'Alpha.md', '[[Target]]')]);
    const lookups = vi.spyOn(vault, 'getPage');
    const props = {
      pageId: 'target',
      vault,
      pageOperations,
      taskOperations,
      onRequestReveal,
    };

    rerender(<PageReferences {...props} />);
    rerender(<PageReferences {...props} />);

    expect(lookups).not.toHaveBeenCalled();
  });
});

describe('PageReferences: editor previews', () => {
  const previews = () => [
    ...document.querySelectorAll<HTMLElement>(
      '.reference__entry .reference-preview .cm-content'
    ),
  ];

  it('shows only the referencing line in a read-only editor view, with its inline formatting', () => {
    setup([
      TARGET,
      page(
        'n',
        'Alpha.md',
        'Another line above that\nA line with **bold** and a [[Target]] link\nAnother line below that'
      ),
    ]);

    expect(previews()).toHaveLength(1);

    const [content] = previews();
    const view = EditorView.findFromDOM(content!)!;

    expect(view.state.doc.toString()).toBe(
      'A line with **bold** and a [[Target]] link'
    );
    expect(content!.querySelector('.tok-strong')?.textContent).toBe('bold');
    expect(view.state.readOnly).toBe(true);
  });

  it('gives each referencing line of one paragraph its own preview', () => {
    setup([TARGET, page('n', 'Alpha.md', 'a [[Target]]\nmiddle\nb [[Target]]')]);

    expect(
      previews().map((content) =>
        EditorView.findFromDOM(content)!.state.doc.toString()
      )
    ).toEqual(['a [[Target]]', 'b [[Target]]']);
  });

  it("keeps a list item's marker but not its parent or sub-items, dedented", () => {
    setup([
      TARGET,
      page('n', 'Alpha.md', '- top\n  - nested [[Target]]\n    - child'),
    ]);

    expect(EditorView.findFromDOM(previews()[0]!)!.state.doc.toString()).toBe(
      '- nested [[Target]]'
    );
  });

  it('shows a line with an embed compactly, never rendering the embedded content', () => {
    setup([
      TARGET,
      page('n', 'Alpha.md', 'above\nsee ![[Target]] here\nbelow'),
    ]);

    expect(previews()).toHaveLength(0);
    expect(document.querySelector('.cm-note-embed')).toBeNull();
    expect(
      document.querySelector('.reference-entry__body.line-clamp-3')
    ).not.toBeNull();
  });

  it('shows a task with an embed compactly too', () => {
    setup([TARGET, page('t', 'Planner.md', '- [ ] open ![[Target]]')]);

    expect(previews()).toHaveLength(0);
    expect(document.querySelector('.cm-note-embed')).toBeNull();
    expect(
      document.querySelector('.reference-entry__body.line-clamp-3')
    ).not.toBeNull();
  });

  it('previews a task through the same view, with completed styling when it is done', () => {
    setup([
      TARGET,
      page(
        't',
        'Planner.md',
        '- [ ] open [[Target]]\n- [x] finished [[Target]]'
      ),
    ]);

    const [open, done] = previews();

    expect(open!).not.toHaveClass('cm-task-completed');
    expect(done!).toHaveClass('cm-task-completed');
  });

  it('falls back to the compact one-line rendering when the line is too long to preview', () => {
    setup([TARGET, page('big', 'Big.md', `${'x'.repeat(1600)} [[Target]]`)]);

    expect(previews()).toHaveLength(0);
    expect(
      document.querySelector('.reference-entry__body.line-clamp-3')
    ).not.toBeNull();
  });

  it('builds the extension list once for every entry in the section', () => {
    const build = vi.spyOn(
      buildEditorExtensionsModule,
      'buildEditorExtensions'
    );
    setup([
      TARGET,
      page('a', 'A.md', 'one [[Target]]'),
      page('b', 'B.md', 'two [[Target]]'),
      page('c', 'C.md', '- [ ] three [[Target]]'),
    ]);

    expect(previews()).toHaveLength(3);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('destroys every preview view when the section unmounts', () => {
    const destroy = vi.spyOn(EditorView.prototype, 'destroy');
    const { unmount } = setup([
      TARGET,
      page('a', 'A.md', 'one [[Target]]'),
      page('b', 'B.md', 'two [[Target]]'),
    ]);

    expect(previews()).toHaveLength(2);
    unmount();

    expect(destroy).toHaveBeenCalledTimes(2);
    expect(document.querySelector('.cm-editor')).toBeNull();
  });

  it('updates a preview in place when its source note changes', () => {
    const { vault, rerender, pageOperations, taskOperations, onRequestReveal } =
      setup([TARGET, page('n', 'Alpha.md', 'before [[Target]]')]);
    const view = EditorView.findFromDOM(previews()[0]!)!;

    vault.replacePage(page('n', 'Alpha.md', 'after, with **more** [[Target]]'));
    rerender(
      <PageReferences
        pageId="target"
        vault={vault}
        pageOperations={pageOperations}
        taskOperations={taskOperations}
        onRequestReveal={onRequestReveal}
      />
    );

    expect(EditorView.findFromDOM(previews()[0]!)).toBe(view);
    expect(view.state.doc.toString()).toBe('after, with **more** [[Target]]');
  });

  it('opens the source note when the entry is clicked from inside its preview', () => {
    const { pageOperations } = setup([
      TARGET,
      page('n', 'Alpha.md', 'see [[Target]]'),
    ]);

    // A click on content inside the preview bubbles to the entry (pointer-events: none makes that the real target).
    fireEvent.click(previews()[0]!);

    expect(pageOperations.open).toHaveBeenCalledWith('n');
  });
});
