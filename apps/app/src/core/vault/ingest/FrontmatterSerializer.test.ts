import { describe, expect, it } from 'vitest';
import { FrontmatterSerializer } from './FrontmatterSerializer';
import { FrontmatterParser } from './FrontmatterParser';
import type { Page } from '../models/Page';

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    id: 'page-123',
    type: 'note',
    name: 'My Note',
    path: 'My Note.md',
    parentId: null,
    metadata: {
      icon: '📝',
      cover: null,
      coverHidden: false,
      coverLayout: 'side' as const,
      coverPositionAbove: 50,
      coverPositionSide: 50,
      description: null,
      favorite: true,
      status: 'active',
      archivedAt: null,
      originalParentId: null,
      originalPath: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    },
    source: {
      markdown: 'Hello world',
    },
    analysis: {
      headings: [],
      aliases: [],
      blockReferences: [],
      tasks: [],
      tags: [],
      links: [],
      embeds: [],
    },
    ...overrides,
  };
}

describe('FrontmatterSerializer round-trip', () => {
  const serializer = new FrontmatterSerializer();
  const parser = new FrontmatterParser();

  it('preserves id, favorite, icon, status, createdAt, updatedAt through serialize -> parse', () => {
    const page = makePage();

    const frontmatterBlock = serializer.serializePage(page);
    const parsed = parser.parse(`${frontmatterBlock}\n`);

    expect(parsed.frontmatter.id).toBe(page.id);
    expect(parsed.frontmatter.favorite).toBe(page.metadata.favorite);
    expect(parsed.frontmatter.icon).toBe(page.metadata.icon);
    // FrontmatterSerializer.serializePage does not emit a "status" key by
    // its documented field list (see entries[] in FrontmatterSerializer);
    // "status" is written under the "status" key so parse should recover it.
    expect(parsed.frontmatter.status).toBe(page.metadata.status);
    expect(parsed.frontmatter.created).toBe(page.metadata.createdAt);
    expect(parsed.frontmatter.modified).toBe(page.metadata.updatedAt);
  });

  // A page's Daily Note vs. Note role is derived from its current path at
  // runtime, never persisted — serializing `type` would be redundant,
  // stale-prone metadata (see the Page.type investigation).
  it('never writes a "type" field, regardless of the page\'s current type', () => {
    const notePage = makePage();
    const dailyNotePage = makePage({ type: 'daily-note' });

    expect(serializer.serializePage(notePage)).not.toContain('type:');
    expect(serializer.serializePage(dailyNotePage)).not.toContain('type:');
  });

  it('produces deterministic output for identical Page models', () => {
    const page = makePage();

    const first = serializer.serializePage(page);
    const second = serializer.serializePage(page);

    expect(first).toBe(second);
  });

  it('omits coverLayout when it is the default ("side")', () => {
    const page = makePage();

    const frontmatterBlock = serializer.serializePage(page);

    expect(frontmatterBlock).not.toContain('coverLayout');
  });

  it('writes and round-trips a non-default coverLayout ("above")', () => {
    const page = makePage({
      metadata: { ...makePage().metadata, coverLayout: 'above' },
    });

    const frontmatterBlock = serializer.serializePage(page);
    const parsed = parser.parse(`${frontmatterBlock}\n`);

    expect(frontmatterBlock).toContain('coverLayout: above');
    expect(parsed.frontmatter.coverLayout).toBe('above');
  });

  it('omits undefined optional fields rather than emitting "undefined"', () => {
    const page = makePage({
      metadata: {
        ...makePage().metadata,
        icon: null,
        cover: null,
        description: null,
        archivedAt: null,
      },
    });

    const frontmatterBlock = serializer.serializePage(page);

    expect(frontmatterBlock).not.toContain('undefined');
  });

  it('round-trips metadata.tags as a block list', () => {
    const page = makePage({
      metadata: { ...makePage().metadata, tags: ['Project', 'Design'] },
    });

    const frontmatterBlock = serializer.serializePage(page);
    const parsed = parser.parse(`${frontmatterBlock}\n`);

    expect(parsed.frontmatter.tags).toEqual(['Project', 'Design']);
  });

  it('omits the tags key entirely when there are no tags', () => {
    const page = makePage({ metadata: { ...makePage().metadata, tags: [] } });

    const frontmatterBlock = serializer.serializePage(page);

    expect(frontmatterBlock).not.toContain('tags');
  });
});

describe('unowned frontmatter preservation', () => {
  const content = [
    '---',
    'id: abc',
    'author: Jane',
    'aliases:',
    '  - Alt One',
    '  - Alt Two',
    'meta:',
    '  nested: yes',
    '',
    '  other: 2',
    'favorite: true',
    '---',
    'body',
  ].join('\n');

  it('captures non-owned keys (including aliases and nested blocks) verbatim', async () => {
    const { FrontmatterParser } = await import('./FrontmatterParser');
    const parsed = new FrontmatterParser().parse(content);
    expect(parsed.frontmatter.unownedLines).toEqual([
      'author: Jane',
      'aliases:',
      '  - Alt One',
      '  - Alt Two',
      'meta:',
      '  nested: yes',
      '',
      '  other: 2',
    ]);
    expect(parsed.frontmatter.favorite).toBe(true);
    expect(parsed.frontmatterAnalysis.aliases.map((a) => a.value)).toEqual([
      'Alt One',
      'Alt Two',
    ]);
  });

  it('round-trips unowned lines through rebuild + serializeDocument', async () => {
    const { FrontmatterParser } = await import('./FrontmatterParser');
    const { PageBuilder } = await import('./PageBuilder');
    const { PageRebuilder } = await import('./PageRebuilder');
    const parser = new FrontmatterParser();
    const parsed = parser.parse(content);
    const page = new PageBuilder().build({
      parentId: null,
      page: {
        path: '/v/n.md',
        directoryPath: '/v',
        frontmatter: parsed.frontmatter,
        frontmatterAnalysis: parsed.frontmatterAnalysis,
        content: parsed.body,
        analysis: parsed.analysis,
      },
    });
    const out = new FrontmatterSerializer().serializeDocument(page, 'body');
    const reparsed = parser.parse(out);
    expect(reparsed.frontmatter.unownedLines).toEqual(parsed.frontmatter.unownedLines);
    expect(reparsed.frontmatter.favorite).toBe(true);
    expect(new PageRebuilder().rebuild(page, reparsed).analysis.aliases).toHaveLength(2);
  });

  it('does not preserve the retired `type` key', async () => {
    const { FrontmatterParser } = await import('./FrontmatterParser');
    const parsed = new FrontmatterParser().parse('---\nid: a\ntype: note\n---\n');
    expect(parsed.frontmatter.unownedLines).toBeUndefined();
  });
});
