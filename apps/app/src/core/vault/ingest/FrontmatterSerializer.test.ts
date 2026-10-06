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

  it('captures non-owned keys (and nested blocks) verbatim; aliases are owned, not captured', async () => {
    const { FrontmatterParser } = await import('./FrontmatterParser');
    const parsed = new FrontmatterParser().parse(content);
    expect(parsed.frontmatter.unownedLines).toEqual([
      'author: Jane',
      'meta:',
      '  nested: yes',
      '',
      '  other: 2',
    ]);
    expect(parsed.frontmatter.favorite).toBe(true);
    expect(parsed.frontmatter.aliases).toEqual(['Alt One', 'Alt Two']);
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
    expect(reparsed.frontmatter.aliases).toEqual(['Alt One', 'Alt Two']);
    expect(new PageRebuilder().rebuild(page, reparsed).analysis.aliases).toHaveLength(2);
  });

  it('does not preserve the retired `type` key', async () => {
    const { FrontmatterParser } = await import('./FrontmatterParser');
    const parsed = new FrontmatterParser().parse('---\nid: a\ntype: note\n---\n');
    expect(parsed.frontmatter.unownedLines).toBeUndefined();
  });
});

describe('aliases frontmatter round-trip', () => {
  const parser = new FrontmatterParser();
  const serializer = new FrontmatterSerializer();

  async function buildPage(content: string): Promise<Page> {
    const { PageBuilder } = await import('./PageBuilder');
    const parsed = parser.parse(content);
    return new PageBuilder().build({
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
  }

  it.each([
    ['a block list', 'aliases:\n  - Alt One\n  - Alt Two', ['Alt One', 'Alt Two']],
    ['a flow list', 'aliases: [Alt One, "Alt, Two"]', ['Alt One', 'Alt, Two']],
    ['a single value', 'aliases: Alt One', ['Alt One']],
    ['quoted block items', 'aliases:\n  - "Alt: One"\n  - \'it\'\'s\'', ['Alt: One', "it's"]],
    ['an empty flow list', 'aliases: []', []],
  ])('reads %s into PageMetadata.aliases and analysis.aliases', async (_label, yaml, expected) => {
    const page = await buildPage(`---\nid: a\n${yaml}\n---\nbody`);

    expect(page.metadata.aliases).toEqual(expected);
    expect(page.analysis.aliases.map((alias) => alias.value)).toEqual(expected);
  });

  it('a save writes every existing alias back, and they reparse identically', async () => {
    const page = await buildPage(
      '---\nid: a\naliases: [Alt One, "Alt, Two", "#hash", "Key: value", 2026, true]\n---\nbody'
    );

    const reparsed = parser.parse(serializer.serializeDocument(page, 'body'));

    expect(page.metadata.aliases).toEqual(['Alt One', 'Alt, Two', '#hash', 'Key: value', '2026', 'true']);
    expect(reparsed.frontmatter.aliases).toEqual(page.metadata.aliases);
    expect(reparsed.frontmatter.unownedLines).toBeUndefined();
  });

  it('writes a block list, quoting only values a plain scalar would misread', () => {
    const page = makePage({
      metadata: {
        ...makePage().metadata,
        aliases: ['Plain', 'He said "hi"', '#hash', 'a: b', '- dash', 'yes'],
      },
    });

    const block = serializer.serializePage(page);

    expect(block).toContain(
      [
        'aliases:',
        '  - Plain',
        '  - He said "hi"',
        '  - "#hash"',
        '  - "a: b"',
        '  - "- dash"',
        '  - "yes"',
      ].join('\n')
    );
    expect(parser.parse(`${block}\n`).frontmatter.aliases).toEqual(page.metadata.aliases);
  });

  it('omits the aliases key entirely when there are none', () => {
    const page = makePage({ metadata: { ...makePage().metadata, aliases: [] } });

    expect(serializer.serializePage(page)).not.toContain('aliases');
  });

  it('a metadata patch replaces the list, and the rebuilt page follows the file', async () => {
    const { PageRebuilder } = await import('./PageRebuilder');
    const page = await buildPage('---\nid: a\naliases:\n  - Old\n---\nbody');
    const patched = { ...page, metadata: { ...page.metadata, aliases: ['Old', 'New'] } };

    const rebuilt = new PageRebuilder().rebuild(
      patched,
      parser.parse(serializer.serializeDocument(patched, 'body'))
    );

    expect(rebuilt.metadata.aliases).toEqual(['Old', 'New']);
    expect(rebuilt.analysis.aliases.map((alias) => alias.value)).toEqual(['Old', 'New']);

    // An external edit that drops the key is not resurrected from the old page.
    const externallyCleared = new PageRebuilder().rebuild(rebuilt, parser.parse('---\nid: a\n---\nbody'));
    expect(externallyCleared.metadata.aliases).toEqual([]);
  });
});

describe('serialize(): a page created already holding custom properties', () => {
  it('writes the raw unowned lines after the owned keys, and they read back as the same unowned lines', () => {
    const serializer = new FrontmatterSerializer();
    const text = `${serializer.serialize({ id: 'p1', created: 'c', unownedLines: ['owner: ', 'rank: 3'] })}\nbody`;

    expect(text).toBe('---\nid: p1\ncreated: c\nowner: \nrank: 3\n---\nbody');
    expect(new FrontmatterParser().parse(text).frontmatter.unownedLines).toEqual(['owner: ', 'rank: 3']);
  });

  it('writes nothing extra when there are none', () => {
    expect(new FrontmatterSerializer().serialize({ id: 'p1' })).toBe('---\nid: p1\n---');
  });
});
