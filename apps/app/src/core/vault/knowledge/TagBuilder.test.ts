import { describe, expect, it } from 'vitest';
import { TagBuilder } from './TagBuilder';
import type { Page } from '../models';

function makePage(
  name: string,
  tagNames: readonly string[],
  type: Page['type'] = 'note'
): Page {
  return {
    id: `page-${name}`,
    type,
    name,
    path: `/vault/${name}.md`,
    parentId: null,
    metadata: {
      icon: null,
      cover: null,
      description: '',
      favorite: false,
      status: 'active',
      archivedAt: null,
      originalParentId: null,
      originalPath: null,
      createdAt: null,
      updatedAt: null,
    },
    source: { markdown: '' },
    analysis: {
      headings: [],
      aliases: [],
      blockReferences: [],
      tasks: [],
      tags: tagNames.map((tagName) => ({ name: tagName, sourcePageId: `page-${name}` })),
      links: [],
      embeds: [],
    },
  };
}

describe('TagBuilder', () => {
  it('produces one Tag per unique occurrence name with no metadata', () => {
    const builder = new TagBuilder();
    const tags = builder.build([makePage('a', ['project', 'design']), makePage('b', ['project'])]);

    expect(tags).toHaveLength(2);
    expect(tags.find((tag) => tag.name === 'project')?.icon).toBeUndefined();
    expect(tags.find((tag) => tag.name === 'design')?.icon).toBeUndefined();
  });

  it('enriches a Tag with metadata matching its occurrence name', () => {
    const builder = new TagBuilder();
    const tags = builder.build(
      [makePage('a', ['project'])],
      new Map([['project', { icon: '📦' }]])
    );

    expect(tags).toEqual([{ name: 'project', icon: '📦', favorite: false, usageCount: 1 }]);
  });

  it('never manufactures a Tag from metadata alone — markdown determines existence', () => {
    const builder = new TagBuilder();
    const tags = builder.build(
      [makePage('a', ['project'])],
      new Map([
        ['project', { icon: '📦' }],
        ['orphaned', { icon: '👻' }],
      ])
    );

    expect(tags).toHaveLength(1);
    expect(tags[0]!.name).toBe('project');
  });

  it('sorts tags alphabetically, case-insensitively, regardless of occurrence order', () => {
    const builder = new TagBuilder();
    // Occurrence names are already lowercased by TagExtractor in real
    // usage; constructing 'Architecture' directly here (bypassing the
    // extractor) isolates TagBuilder's own sort comparator — it must order
    // case-insensitively without depending on that upstream normalization,
    // and it must not itself alter the name's casing (that's not its job).
    const tags = builder.build([
      makePage('a', ['travel', 'Architecture', 'design']),
      makePage('b', ['groceries']),
    ]);

    expect(tags.map((tag) => tag.name)).toEqual([
      'Architecture',
      'design',
      'groceries',
      'travel',
    ]);
  });

  it('defaults favorite to false when metadata omits it, including pre-existing files with no favorite field', () => {
    const builder = new TagBuilder();
    const tags = builder.build(
      [makePage('a', ['project'])],
      new Map([['project', { icon: '📦' }]])
    );

    expect(tags[0]!.favorite).toBe(false);
  });

  it('resolves favorite: true from metadata onto the Tag', () => {
    const builder = new TagBuilder();
    const tags = builder.build(
      [makePage('a', ['project'])],
      new Map([['project', { favorite: true }]])
    );

    expect(tags[0]!.favorite).toBe(true);
  });

  describe('usageCount', () => {
    it('counts multiple occurrences within the same page as one', () => {
      const builder = new TagBuilder();
      const tags = builder.build([
        makePage('a', ['project', 'project', 'project', 'project', 'project']),
      ]);

      expect(tags[0]!.usageCount).toBe(1);
    });

    it('counts each unique page once, regardless of occurrence count within it', () => {
      const builder = new TagBuilder();
      // Note A: 5 mentions, Note B: 1 mention, Daily Note C: 3 mentions —
      // matches the exact scenario from the requirement: displayed count
      // must be 3 (unique pages), not 9 (total occurrences).
      const tags = builder.build([
        makePage('noteA', ['project', 'project', 'project', 'project', 'project']),
        makePage('noteB', ['project']),
        makePage('dailyC', ['project', 'project', 'project'], 'daily-note'),
      ]);

      expect(tags[0]!.usageCount).toBe(3);
    });

    it('counts notes and daily notes equally, with no type-based distinction', () => {
      const builder = new TagBuilder();
      const tags = builder.build([
        makePage('note', ['project'], 'note'),
        makePage('daily', ['project'], 'daily-note'),
      ]);

      expect(tags[0]!.usageCount).toBe(2);
    });

    it('tracks usageCount independently per tag name', () => {
      const builder = new TagBuilder();
      const tags = builder.build([
        makePage('a', ['project', 'design']),
        makePage('b', ['project']),
      ]);

      expect(tags.find((tag) => tag.name === 'project')?.usageCount).toBe(2);
      expect(tags.find((tag) => tag.name === 'design')?.usageCount).toBe(1);
    });
  });
});
