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
});
