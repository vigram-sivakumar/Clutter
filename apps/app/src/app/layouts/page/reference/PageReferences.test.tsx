// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

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
  icon: null, cover: null, coverHidden: false, coverLayout: 'side' as const, coverPositionAbove: 50,
  coverPositionSide: 50, description: '', favorite: false, status: 'active' as const, archivedAt: null,
  originalParentId: null, originalPath: null, createdAt: null, updatedAt: null,
};

function page(id: string, relativePath: string, markdown = '', type: Page['type'] = 'note'): Page {
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
      headings: [], aliases: [], blockReferences: [],
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
    new KnowledgeGraphBuilder().build(pages, pages.flatMap((p) => p.analysis.links), pages.flatMap((p) => p.analysis.embeds), ROOT),
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
    [...(document.querySelectorAll('.reference__list')[list]?.querySelectorAll('.reference__entry') ?? [])] as HTMLElement[];

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
    expect(entries(0).map((row) => row.textContent)).toEqual([expect.stringContaining('Follow up')]);
    // Notes first, then the daily note. Planner is not listed again — its only reference is the task above.
    expect(entries(1).map((row) => row.querySelector('.wiki__title')?.textContent)).toEqual(['Alpha', expect.any(String)]);
    expect(entries(1)[0]!.textContent).toContain('see Target');
    expect(entries(1)[1]!.textContent).toContain('Today:');
  });

  it("a task entry shows its source note's title above the task text", () => {
    setup([TARGET, page('t', 'Planner.md', '- [ ] Follow up [[Target]]')]);

    expect(entries(0)[0]!.querySelector('.wiki__title')?.textContent).toBe('Planner');
  });

  it('opens a note and reveals every reference range in it', () => {
    const markdown = '[[Target]] and ![[Target]]';
    const { pageOperations, onRequestReveal } = setup([TARGET, page('n', 'Alpha.md', markdown)]);

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

  it("opens a task's source note and reveals the task's own line", () => {
    const markdown = '- [ ] unrelated\n- [ ] Follow up [[Target]]';
    const { pageOperations, onRequestReveal } = setup([TARGET, page('t', 'Planner.md', markdown)]);

    fireEvent.click(entries(0)[0]!);

    const line = '- [ ] Follow up [[Target]]';
    const from = markdown.indexOf(line);

    expect(pageOperations.open).toHaveBeenCalledWith('t');
    expect(onRequestReveal).toHaveBeenCalledWith({ pageId: 't', ranges: [{ from, to: from + line.length }] });
  });

  it('toggles a task from its checkbox without opening the note', () => {
    const { pageOperations, taskOperations } = setup([TARGET, page('t', 'Planner.md', '- [ ] Follow up [[Target]]')]);

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
    expect(onRequestReveal).toHaveBeenCalledWith({ pageId: 'd', ranges: [{ from: 4, to: 14 }] });
  });

  it('collapses the whole section from its header', () => {
    setup([TARGET, page('n', 'Alpha.md', 'see [[Target]]')]);

    fireEvent.click(screen.getByRole('button', { name: 'References' }));

    expect(document.querySelectorAll('.reference__entry')).toHaveLength(0);
  });

  it('updates when the underlying content changes', () => {
    const { vault, rerender, pageOperations, taskOperations, onRequestReveal } = setup([
      TARGET,
      page('n', 'Alpha.md', 'nothing yet'),
    ]);
    const props = { pageId: 'target', vault, pageOperations, taskOperations, onRequestReveal };

    expect(screen.queryByText('Alpha')).toBeNull();

    vault.replacePage(page('n', 'Alpha.md', 'now [[Target]]'));
    rerender(<PageReferences {...props} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();

    vault.replacePage(page('n', 'Alpha.md', 'gone again'));
    rerender(<PageReferences {...props} />);
    expect(screen.queryByText('Alpha')).toBeNull();
  });

  it('recomputes only when the vault changes, not on every render', () => {
    const { vault, rerender, pageOperations, taskOperations, onRequestReveal } = setup([
      TARGET,
      page('n', 'Alpha.md', '[[Target]]'),
    ]);
    const lookups = vi.spyOn(vault, 'getPage');
    const props = { pageId: 'target', vault, pageOperations, taskOperations, onRequestReveal };

    rerender(<PageReferences {...props} />);
    rerender(<PageReferences {...props} />);

    expect(lookups).not.toHaveBeenCalled();
  });
});
