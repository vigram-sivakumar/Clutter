import { describe, expect, it } from 'vitest';
import { FrontmatterSerializer } from './FrontmatterSerializer';
import { FrontmatterParser } from './FrontmatterParser';
import { PageBuilder } from '../build/PageBuilder';
import { PageRebuilder } from '../build/PageRebuilder';
import type { Page } from '../models/Page';

/**
 * Exercises the full persistence loop:
 *   Page + markdown -> serializeDocument -> parse -> rebuild -> Page
 *
 * This is the exact path a page takes when written to disk and later
 * re-read (either at startup scan or after an external file change).
 */
describe('Document round-trip (serialize -> write -> parse -> rebuild)', () => {
  const serializer = new FrontmatterSerializer();
  const parser = new FrontmatterParser();
  const builder = new PageBuilder();
  const rebuilder = new PageRebuilder();

  function buildInitialPage(): Page {
    return builder.build({
      parentId: null,
      page: {
        path: 'notes/My Note.md',
        directoryPath: 'notes',
        frontmatter: {
          id: 'page-abc',
          type: 'note',
          icon: '📝',
          favorite: true,
          created: '2026-01-01T00:00:00.000Z',
          modified: '2026-01-01T00:00:00.000Z',
        },
        frontmatterAnalysis: { aliases: [] },
        content: 'Original body text.',
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

  it('preserves markdown body content unchanged through the round-trip', () => {
    const page = buildInitialPage();
    const markdown = 'Line one.\nLine two.\n\n- [ ] a task';

    const document = serializer.serializeDocument(page, markdown);
    const parsed = parser.parse(document);
    const rebuilt = rebuilder.rebuild(page, parsed);

    expect(rebuilt.source.markdown).toBe(markdown);
  });

  it('preserves page identity (id) through the round-trip', () => {
    const page = buildInitialPage();
    const document = serializer.serializeDocument(page, page.source.markdown);
    const parsed = parser.parse(document);
    const rebuilt = rebuilder.rebuild(page, parsed);

    expect(rebuilt.id).toBe(page.id);
  });

  it('preserves frontmatter metadata (icon, favorite, created) through the round-trip', () => {
    const page = buildInitialPage();
    const document = serializer.serializeDocument(page, page.source.markdown);
    const parsed = parser.parse(document);
    const rebuilt = rebuilder.rebuild(page, parsed);

    expect(rebuilt.metadata.icon).toBe(page.metadata.icon);
    expect(rebuilt.metadata.favorite).toBe(page.metadata.favorite);
    expect(rebuilt.metadata.createdAt).toBe(page.metadata.createdAt);
  });

  it('round-trips an edited page (changed body + changed favorite) without losing identity or path', () => {
    const page = buildInitialPage();
    const edited: Page = {
      ...page,
      metadata: { ...page.metadata, favorite: false },
    };
    const newMarkdown = 'Edited body.';

    const document = serializer.serializeDocument(edited, newMarkdown);
    const parsed = parser.parse(document);
    const rebuilt = rebuilder.rebuild(edited, parsed);

    expect(rebuilt.id).toBe(page.id);
    expect(rebuilt.path).toBe(page.path);
    expect(rebuilt.source.markdown).toBe(newMarkdown);
    expect(rebuilt.metadata.favorite).toBe(false);
  });

  it('preserves archive metadata through serialize -> parse -> rebuild', () => {
    const page = builder.build({
      parentId: 'folder-projects',
      page: {
        path: 'Archive/Test.md',
        directoryPath: 'Archive',
        frontmatter: {
          id: 'page-archived',
          status: 'archived',
          archivedAt: '2026-07-29T00:00:00.000Z',
          originalPath: '/vault/Projects/Test.md',
          originalParentId: 'folder-projects',
        },
        frontmatterAnalysis: { aliases: [] },
        content: 'Archived body.',
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

    const document = serializer.serializeDocument(page, page.source.markdown);
    const parsed = parser.parse(document);
    const rebuilt = rebuilder.rebuild(page, parsed);

    expect(rebuilt.metadata.status).toBe('archived');
    expect(rebuilt.metadata.archivedAt).toBe('2026-07-29T00:00:00.000Z');
    expect(rebuilt.metadata.originalPath).toBe('/vault/Projects/Test.md');
    expect(rebuilt.metadata.originalParentId).toBe('folder-projects');
  });

  it('preserves archive metadata through serialize -> parse -> PageBuilder reload', () => {
    const page = builder.build({
      parentId: 'folder-archive',
      page: {
        path: '/vault/Archive/Test.md',
        directoryPath: '/vault/Archive',
        frontmatter: {
          id: 'page-archived',
          status: 'archived',
          archivedAt: '2026-07-29T00:00:00.000Z',
          originalPath: '/vault/Projects/Test.md',
          originalParentId: 'folder-projects',
        },
        frontmatterAnalysis: { aliases: [] },
        content: 'Archived body.',
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

    const document = serializer.serializeDocument(page, page.source.markdown);
    const parsed = parser.parse(document);

    const reloaded = builder.build({
      parentId: 'folder-archive',
      page: {
        path: '/vault/Archive/Test.md',
        directoryPath: '/vault/Archive',
        frontmatter: parsed.frontmatter,
        frontmatterAnalysis: parsed.frontmatterAnalysis,
        content: parsed.body,
        analysis: parsed.analysis,
      },
    });

    expect(reloaded.metadata.status).toBe('archived');
    expect(reloaded.metadata.archivedAt).toBe('2026-07-29T00:00:00.000Z');
    expect(reloaded.metadata.originalPath).toBe('/vault/Projects/Test.md');
    expect(reloaded.metadata.originalParentId).toBe('folder-projects');
  });
});
