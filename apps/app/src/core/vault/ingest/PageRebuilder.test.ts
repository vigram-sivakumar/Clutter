import { describe, expect, it } from 'vitest';
import { PageBuilder } from './PageBuilder';
import { PageRebuilder } from './PageRebuilder';
import type { Page } from '../models/Page';

describe('PageRebuilder', () => {
  const builder = new PageBuilder();
  const rebuilder = new PageRebuilder();

  function buildPage(overrides: Partial<Page> = {}): Page {
    const page = builder.build({
      parentId: null,
      page: {
        path: 'notes/My Note.md',
        directoryPath: 'notes',
        frontmatter: { id: 'page-abc' },
        frontmatterAnalysis: { aliases: [] },
        content: 'Body text.',
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

    return { ...page, ...overrides };
  }

  const emptyParsed = (frontmatter: Record<string, unknown> = {}) => ({
    frontmatter,
    frontmatterAnalysis: { aliases: [] },
    body: 'Body text.',
    analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
  });

  describe('dates (ADR-057, ADR-058)', () => {
    it('keeps no date in the page: a created / modified value in the frontmatter is not read, and none is invented', () => {
      const rebuilt = rebuilder.rebuild(buildPage(), emptyParsed({ created: true, modified: true }));

      expect(rebuilt.metadata).not.toHaveProperty('createdAt');
      expect(rebuilt.metadata).not.toHaveProperty('updatedAt');
    });

    it('takes fileTimes from the argument and never retains the previous page\'s', () => {
      const old = { createdAt: '2020-01-01T00:00:00.000Z', modifiedAt: '2020-01-02T00:00:00.000Z' };
      const fresh = { createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-02T00:00:00.000Z' };
      const page = { ...buildPage(), fileTimes: old };

      expect(rebuilder.rebuild(page, emptyParsed(), fresh).fileTimes).toEqual(fresh);
      expect(rebuilder.rebuild(page, emptyParsed()).fileTimes).toBeUndefined();
    });
  });

  it('reads originalPath from parsed frontmatter when the existing page has null', () => {
    const page = buildPage({
      metadata: {
        ...buildPage().metadata,
        originalPath: null,
      },
    });

    const parsed = {
      frontmatter: { originalPath: '/vault/Projects/Test.md' },
      frontmatterAnalysis: { aliases: [] },
      body: 'Body text.',
      analysis: {
        headings: [],
        blockReferences: [],
        tasks: [],
        tags: [],
        links: [],
        embeds: [],
      },
    };

    const rebuilt = rebuilder.rebuild(page, parsed);

    expect(rebuilt.metadata.originalPath).toBe('/vault/Projects/Test.md');
  });

  it('preserves the existing metadata.tags when a reparse\'s frontmatter omits the key — never re-derives from the body', () => {
    const page = buildPage({
      metadata: { ...buildPage().metadata, tags: ['Project', 'Design'] },
    });

    const parsed = {
      frontmatter: {},
      frontmatterAnalysis: { aliases: [] },
      // The body now has a completely different inline tag — if tags
      // were re-derived from this on every rebuild, frontmatter would
      // no longer be independent metadata.
      body: 'Something new. #unrelated',
      analysis: {
        headings: [],
        blockReferences: [],
        tasks: [],
        tags: [{ name: 'unrelated', startOffset: 0, endOffset: 10 }],
        links: [],
        embeds: [],
      },
    };

    const rebuilt = rebuilder.rebuild(page, parsed);

    expect(rebuilt.metadata.tags).toEqual(['Project', 'Design']);
  });

  it('adopts the parsed frontmatter tags once the file actually declares them', () => {
    const page = buildPage({
      metadata: { ...buildPage().metadata, tags: ['Project'] },
    });

    const parsed = {
      frontmatter: { tags: ['Renamed Topic'] },
      frontmatterAnalysis: { aliases: [] },
      body: 'Body text.',
      analysis: {
        headings: [],
        blockReferences: [],
        tasks: [],
        tags: [],
        links: [],
        embeds: [],
      },
    };

    const rebuilt = rebuilder.rebuild(page, parsed);

    expect(rebuilt.metadata.tags).toEqual(['Renamed Topic']);
  });
});
