import { describe, expect, it } from 'vitest';
import { TagBuilder } from './TagBuilder';
import type { Page } from '../models';

function makePage(
  name: string,
  tagNames: readonly string[],
  type: Page['type'] = 'note',
  frontmatterTags?: readonly string[]
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
      coverHidden: false,
      coverLayout: 'side' as const,
      coverPositionAbove: 50,
      coverPositionSide: 50,
      description: '',
      favorite: false,
      status: 'active',
      archivedAt: null,
      originalParentId: null,
      originalPath: null,
      createdAt: null,
      updatedAt: null,
      ...(frontmatterTags && { tags: frontmatterTags }),
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

    expect(tags).toEqual([
      { name: 'project', icon: '📦', favorite: false, declared: true, usageCount: 1 },
    ]);
  });

  it('a declared tag no note uses is still a Tag, with zero usage — tag existence is used ∪ declared', () => {
    const builder = new TagBuilder();
    const tags = builder.build(
      [makePage('a', ['design'])],
      new Map([
        ['design', {}],
        ['research', { icon: '🔬', favorite: true }],
      ])
    );

    expect(tags).toEqual([
      { name: 'design', icon: undefined, favorite: false, declared: true, usageCount: 1 },
      { name: 'research', icon: '🔬', favorite: true, declared: true, usageCount: 0 },
    ]);
  });

  it('with no notes at all, every declared tag exists', () => {
    const tags = new TagBuilder().build([], new Map([['design', {}], ['research', {}]]));

    expect(tags.map((tag) => [tag.name, tag.usageCount])).toEqual([
      ['design', 0],
      ['research', 0],
    ]);
  });

  it('a declared-only tag shows its stored spelling, else its canonical serialized key', () => {
    const tags = new TagBuilder().build(
      [],
      new Map([
        ['ios', { name: 'iOS' }],
        ['product design', {}],
      ])
    );

    expect(tags.map((tag) => tag.name)).toEqual(['iOS', 'product-design']);
  });

  it('a used tag shows the spelling Markdown uses, not the stored one', () => {
    const tags = new TagBuilder().build(
      [makePage('a', ['IOS'])],
      new Map([['ios', { name: 'iOS' }]])
    );

    expect(tags.map((tag) => tag.name)).toEqual(['IOS']);
  });

  it('a used, never-configured tag is not declared', () => {
    const [tag] = new TagBuilder().build([makePage('a', ['design'])]);

    expect(tag!.declared).toBe(false);
  });

  it('inline and frontmatter usage of the same name are one tag on one page', () => {
    const tags = new TagBuilder().build([makePage('a', ['design'], 'note', ['design', 'Design'])]);

    expect(tags).toHaveLength(1);
    expect(tags[0]!.usageCount).toBe(1);
  });

  it('Unicode names group by NFKC + case folding, and invisible characters never create a look-alike tag', () => {
    const tags = new TagBuilder().build([
      makePage('a', ['Café']),
      makePage('b', ['cafe\u0301']),
      makePage('c', ['de\u200Bsign', 'design']),
    ]);

    expect(tags.map((tag) => [tag.name, tag.usageCount])).toEqual([
      ['Café', 2],
      ['de\u200Bsign', 1],
    ]);
  });

  it('sorts tags alphabetically, case-insensitively, regardless of occurrence order', () => {
    const builder = new TagBuilder();
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

  describe('casing', () => {
    it('preserves a single, consistently-cased tag name exactly as typed', () => {
      const builder = new TagBuilder();
      const tags = builder.build([makePage('a', ['ProJET'])]);

      expect(tags[0]!.name).toBe('ProJET');
    });

    it('merges differently-cased occurrences of the same tag, keeping the first-typed casing', () => {
      const builder = new TagBuilder();
      // #Project (page a, processed first) and #project (page b) are the
      // same tag for dedup/counting purposes — normalizeTagName() decides
      // that — but the stored, displayed name is never rewritten to
      // lowercase; it's exactly what was first encountered.
      const tags = builder.build([
        makePage('a', ['Project']),
        makePage('b', ['project']),
      ]);

      expect(tags).toHaveLength(1);
      expect(tags[0]!.name).toBe('Project');
      expect(tags[0]!.usageCount).toBe(2);
    });

    it('looks up metadata by normalized key even when occurrence casing differs from the tags.json key', () => {
      const builder = new TagBuilder();
      // tags.json keys are already normalized on read (TagOperations/
      // bootstrap) — this confirms the builder's own lookup is normalized
      // too, so #Project still resolves metadata stored under "project".
      const tags = builder.build(
        [makePage('a', ['Project'])],
        new Map([['project', { icon: '📦' }]])
      );

      expect(tags[0]!.name).toBe('Project');
      expect(tags[0]!.icon).toBe('📦');
    });

    it('merges hyphen- and underscore-separated occurrences of the same tag into one — separators are equivalent identity', () => {
      const builder = new TagBuilder();
      const tags = builder.build([
        makePage('a', ['product-design']),
        makePage('b', ['product_design']),
      ]);

      expect(tags).toHaveLength(1);
      expect(tags[0]!.usageCount).toBe(2);
    });

    it('merges every case AND separator variant of a logical tag into exactly one Tag, no duplicates', () => {
      const builder = new TagBuilder();
      const tags = builder.build([
        makePage('a', ['Product-design']),
        makePage('b', ['product_design']),
        makePage('c', ['PRODUCT-DESIGN']),
        makePage('d', ['product-Design']),
      ]);

      expect(tags).toHaveLength(1);
      expect(tags[0]!.usageCount).toBe(4);
    });

    it('the first-processed occurrence establishes the preferred casing AND separator — later variants (differing in both) never overwrite it', () => {
      const builder = new TagBuilder();
      // Page "a" (processed first) types "Product-design" — that exact
      // spelling, hyphen included, is what's preserved as the Tag's own
      // `name`, even though later pages use a completely different
      // separator and casing for the same logical tag.
      const tags = builder.build([
        makePage('a', ['Product-design']),
        makePage('b', ['product_design']),
        makePage('c', ['PRODUCT-DESIGN']),
      ]);

      expect(tags).toHaveLength(1);
      expect(tags[0]!.name).toBe('Product-design');
    });

    it('a tag with no separator is unaffected by separator-folding — existing single-word behavior is unchanged', () => {
      const builder = new TagBuilder();
      const tags = builder.build([
        makePage('a', ['project']),
        makePage('b', ['design']),
      ]);

      expect(tags).toHaveLength(2);
      expect(tags.map((tag) => tag.name).sort()).toEqual(['design', 'project']);
    });
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

describe('TagBuilder: tags from frontmatter (Properties)', () => {
  it('a tag only in a note\'s frontmatter is a Tag, used by that one note', () => {
    const tags = new TagBuilder().build([makePage('a', [], 'note', ['design', 'research'])]);

    expect(tags.map((tag) => [tag.name, tag.usageCount])).toEqual([
      ['design', 1],
      ['research', 1],
    ]);
  });

  it('the same tag inline and in frontmatter is one Tag, and one note of it', () => {
    const tags = new TagBuilder().build([makePage('a', ['design'], 'note', ['design'])]);

    expect(tags).toHaveLength(1);
    expect(tags[0]!.usageCount).toBe(1);
  });

  it('inline tags and frontmatter tags across notes both contribute, merged under the identity rule', () => {
    const tags = new TagBuilder().build([
      makePage('a', ['Design']),
      makePage('b', [], 'note', ['design', 'research']),
    ]);

    expect(tags.map((tag) => [tag.name, tag.usageCount])).toEqual([
      ['Design', 2],
      ['research', 1],
    ]);
  });

  it('no note using the tag any more means no Tag', () => {
    expect(new TagBuilder().build([makePage('a', [], 'note', [])])).toEqual([]);
  });
});
