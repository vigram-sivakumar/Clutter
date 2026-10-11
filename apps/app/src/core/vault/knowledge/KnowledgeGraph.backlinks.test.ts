import { describe, expect, it } from 'vitest';

import { MarkdownAnalyzer } from '../ingest/analysis/MarkdownAnalyzer';
import { PageAnalysisMapper } from '../ingest/PageAnalysisMapper';
import { Vault } from '../models/Vault';
import type { Page } from '../models/Page';
import { KnowledgeGraphBuilder } from './KnowledgeGraphBuilder';
import { TagBuilder } from './TagBuilder';
import { TaskBuilder } from './TaskBuilder';
import { VaultProjectionBuilder } from './VaultProjectionBuilder';

/**
 * Backlinks: pages are built from real markdown through the same analyzer and mapper the ingest uses,
 * so a reference's offsets and its resolution are exercised end to end.
 */

const ROOT = '/vault';
const analyzer = new MarkdownAnalyzer();
const mapper = new PageAnalysisMapper();

const pageMeta = {
  icon: null, cover: null, coverHidden: false, coverLayout: 'side' as const, coverPositionAbove: 50,
  coverPositionSide: 50, description: '', favorite: false, status: 'active' as const, archivedAt: null,
  originalParentId: null, originalPath: null, createdAt: null, updatedAt: null,
};

function page(id: string, relativePath: string, markdown = '', aliases: string[] = []): Page {
  const scanned = analyzer.analyze(markdown);

  return {
    id,
    type: 'note',
    name: relativePath.split('/').pop()!.replace(/\.md$/, ''),
    path: `${ROOT}/${relativePath}`,
    parentId: null,
    metadata: pageMeta,
    source: { markdown },
    analysis: {
      headings: mapper.buildHeadings(scanned.headings),
      aliases: aliases.map((value) => ({ value })),
      blockReferences: mapper.buildBlockReferences(scanned.blockReferences),
      tasks: mapper.buildTasks(id, scanned.tasks),
      tags: mapper.buildTags(id, scanned.tags),
      links: mapper.buildLinks(id, scanned.links),
      embeds: mapper.buildEmbeds(id, scanned.embeds),
    },
  } as Page;
}

const buildGraph = (pages: Page[]) =>
  new KnowledgeGraphBuilder().build(
    pages,
    pages.flatMap((p) => p.analysis.links),
    pages.flatMap((p) => p.analysis.embeds),
    ROOT
  );

describe('KnowledgeGraph backlinks', () => {
  it('resolves a link written as the editor writes it — vault-relative, no extension', () => {
    const target = page('t', 'Projects/Alpha.md');
    const source = page('s', 'Notes/Source.md', 'See [[Projects/Alpha]].');
    const [edge] = buildGraph([target, source]).incomingEdges('t');

    expect(edge).toMatchObject({ sourcePageId: 's', targetPageId: 't', kind: 'link' });
    expect(source.source.markdown.slice(edge!.startOffset, edge!.endOffset)).toBe('[[Projects/Alpha]]');
  });

  it('does not resolve a bare file name for a page in a folder — the editor shows that link as unresolved too', () => {
    const graph = buildGraph([page('t', 'Projects/Alpha.md'), page('s', 'Source.md', '[[Alpha]]')]);

    expect(graph.incomingEdges('t')).toEqual([]);
  });

  it('does not resolve an alias shared by two pages', () => {
    const graph = buildGraph([
      page('a', 'One.md', '', ['Shared']),
      page('b', 'Two.md', '', ['Shared']),
      page('s', 'Source.md', '[[Shared]]'),
    ]);

    expect(graph.incomingEdges('a')).toEqual([]);
    expect(graph.incomingEdges('b')).toEqual([]);
  });

  it('resolves through a unique frontmatter alias when no page is named like the target', () => {
    const graph = buildGraph([page('t', 'Real name.md', '', ['Nickname']), page('s', 'Source.md', '[[Nickname]]')]);

    expect(graph.incomingEdges('t')).toHaveLength(1);
  });

  it('turns an embed into an embed edge whose range includes the leading `!`', () => {
    const source = page('s', 'Source.md', 'Intro\n![[Alpha]]');
    const [edge] = buildGraph([page('t', 'Alpha.md'), source]).incomingEdges('t');

    expect(edge).toMatchObject({ kind: 'embed' });
    expect(source.source.markdown.slice(edge!.startOffset, edge!.endOffset)).toBe('![[Alpha]]');
  });

  it('keeps a link and an embed of the same page as two edges from one source, in source order per kind', () => {
    const graph = buildGraph([page('t', 'Alpha.md'), page('s', 'Source.md', '[[Alpha]] and ![[Alpha]]')]);

    expect(graph.incomingEdges('t').map((edge) => edge.kind).sort()).toEqual(['embed', 'link']);
  });

  it('has no incoming edges for a page nothing references, and no edge for a missing target', () => {
    const graph = buildGraph([page('t', 'Alpha.md'), page('s', 'Source.md', '[[Nowhere]]')]);

    expect(graph.incomingEdges('t')).toEqual([]);
    expect(graph.incomingEdges('s')).toEqual([]);
  });

  it('builds its index once: repeated lookups return the same array', () => {
    const graph = buildGraph([page('t', 'Alpha.md'), page('s', 'Source.md', '[[Alpha]]')]);

    expect(graph.incomingEdges('t')).toHaveLength(1);
    expect(graph.incomingEdges('t')).toBe(graph.incomingEdges('t'));
  });
});

describe('Vault.knowledgeGraph() backlinks', () => {
  const makeVault = (pages: Page[]) =>
    new Vault(
      ROOT,
      pages,
      [],
      new TagBuilder().build(pages, new Map()),
      new TaskBuilder().build(pages),
      [],
      // Handed in like VaultBuilder hands it: derived from every page at scan time.
      buildGraph(pages),
      new VaultProjectionBuilder(),
      new Map()
    );

  it('resolves vault-relative links, and returns the same graph (and index) until a mutation', () => {
    const vault = makeVault([page('t', 'Projects/Alpha.md'), page('s', 'Source.md', '[[Projects/Alpha]]')]);
    const graph = vault.knowledgeGraph();

    expect(graph.incomingEdges('t')).toHaveLength(1);
    expect(vault.knowledgeGraph()).toBe(graph);
  });

  it('reflects an edit: a new reference appears and a removed one disappears after replacePage', () => {
    const target = page('t', 'Alpha.md');
    const vault = makeVault([target, page('s', 'Source.md', 'nothing yet')]);

    expect(vault.knowledgeGraph().incomingEdges('t')).toEqual([]);

    vault.replacePage(page('s', 'Source.md', 'now [[Alpha]]'));
    expect(vault.knowledgeGraph().incomingEdges('t')).toHaveLength(1);

    vault.replacePage(page('s', 'Source.md', 'gone again'));
    expect(vault.knowledgeGraph().incomingEdges('t')).toEqual([]);
  });
});
